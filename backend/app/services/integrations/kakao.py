"""카카오 API 핸들러"""
from __future__ import annotations
import httpx
from .token_manager import get_access_token


async def send_message(user_id: str, config: dict) -> dict:
    """카카오톡 나에게 보내기"""
    token = await get_access_token(user_id, "kakao")
    to = config.get("to", "나에게 보내기")
    message = config.get("message", "")

    if to == "나에게 보내기":
        return await _send_to_me(token, message)
    else:
        # 친구에게 보내기는 카카오 친구 목록 API 필요
        return await _send_to_me(token, message)


async def _send_to_me(token: str, message: str) -> dict:
    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://kapi.kakao.com/v2/api/talk/memo/default/send",
            headers={"Authorization": f"Bearer {token}"},
            data={
                "template_object": f'{{"object_type":"text","text":"{message}","link":{{"web_url":"https://flowmate.pro"}}}}'
            },
        )
        res.raise_for_status()
        return {"result_code": str(res.json().get("result_code", 0)), "sent": True}


async def send_alimtalk(config: dict) -> dict:
    """카카오 알림톡 — 비즈니스 API (솔루션사 경유)"""
    phone = config.get("phone", "")
    template_code = config.get("template_code", "")
    variables = config.get("variables", {})

    # 실제 서비스에서는 coolsms, 알리고 등 알림톡 솔루션사 API 사용
    # 여기서는 구조만 준비
    raise NotImplementedError(
        "알림톡은 카카오 비즈니스 채널 + 솔루션사(coolsms 등) 계약 필요합니다. "
        "dashboard에서 API 키를 등록해주세요."
    )
