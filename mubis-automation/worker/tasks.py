from datetime import datetime
import logging
from typing import List

from worker.celery_app import app
from shared.config import get_settings
from shared.db import check_work_permit_expiry, update_job, get_clients_for_automation
from shared.storage import save_automation_document, get_temporary_download_path
from shared.crypto import decrypt_portal_credentials
from worker.browsers.edevlet import ETebligatRobot
from worker.browsers.sgk import SGKRobot

settings = get_settings()
logger = logging.getLogger(__name__)


@app.task(name="worker.tasks.check_work_permit_expiry_task", queue="automation")
def check_work_permit_expiry_task():
    result = check_work_permit_expiry()
    logger.info(
        "Daily work-permit expiry check completed: checked=%s notified=%s",
        result.get("checked", 0),
        result.get("notified", 0),
    )
    return result


@app.task(bind=True, name="worker.tasks.run_automation_job")
def run_automation_job(self, job_id: int, office_id: int, client_ids: List[int] | None, job_types: List[str]):
    """Bir otomasyon job'unu çalıştırır."""
    update_job(job_id, {
        "status": "running",
        "started_at": datetime.now().isoformat(),
    })

    try:
        clients = get_clients_for_automation(office_id=office_id, client_ids=client_ids)
        if not clients:
            raise Exception("Otomasyon için müşteri bulunamadı")

        total_found = 0
        total_downloaded = 0

        for client in clients:
            creds = decrypt_portal_credentials(client.get("portal_credentials"))

            for job_type in job_types:
                if job_type == "etebligat":
                    found, downloaded = _run_etebligat(self, job_id, client, creds)
                elif job_type == "sgk":
                    found, downloaded = _run_sgk(self, job_id, client, creds)
                else:
                    found, downloaded = 0, 0

                total_found += found
                total_downloaded += downloaded

        update_job(job_id, {
            "status": "completed",
            "finished_at": datetime.now().isoformat(),
            "documents_found": total_found,
            "documents_downloaded": total_downloaded,
        })

    except Exception as exc:
        update_job(job_id, {
            "status": "failed",
            "finished_at": datetime.now().isoformat(),
            "error_message": str(exc),
        })
        raise self.retry(exc=exc, countdown=60, max_retries=1)


def _run_etebligat(task, job_id: int, client: dict, creds: dict):
    robot = ETebligatRobot()
    try:
        docs = robot.run(client, creds)
        for doc in docs:
            save_automation_document(
                office_id=client["office_id"],
                client_id=client["id"],
                job_id=job_id,
                document_type="etebligat",
                local_path=doc["local_path"],
                source_id=doc.get("source_id"),
                title=doc.get("title"),
                document_date=doc.get("document_date"),
                metadata=doc.get("metadata", {}),
            )
        return len(docs), len(docs)
    finally:
        robot.close()


def _run_sgk(task, job_id: int, client: dict, creds: dict):
    robot = SGKRobot()
    try:
        docs = robot.run(client, creds)
        for doc in docs:
            doc_type = doc.get("document_type", "sgk_tahakkuk")
            save_automation_document(
                office_id=client["office_id"],
                client_id=client["id"],
                job_id=job_id,
                document_type=doc_type,
                local_path=doc["local_path"],
                source_id=doc.get("source_id"),
                title=doc.get("title"),
                document_date=doc.get("document_date"),
                metadata=doc.get("metadata", {}),
            )
        return len(docs), len(docs)
    finally:
        robot.close()
