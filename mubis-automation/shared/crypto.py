import base64
import json
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from shared.config import get_settings

settings = get_settings()

# Anahtar 32 byte (256 bit) olmalı
_crypto_key: bytes | None = None

def _get_key() -> bytes:
    global _crypto_key
    if _crypto_key is not None:
        return _crypto_key

    key_str = settings.PORTAL_CRYPTO_KEY or os.environ.get("PORTAL_CRYPTO_KEY", "")
    if not key_str:
        raise RuntimeError("PORTAL_CRYPTO_KEY tanımlı değil. Portal şifreleri çözülemez.")

    # Eğer base64 ise çöz
    try:
        decoded = base64.b64decode(key_str, validate=True)
        if len(decoded) == 32:
            _crypto_key = decoded
            return _crypto_key
    except Exception:
        pass

    # Düz metin/hex ise 32 byte'a tamamla/hash'le
    raw = key_str.encode("utf-8")
    if len(raw) == 32:
        _crypto_key = raw
    else:
        import hashlib
        _crypto_key = hashlib.sha256(raw).digest()
    return _crypto_key


def encrypt_password(plain_text: str) -> str:
    """Şifreyi AES-256-GCM ile şifreler, enc:... formatında döndürür."""
    if not plain_text:
        return ""
    if plain_text.startswith("enc:"):
        return plain_text

    key = _get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, plain_text.encode("utf-8"), None)
    combined = nonce + ct
    return "enc:" + base64.b64encode(combined).decode("utf-8")


def decrypt_password(cipher_text: str) -> str:
    """enc:... formatındaki şifreyi çözer."""
    if not cipher_text:
        return ""
    if not cipher_text.startswith("enc:"):
        return cipher_text  # düz metin (geriye uyumluluk)

    key = _get_key()
    aesgcm = AESGCM(key)
    payload = base64.b64decode(cipher_text[4:])
    nonce, ct = payload[:12], payload[12:]
    return aesgcm.decrypt(nonce, ct, None).decode("utf-8")


def decrypt_portal_credentials(portal_credentials: dict | str | None) -> dict:
    """clients.portal_credentials JSONB içindeki şifreli alanları çözer."""
    if not portal_credentials:
        return {}
    if isinstance(portal_credentials, str):
        try:
            portal_credentials = json.loads(portal_credentials)
        except Exception:
            return {}

    result = {}
    for portal, creds in portal_credentials.items():
        if not isinstance(creds, dict):
            continue
        result[portal] = {}
        for k, v in creds.items():
            if k in ("p", "sistem_s", "isyeri_s", "password", "pass") and v:
                result[portal][k] = decrypt_password(v)
            else:
                result[portal][k] = v
    return result
