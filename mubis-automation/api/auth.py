from fastapi import HTTPException, Header, status
from shared.config import get_settings

settings = get_settings()

async def verify_api_key(x_api_key: str = Header(None, alias="X-API-Key")):
    if not x_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="X-API-Key header gerekli")
    if x_api_key != settings.API_KEY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Geçersiz API anahtarı")
    return x_api_key
