import os
from functools import lru_cache
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Uygulama
    APP_NAME: str = "MUBiS Automation"
    DEBUG: bool = False
    API_KEY: str = "change-me-in-production"

    # Supabase (ana veritabanı)
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    # Yerel PostgreSQL (job log)
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/mubis_automation"

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"

    # Şifreleme (portal şifreleri için - Vercel ile aynı olmalı)
    PORTAL_CRYPTO_KEY: str = ""

    # Depolama
    STORAGE_PROVIDER: str = "supabase"  # supabase | minio
    MINIO_ENDPOINT: str = ""
    MINIO_ACCESS_KEY: str = ""
    MINIO_SECRET_KEY: str = ""
    MINIO_BUCKET: str = "client-documents"

    # Bildirimler
    WHATSAPP_ENABLED: bool = False
    WHATSAPP_API_URL: str = ""
    WHATSAPP_PHONE_NUMBER_ID: str = ""
    WHATSAPP_ACCESS_TOKEN: str = ""

    EMAIL_ENABLED: bool = False
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    SMTP_FROM: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
