from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware

from api.auth import verify_api_key
from api.models import TriggerRequest, JobResponse, HealthResponse, JobType
from shared.config import get_settings
from shared.db import create_job, get_automation_settings, get_clients_for_automation
from worker.celery_app import app as celery_app
from worker.tasks import run_automation_job

settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Başlangıç kontrolü
    print(f"[{settings.APP_NAME}] API başlatılıyor...")
    yield
    print(f"[{settings.APP_NAME}] API kapanıyor...")

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Prod'da Vercel domainiyle sınırlandırılacak
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health():
    return {"status": "ok", "version": "1.0.0"}


@app.post("/jobs/trigger", response_model=JobResponse, dependencies=[Depends(verify_api_key)])
async def trigger_jobs(payload: TriggerRequest, background_tasks: BackgroundTasks):
    """Manuel veya toplu job tetikler."""
    office_id = payload.office_id
    client_ids = payload.client_ids
    types = payload.types or [JobType.ETEBLIGAT, JobType.SGK]

    if not office_id and not client_ids:
        raise HTTPException(status_code=400, detail="office_id veya client_ids gerekli")

    # ofis belirlenmemişse ilk müşteriden oku
    if not office_id and client_ids:
        clients = get_clients_for_automation(client_ids=client_ids)
        if not clients:
            raise HTTPException(status_code=404, detail="Müşteri bulunamadı")
        office_id = clients[0]["office_id"]

    if len(types) == 1:
        # Tek job olarak oluştur (tüm tipler için ayrı ayrı)
        job_type = types[0]
        job = create_job(office_id, client_ids[0] if client_ids and len(client_ids) == 1 else None, job_type, payload.triggered_by.value)
        run_automation_job.delay(job["id"], office_id, client_ids, [job_type])
        return job

    # Her tip için ayrı job
    for t in types:
        job = create_job(office_id, client_ids[0] if client_ids and len(client_ids) == 1 else None, t.value, payload.triggered_by.value)
        run_automation_job.delay(job["id"], office_id, client_ids, [t.value])

    # İlk job'u döndür
    return job


@app.get("/jobs/{job_id}", dependencies=[Depends(verify_api_key)])
async def get_job(job_id: int):
    from shared.db import supabase_admin
    sb = supabase_admin()
    res = sb.table("automation_jobs").select("*").eq("id", job_id).maybe_single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Job bulunamadı")
    return res.data


@app.get("/settings/{office_id}", dependencies=[Depends(verify_api_key)])
async def settings_by_office(office_id: int):
    data = get_automation_settings(office_id)
    if not data:
        raise HTTPException(status_code=404, detail="Ayar bulunamadı")
    return data


@app.post("/jobs/webhook", dependencies=[Depends(verify_api_key)])
async def webhook(payload: dict):
    """Supabase'den ayar değişikliği bildirimi."""
    # TODO: Schedule yeniden yükle
    return {"ok": True}
