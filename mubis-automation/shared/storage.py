import os
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from supabase import create_client
from shared.config import get_settings

settings = get_settings()

_download_dir = Path(__file__).resolve().parent.parent / "downloads"
_download_dir.mkdir(exist_ok=True)


def _supabase_admin():
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise RuntimeError("Supabase ayarları eksik")
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def build_storage_path(office_id: int, client_id: int, document_type: str, filename: str | None = None, year: int | None = None) -> str:
    """Supabase Storage'da kullanılacak dosya yolunu oluşturur."""
    now = datetime.now()
    y = year or now.year

    # Mevcut MUBiS formatına uygun: ofis_oneki/musteri_klasoru/evraklar/YIL/TUR/dosya.pdf
    prefix = f"ofis_{office_id}/" if office_id != 1 else ""
    ext = Path(filename or "document.pdf").suffix or ".pdf"
    safe_name = (filename or f"{document_type}_{int(now.timestamp())}").replace(" ", "_")

    return f"{prefix}musteri_{client_id}/evraklar/{y}/{document_type}/{safe_name}"


def upload_to_supabase(local_path: str, storage_path: str, bucket: str = "client-documents") -> str:
    """Yerel dosyayı Supabase Storage'a yükler ve public URL döndürür."""
    sb = _supabase_admin()

    with open(local_path, "rb") as f:
        content = f.read()

    # Aynı isimde dosya varsa üzerine yaz
    sb.storage.from_(bucket).remove([storage_path])
    res = sb.storage.from_(bucket).upload(storage_path, content, {"content-type": "application/pdf", "upsert": "true"})

    if hasattr(res, "error") and res.error:
        raise RuntimeError(f"Storage upload hatası: {res.error}")

    public_url = sb.storage.from_(bucket).get_public_url(storage_path)
    return public_url


def save_automation_document(
    office_id: int,
    client_id: int,
    job_id: int | None,
    document_type: str,
    local_path: str,
    source_id: str | None = None,
    title: str | None = None,
    document_date: str | None = None,
    metadata: dict | None = None,
) -> dict:
    """İndirilen belgeyi Storage'a yükler ve Supabase automation_documents tablosuna kaydeder."""
    sb = _supabase_admin()

    filename = Path(local_path).name
    storage_path = build_storage_path(office_id, client_id, document_type, filename)
    file_url = upload_to_supabase(local_path, storage_path)

    record = {
        "office_id": office_id,
        "client_id": client_id,
        "job_id": job_id,
        "document_type": document_type,
        "source_id": source_id,
        "title": title or filename,
        "file_path": storage_path,
        "file_url": file_url,
        "document_date": document_date,
        "metadata": metadata or {},
    }

    res = sb.table("automation_documents").insert(record).select().single().execute()
    if hasattr(res, "error") and res.error:
        raise RuntimeError(f"automation_documents insert hatası: {res.error}")

    return res.data


def get_temporary_download_path(extension: str = ".pdf") -> str:
    """Tarayıcıdan indirilecek geçici dosya yolu."""
    name = f"{uuid.uuid4().hex}{extension}"
    path = _download_dir / name
    return str(path)
