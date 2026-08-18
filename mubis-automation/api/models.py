from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

class JobType(str, Enum):
    ETEBLIGAT = "etebligat"
    SGK = "sgk"
    VERGI_DAIRESI = "vergi_dairesi"
    TUM = "tum"

class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class TriggerType(str, Enum):
    SCHEDULE = "schedule"
    MANUAL = "manual"
    BULK = "bulk"

class TriggerRequest(BaseModel):
    office_id: Optional[int] = None
    client_ids: Optional[List[int]] = None
    types: List[JobType] = Field(default=[JobType.ETEBLIGAT, JobType.SGK])
    triggered_by: TriggerType = TriggerType.MANUAL

class JobResponse(BaseModel):
    id: int
    office_id: int
    client_id: Optional[int]
    job_type: str
    status: str
    created_at: datetime

class HealthResponse(BaseModel):
    status: str
    version: str = "1.0.0"
