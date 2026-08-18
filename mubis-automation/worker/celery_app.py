import os
from celery import Celery
from shared.config import get_settings

settings = get_settings()

app = Celery(
    "mubis_automation",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["worker.tasks"],
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Istanbul",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 saat
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
)
