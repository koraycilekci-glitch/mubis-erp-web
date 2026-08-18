import os
from datetime import datetime
from supabase import create_client
from shared.config import get_settings

settings = get_settings()


def supabase_admin():
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise RuntimeError("SUPABASE_URL veya SUPABASE_SERVICE_KEY eksik")
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


def get_clients_for_automation(office_id: int | None = None, client_ids: list[int] | None = None):
    """Otomasyon için müşterileri ve portal bilgilerini getirir."""
    sb = supabase_admin()
    q = sb.table("clients").select("id, office_id, name, company, vkn, tc, username, portal_credentials, automation_enabled")

    if office_id:
        q = q.eq("office_id", office_id)
    if client_ids:
        q = q.in_("id", client_ids)

    res = q.execute()
    return res.data or []


def get_automation_settings(office_id: int):
    sb = supabase_admin()
    res = sb.table("automation_settings").select("*").eq("office_id", office_id).maybe_single().execute()
    return res.data


def create_job(office_id: int, client_id: int | None, job_type: str, triggered_by: str = "manual"):
    sb = supabase_admin()
    res = sb.table("automation_jobs").insert({
        "office_id": office_id,
        "client_id": client_id,
        "job_type": job_type,
        "status": "pending",
        "triggered_by": triggered_by,
    }).select().single().execute()
    return res.data


def update_job(job_id: int, fields: dict):
    sb = supabase_admin()
    res = sb.table("automation_jobs").update(fields).eq("id", job_id).execute()
    return res.data


def get_pending_jobs():
    """Zamanlayıcı için bekleyen müşteri/job çiftlerini döndürür."""
    sb = supabase_admin()
    now = datetime.now().strftime("%H:%M")

    res = sb.table("automation_settings").select("office_id, enabled_types").eq("enabled", True).execute()
    settings_rows = res.data or []

    jobs = []
    for row in settings_rows:
        office_id = row["office_id"]
        types = row.get("enabled_types") or ["etebligat", "sgk"]

        clients_res = sb.table("clients").select("id").eq("office_id", office_id).eq("automation_enabled", True).execute()
        for client in clients_res.data or []:
            for t in types:
                jobs.append({"office_id": office_id, "client_id": client["id"], "job_type": t})

    return jobs
