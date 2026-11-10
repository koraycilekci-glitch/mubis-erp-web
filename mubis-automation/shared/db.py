import os
import re
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
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


def check_work_permit_expiry(today=None):
    sb = supabase_admin()
    reference_date = today or datetime.now(ZoneInfo("Europe/Istanbul")).date()
    start_date = reference_date.isoformat()
    end_date = (reference_date + timedelta(days=30)).isoformat()
    result = sb.table("employees").select(
        "id, client_id, ad_soyad, tc_kimlik, calisma_izni_bitis, aktif"
    ).gte("calisma_izni_bitis", start_date).lte("calisma_izni_bitis", end_date).execute()
    employees = result.data or []
    client_ids = sorted({int(row["client_id"]) for row in employees if row.get("client_id")})
    if not client_ids:
        return {"checked": len(employees), "notified": 0}

    clients_result = sb.table("clients").select("id, office_id").in_("id", client_ids).execute()
    clients_by_id = {int(row["id"]): row for row in clients_result.data or []}
    notified = 0
    for employee in employees:
        tc = re.sub(r"\D", "", str(employee.get("tc_kimlik") or ""))
        if not tc.startswith("9") or employee.get("aktif") is False:
            continue
        client_id = employee.get("client_id")
        if not client_id or int(client_id) not in clients_by_id:
            continue
        expiry = datetime.fromisoformat(employee["calisma_izni_bitis"]).date()
        days_remaining = (expiry - reference_date).days
        response = sb.rpc("notify_work_permit_expiry", {
            "p_employee_id": employee["id"],
            "p_client_id": client_id,
            "p_employee_name": employee.get("ad_soyad") or "Çalışan",
            "p_permit_expiry_date": expiry.isoformat(),
            "p_days_remaining": days_remaining,
        }).execute()
        if response.data is True:
            notified += 1

    return {"checked": len(employees), "notified": notified}
