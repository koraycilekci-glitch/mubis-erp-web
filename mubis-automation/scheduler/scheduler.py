"""
Celery Beat zamanlayıcı.
Her gece belirlenen saatte ofislerin otomasyon ayarlarına göre job oluşturur.
"""
from datetime import datetime

from worker.celery_app import app
from shared.db import get_automation_settings, supabase_admin
from worker.tasks import run_automation_job

@app.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):
    """Günlük kontrol görevini planla."""
    sender.add_periodic_task(
        60.0 * 5,  # her 5 dakikada bir kontrol et (ayarlanabilir)
        check_scheduled_jobs.s(),
        name="check-scheduled-automation-jobs",
    )


@app.task(name="scheduler.scheduler.check_scheduled_jobs")
def check_scheduled_jobs():
    """Zamanı gelen otomasyon job'larını kuyruğa atar."""
    sb = supabase_admin()
    now = datetime.now()
    current_time = now.strftime("%H:%M")

    res = sb.table("automation_settings").select("*").eq("enabled", True).execute()
    settings_rows = res.data or []

    created = 0
    for row in settings_rows:
        office_id = row["office_id"]
        schedule_time = row.get("schedule_time", "02:00")[:5]

        # Tekrar tipine göre kontrol
        repeat = row.get("repeat_type", "daily")
        should_run = False

        if repeat == "daily":
            should_run = True
        elif repeat == "weekly" and now.weekday() == 0:  # Pazartesi
            should_run = True
        elif repeat == "monthly" and now.day == 1:
            should_run = True

        if not should_run or schedule_time != current_time:
            continue

        types = row.get("enabled_types") or ["etebligat", "sgk"]
        clients_res = sb.table("clients").select("id").eq("office_id", office_id).eq("automation_enabled", True).execute()

        for client in clients_res.data or []:
            for job_type in types:
                job = sb.table("automation_jobs").insert({
                    "office_id": office_id,
                    "client_id": client["id"],
                    "job_type": job_type,
                    "status": "pending",
                    "triggered_by": "schedule",
                }).select().single().execute().data

                run_automation_job.delay(job["id"], office_id, [client["id"]], [job_type])
                created += 1

    return {"created_jobs": created}
