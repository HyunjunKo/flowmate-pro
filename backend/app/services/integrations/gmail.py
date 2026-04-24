"""Gmail API 핸들러"""
from __future__ import annotations
import httpx
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from .token_manager import get_access_token


async def send_email(user_id: str, config: dict) -> dict:
    token = await get_access_token(user_id, "gmail")

    to = config.get("to", "")
    cc = config.get("cc", "")
    subject = config.get("subject", "")
    body = config.get("body", "")
    is_html = config.get("is_html", False)

    msg = MIMEMultipart()
    msg["To"] = to
    msg["Subject"] = subject
    if cc:
        msg["Cc"] = cc

    mime_type = "html" if is_html else "plain"
    msg.attach(MIMEText(body, mime_type, "utf-8"))

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"raw": raw},
        )
        res.raise_for_status()
        data = res.json()
        return {"message_id": data.get("id"), "thread_id": data.get("threadId"), "sent": True}


async def get_profile(token: str) -> dict:
    """연동 시 계정 정보 조회"""
    async with httpx.AsyncClient() as client:
        res = await client.get(
            "https://gmail.googleapis.com/gmail/v1/users/me/profile",
            headers={"Authorization": f"Bearer {token}"},
        )
        res.raise_for_status()
        return res.json()
