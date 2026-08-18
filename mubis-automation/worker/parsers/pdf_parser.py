"""
PDF parser ve OCR yardımcıları.
Robotlar indirilen belgeleri analiz etmek için kullanır.
"""
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

try:
    import pytesseract
    from pdf2image import convert_from_path
    from PIL import Image
except ImportError:
    pytesseract = None
    convert_from_path = None


def extract_text_from_pdf(pdf_path: str) -> str:
    """Önce metin tabanlı PDF okuma, başarısız olursa OCR dene."""
    text = _extract_with_pypdf(pdf_path)
    if text and len(text.strip()) > 50:
        return text

    return _extract_with_ocr(pdf_path)


def _extract_with_pypdf(pdf_path: str) -> str:
    if PdfReader is None:
        return ""
    try:
        reader = PdfReader(pdf_path)
        parts = []
        for page in reader.pages:
            parts.append(page.extract_text() or "")
        return "\n".join(parts)
    except Exception as e:
        print(f"pypdf hatası: {e}")
        return ""


def _extract_with_ocr(pdf_path: str) -> str:
    if convert_from_path is None or pytesseract is None:
        return ""
    try:
        images = convert_from_path(pdf_path, dpi=200)
        parts = []
        for img in images:
            text = pytesseract.image_to_string(img, lang="tur")
            parts.append(text)
        return "\n".join(parts)
    except Exception as e:
        print(f"OCR hatası: {e}")
        return ""


def parse_turkish_amount(value: str) -> float:
    if not value:
        return 0.0
    cleaned = value.replace(".", "").replace(",", ".").replace("TL", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def extract_amounts(text: str) -> list[float]:
    pattern = r"\d{1,3}(?:\.\d{3})*,\d{2}"
    matches = re.findall(pattern, text)
    return [parse_turkish_amount(m) for m in matches]


def parse_date(value: str) -> Optional[str]:
    for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None
