from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from uuid import UUID
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import httpx
import os
from app.db.supabase import get_supabase_admin
from app.core.security import encrypt_token

router = APIRouter(prefix="/integrations", tags=["integrations"])


# ── 유틸 ─────────────────────────────────────────────────────────────────────

def _expires_at(seconds: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()


async def _save_integration(
    user_id: str,
    provider_key: str,
    access_token: str,
    refresh_token: Optional[str],
    expires_in: Optional[int],
    external_account_id: Optional[str],
    external_account_email: Optional[str],
    scopes: List[str],
) -> dict:
    sb = get_supabase_admin()
    provider = sb.table("integration_providers").select("id").eq("key", provider_key).single().execute()
    if not provider.data:
        raise HTTPException(status_code=404, detail=f"지원하지 않는 서비스: {provider_key}")

    row = {
        "user_id": user_id,
        "provider_id": provider.data["id"],
        "status": "active",
        "access_token_enc": encrypt_token(access_token),
        "refresh_token_enc": encrypt_token(refresh_token) if refresh_token else None,
        "token_expires_at": _expires_at(expires_in) if expires_in else None,
        "external_account_id": external_account_id,
        "external_account_email": external_account_email,
        "scopes": scopes,
    }
    res = sb.table("user_integrations").upsert(
        row, on_conflict="user_id,provider_id,external_account_id"
    ).execute()
    return res.data[0]


# ── 조회 엔드포인트 ────────────────────────────────────────────────────────────

@router.get("/providers")
async def list_providers():
    sb = get_supabase_admin()
    res = sb.table("integration_providers").select("*").eq("is_available", True).order("is_korean_service", desc=True).execute()
    return res.data


@router.get("/")
async def list_user_integrations(user_id: str):
    sb = get_supabase_admin()
    res = sb.table("user_integrations").select(
        "id, display_name, status, external_account_email, last_used_at, integration_providers(key, display_name, icon_url)"
    ).eq("user_id", user_id).execute()
    return res.data


# ── OAuth 콜백 토큰 교환 ────────────────────────────────────────────────────────

class KakaoCallbackBody(BaseModel):
    code: str
    user_id: str
    redirect_uri: str


@router.post("/oauth/kakao")
async def kakao_oauth_callback(body: KakaoCallbackBody):
    """카카오 authorization code → access token 교환 후 저장"""
    client_id = os.environ.get("KAKAO_CLIENT_ID", "")
    client_secret = os.environ.get("KAKAO_CLIENT_SECRET", "")

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://kauth.kakao.com/oauth/token",
            data={
                "grant_type": "authorization_code",
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": body.redirect_uri,
                "code": body.code,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if not res.is_success:
            raise HTTPException(status_code=400, detail=f"카카오 토큰 교환 실패: {res.text}")
        tokens = res.json()

        # 카카오 사용자 정보 조회
        me_res = await client.get(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        me = me_res.json()

    kakao_id = str(me.get("id", ""))
    email = me.get("kakao_account", {}).get("email")

    integration = await _save_integration(
        user_id=body.user_id,
        provider_key="kakao",
        access_token=tokens["access_token"],
        refresh_token=tokens.get("refresh_token"),
        expires_in=tokens.get("expires_in"),
        external_account_id=kakao_id,
        external_account_email=email,
        scopes=["talk_message"],
    )
    return {"ok": True, "integration_id": integration["id"], "provider_key": "kakao"}


class NaverCallbackBody(BaseModel):
    code: str
    user_id: str
    redirect_uri: str


@router.post("/oauth/naver")
async def naver_oauth_callback(body: NaverCallbackBody):
    """네이버 authorization code → access token 교환 후 저장"""
    client_id = os.environ.get("NAVER_CLIENT_ID", "")
    client_secret = os.environ.get("NAVER_CLIENT_SECRET", "")

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://nid.naver.com/oauth2.0/token",
            params={
                "grant_type": "authorization_code",
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": body.redirect_uri,
                "code": body.code,
                "state": "naver",
            },
        )
        if not res.is_success:
            raise HTTPException(status_code=400, detail=f"네이버 토큰 교환 실패: {res.text}")
        tokens = res.json()

        # 네이버 사용자 정보 조회
        me_res = await client.get(
            "https://openapi.naver.com/v1/nid/me",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        me = me_res.json().get("response", {})

    integration = await _save_integration(
        user_id=body.user_id,
        provider_key="naver",
        access_token=tokens["access_token"],
        refresh_token=tokens.get("refresh_token"),
        expires_in=int(tokens.get("expires_in", 0)) or None,
        external_account_id=me.get("id"),
        external_account_email=me.get("email"),
        scopes=["email", "name"],
    )
    return {"ok": True, "integration_id": integration["id"], "provider_key": "naver"}


class GoogleCallbackBody(BaseModel):
    code: str
    user_id: str
    redirect_uri: str
    scope: str = ""


@router.post("/oauth/google")
async def google_oauth_callback(body: GoogleCallbackBody):
    """Google authorization code → access token 교환 후 저장 (Gmail or Sheets 자동 판별)"""
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "grant_type": "authorization_code",
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": body.redirect_uri,
                "code": body.code,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if not res.is_success:
            raise HTTPException(status_code=400, detail=f"Google 토큰 교환 실패: {res.text}")
        tokens = res.json()

        # 사용자 이메일 조회
        user_res = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        user_info = user_res.json()

    # scope로 provider_key 판별
    scope = body.scope
    if "spreadsheets" in scope:
        provider_key = "google_sheets"
    elif "calendar" in scope:
        provider_key = "google_calendar"
    elif "drive" in scope:
        provider_key = "google_drive"
    else:
        provider_key = "gmail"

    google_id = user_info.get("id")
    email = user_info.get("email")
    scopes = [s for s in scope.split() if s]

    integration = await _save_integration(
        user_id=body.user_id,
        provider_key=provider_key,
        access_token=tokens["access_token"],
        refresh_token=tokens.get("refresh_token"),
        expires_in=tokens.get("expires_in"),
        external_account_id=google_id,
        external_account_email=email,
        scopes=scopes,
    )
    return {"ok": True, "integration_id": integration["id"], "provider_key": provider_key}


class SlackCallbackBody(BaseModel):
    code: str
    user_id: str
    redirect_uri: str


@router.post("/oauth/slack")
async def slack_oauth_callback(body: SlackCallbackBody):
    """Slack authorization code → access token 교환 후 저장"""
    client_id = os.environ.get("SLACK_CLIENT_ID", "")
    client_secret = os.environ.get("SLACK_CLIENT_SECRET", "")

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://slack.com/api/oauth.v2.access",
            data={
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": body.redirect_uri,
                "code": body.code,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        data = res.json()
        if not data.get("ok"):
            raise HTTPException(status_code=400, detail=f"Slack 토큰 교환 실패: {data.get('error')}")

    bot_token = data.get("access_token", "")
    team = data.get("team", {})
    authed_user = data.get("authed_user", {})

    integration = await _save_integration(
        user_id=body.user_id,
        provider_key="slack",
        access_token=bot_token,
        refresh_token=None,
        expires_in=None,
        external_account_id=team.get("id"),
        external_account_email=authed_user.get("id"),  # Slack은 email 대신 user ID 저장
        scopes=data.get("scope", "").split(","),
    )
    return {"ok": True, "integration_id": integration["id"], "provider_key": "slack"}


# ── 기존 직접 저장 엔드포인트 (하위 호환) ──────────────────────────────────────

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
    """직접 토큰 저장 (API 키 방식 등)"""
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
    }, on_conflict="user_id,provider_id,external_account_id").execute()

    return {"ok": True, "integration_id": res.data[0]["id"]}


@router.delete("/{integration_id}")
async def disconnect_integration(integration_id: UUID):
    sb = get_supabase_admin()
    sb.table("user_integrations").update({"status": "revoked"}).eq("id", str(integration_id)).execute()
    return {"ok": True}
