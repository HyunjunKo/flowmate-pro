"""사용자 연동 토큰 조회 및 갱신"""
from __future__ import annotations
import httpx
from datetime import datetime, timezone
from app.db.supabase import get_supabase_admin
from app.core.security import decrypt_token, encrypt_token


async def get_access_token(user_id: str, provider_key: str) -> str:
    """유효한 액세스 토큰 반환 — 만료 시 자동 갱신"""
    sb = get_supabase_admin()

    row = sb.table("user_integrations").select(
        "id, access_token_enc, refresh_token_enc, token_expires_at, status"
    ).eq("user_id", user_id).eq("status", "active").execute()

    # provider key로 필터
    provider = sb.table("integration_providers").select("id").eq("key", provider_key).single().execute()
    if not provider.data:
        raise ValueError(f"지원하지 않는 서비스입니다: {provider_key}")

    integration = sb.table("user_integrations").select(
        "id, access_token_enc, refresh_token_enc, token_expires_at"
    ).eq("user_id", user_id).eq("provider_id", provider.data["id"]).eq("status", "active").limit(1).execute()

    if not integration.data:
        raise ValueError(f"{provider_key} 연동이 필요합니다. 연동 서비스 페이지에서 연결해주세요.")

    record = integration.data[0]
    access_token = decrypt_token(record["access_token_enc"])

    # 만료 체크 및 갱신
    if record.get("token_expires_at"):
        expires_at = datetime.fromisoformat(record["token_expires_at"].replace("Z", "+00:00"))
        if expires_at <= datetime.now(timezone.utc) and record.get("refresh_token_enc"):
            access_token = await _refresh_token(record, provider_key)

    return access_token


async def _refresh_token(record: dict, provider_key: str) -> str:
    sb = get_supabase_admin()
    refresh_token = decrypt_token(record["refresh_token_enc"])

    refresh_handlers = {
        "kakao": _refresh_kakao,
        "naver": _refresh_naver,
        "gmail": _refresh_google,
        "google_sheets": _refresh_google,
        "google_calendar": _refresh_google,
        "google_drive": _refresh_google,
    }

    handler = refresh_handlers.get(provider_key)
    if not handler:
        raise ValueError(f"{provider_key} 토큰이 만료되었습니다. 재연동이 필요합니다.")

    new_access, new_expires = await handler(refresh_token)

    sb.table("user_integrations").update({
        "access_token_enc": encrypt_token(new_access),
        "token_expires_at": new_expires,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", record["id"]).execute()

    return new_access


async def _refresh_kakao(refresh_token: str) -> tuple[str, str]:
    from app.core.config import settings
    async with httpx.AsyncClient() as client:
        res = await client.post("https://kauth.kakao.com/oauth/token", data={
            "grant_type": "refresh_token",
            "client_id": settings.KAKAO_CLIENT_ID,
            "client_secret": settings.KAKAO_CLIENT_SECRET,
            "refresh_token": refresh_token,
        })
        res.raise_for_status()
        data = res.json()
        return data["access_token"], _expires_at(data["expires_in"])


async def _refresh_naver(refresh_token: str) -> tuple[str, str]:
    from app.core.config import settings
    async with httpx.AsyncClient() as client:
        res = await client.get("https://nid.naver.com/oauth2.0/token", params={
            "grant_type": "refresh_token",
            "client_id": settings.NAVER_CLIENT_ID,
            "client_secret": settings.NAVER_CLIENT_SECRET,
            "refresh_token": refresh_token,
        })
        res.raise_for_status()
        data = res.json()
        return data["access_token"], _expires_at(data["expires_in"])


async def _refresh_google(refresh_token: str) -> tuple[str, str]:
    from app.core.config import settings
    async with httpx.AsyncClient() as client:
        res = await client.post("https://oauth2.googleapis.com/token", data={
            "grant_type": "refresh_token",
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "refresh_token": refresh_token,
        })
        res.raise_for_status()
        data = res.json()
        return data["access_token"], _expires_at(data["expires_in"])


def _expires_at(seconds: int) -> str:
    from datetime import timedelta
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()
