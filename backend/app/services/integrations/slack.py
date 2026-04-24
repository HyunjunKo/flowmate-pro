"""Slack API 핸들러"""
from __future__ import annotations
import httpx
from .token_manager import get_access_token


async def send_message(user_id: str, config: dict) -> dict:
    token = await get_access_token(user_id, "slack")
    channel = config.get("channel", "")
    message = config.get("message", "")

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://slack.com/api/chat.postMessage",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"channel": channel, "text": message},
        )
        res.raise_for_status()
        data = res.json()
        if not data.get("ok"):
            raise ValueError(f"Slack 오류: {data.get('error', '알 수 없는 오류')}")
        return {"ts": data.get("ts"), "channel": data.get("channel"), "sent": True}
