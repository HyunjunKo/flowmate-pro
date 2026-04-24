from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from uuid import UUID
from typing import Optional, List
from app.db.supabase import get_supabase_admin
from app.core.security import encrypt_token, decrypt_token

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/providers")
async def list_providers():
    sb = get_supabase_admin()
    res = sb.table("integration_providers").select("*").eq("is_available", True).order("is_korean_service", desc=True).execute()
    return res.data


@router.get("/")
async def list_user_integrations(user_id: str):
    sb = get_supabase_admin()
    res = sb.table("user_integrations").select("id, display_name, status, external_account_email, last_used_at, integration_providers(key, display_name, icon_url)").eq("user_id", user_id).execute()
    return res.data


class OAuthCallbackBody(BaseModel):
    user_id: str
    provider_key: str
    access_token: str
    refresh_token: Optional[str] = None
    token_expires_at: Optional[str] = None
    external_account_id: Optional[str] = None
    external_account_email: Optional[str] = None
    scopes: List[str] = []


@router.post("/connect")
async def connect_integration(body: OAuthCallbackBody):
    """OAuth 콜백 후 토큰 저장"""
    sb = get_supabase_admin()

    provider = sb.table("integration_providers").select("id").eq("key", body.provider_key).single().execute()
    if not provider.data:
        raise HTTPException(status_code=404, detail="지원하지 않는 서비스입니다")

    res = sb.table("user_integrations").upsert({
        "user_id": body.user_id,
        "provider_id": provider.data["id"],
        "status": "active",
        "access_token_enc": encrypt_token(body.access_token),
        "refresh_token_enc": encrypt_token(body.refresh_token) if body.refresh_token else None,
        "token_expires_at": body.token_expires_at,
        "external_account_id": body.external_account_id,
        "external_account_email": body.external_account_email,
        "scopes": body.scopes,
    }, on_conflict="user_id, provider_id, external_account_id").execute()

    return {"ok": True, "integration_id": res.data[0]["id"]}


@router.delete("/{integration_id}")
async def disconnect_integration(integration_id: UUID):
    sb = get_supabase_admin()
    sb.table("user_integrations").update({"status": "revoked"}).eq("id", str(integration_id)).execute()
    return {"ok": True}
