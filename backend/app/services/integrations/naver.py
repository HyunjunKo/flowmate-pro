"""네이버 API 핸들러"""
from __future__ import annotations
import httpx
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from .token_manager import get_access_token
from app.db.supabase import get_supabase_admin


async def _get_naver_email(user_id: str) -> str:
    """연동된 네이버 계정 이메일 조회"""
    sb = get_supabase_admin()
    provider = sb.table("integration_providers").select("id").eq("key", "naver").single().execute()
    row = sb.table("user_integrations").select(
        "external_account_email, external_account_id"
    ).eq("user_id", user_id).eq("provider_id", provider.data["id"]).eq("status", "active").single().execute()
    if not row.data:
        raise ValueError("네이버 연동이 필요합니다")
    email = row.data.get("external_account_email")
    if not email:
        raise ValueError("네이버 계정 이메일을 확인할 수 없습니다")
    return email


async def send_email(user_id: str, config: dict) -> dict:
    """
    네이버 SMTP로 이메일 발송.
    네이버는 OAuth mail API를 지원하지 않으므로 SMTP를 사용합니다.
    access_token 필드에 네이버 앱 비밀번호를 저장해야 합니다.
    """
    from app.core.security import decrypt_token
    from app.db.supabase import get_supabase_admin

    sb = get_supabase_admin()
    provider = sb.table("integration_providers").select("id").eq("key", "naver").single().execute()
    integration = sb.table("user_integrations").select(
        "access_token_enc, external_account_email"
    ).eq("user_id", user_id).eq("provider_id", provider.data["id"]).eq("status", "active").single().execute()

    if not integration.data:
        raise ValueError("네이버 연동이 필요합니다. 연동 서비스 페이지에서 연결해주세요.")

    naver_id = integration.data.get("external_account_email", "")
    app_password = decrypt_token(integration.data["access_token_enc"])

    to = config.get("to", "")
    subject = config.get("subject", "")
    body = config.get("body", "")

    if not to or not subject:
        raise ValueError("받는 이메일과 제목은 필수입니다")

    # 네이버 SMTP 발송
    msg = MIMEMultipart("alternative")
    msg["From"] = naver_id
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain", "utf-8"))

    context = ssl.create_default_context()
    try:
        with smtplib.SMTP("smtp.naver.com", 587) as server:
            server.ehlo()
            server.starttls(context=context)
            server.login(naver_id.replace("@naver.com", ""), app_password)
            server.sendmail(naver_id, [to], msg.as_string())
    except smtplib.SMTPAuthenticationError:
        raise ValueError(
            "네이버 SMTP 인증 실패. 네이버 보안 설정 > 외부 앱 사용에서 SMTP를 허용하고 앱 비밀번호를 재설정해주세요."
        )

    return {"sent": True, "to": to, "subject": subject}


async def cafe_post(user_id: str, config: dict) -> dict:
    """네이버 카페 게시글 작성 (Naver Cafe API v2)"""
    token = await get_access_token(user_id, "naver")
    cafe_id = config.get("cafe_id", "")
    board_id = config.get("board_id", "")
    title = config.get("title", "")
    content = config.get("content", "")

    if not cafe_id or not board_id or not title:
        raise ValueError("카페 ID, 게시판 ID, 제목은 필수입니다")

    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"https://openapi.naver.com/v1/cafe/{cafe_id}/menu/{board_id}/articles",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={"subject": title, "content": content},
            timeout=15,
        )
        if res.status_code == 403:
            raise ValueError("네이버 카페 게시 권한이 없습니다. 카페 관리자에게 문의하거나 카페 ID를 확인해주세요.")
        res.raise_for_status()
        data = res.json()

    return {
        "post_id": str(data.get("articleId", "")),
        "posted_at": data.get("writeDate", ""),
        "url": f"https://cafe.naver.com/{cafe_id}/{data.get('articleId', '')}",
    }
