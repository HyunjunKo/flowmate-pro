"""Google Calendar API 핸들러"""
from __future__ import annotations
import httpx
from datetime import datetime, timezone
from .token_manager import get_access_token


def _parse_datetime(value: str) -> str:
    """
    자연어/부분 날짜 → RFC3339 변환
    '2026-05-01 09:00' → '2026-05-01T09:00:00+09:00'
    """
    import pendulum
    try:
        dt = pendulum.parse(value, strict=False)
        if dt is None:
            dt = pendulum.now("Asia/Seoul")
        # timezone이 없으면 서울 기준
        if dt.timezone_name in ("UTC", None):
            dt = dt.in_timezone("Asia/Seoul")
        return dt.isoformat()
    except Exception:
        return pendulum.now("Asia/Seoul").isoformat()


async def create_event(user_id: str, config: dict) -> dict:
    token = await get_access_token(user_id, "google_calendar")

    title = config.get("title", "")
    start_time = config.get("start_time", "")
    end_time = config.get("end_time", "")
    description = config.get("description", "")
    attendees_raw = config.get("attendees", "")

    if not title or not start_time or not end_time:
        raise ValueError("일정 제목, 시작 시간, 종료 시간은 필수입니다")

    start_dt = _parse_datetime(start_time)
    end_dt = _parse_datetime(end_time)

    # 참석자 파싱 (쉼표 구분)
    attendees = []
    if attendees_raw:
        for email in [e.strip() for e in str(attendees_raw).split(",") if e.strip()]:
            attendees.append({"email": email})

    event_body: dict = {
        "summary": title,
        "description": description,
        "start": {"dateTime": start_dt, "timeZone": "Asia/Seoul"},
        "end":   {"dateTime": end_dt,   "timeZone": "Asia/Seoul"},
    }
    if attendees:
        event_body["attendees"] = attendees

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=event_body,
            timeout=15,
        )
        if res.status_code == 403:
            raise ValueError(
                "Google Calendar 권한이 없습니다. 연동 서비스 페이지에서 Google Calendar 권한으로 재연동해주세요."
            )
        res.raise_for_status()
        data = res.json()

    return {
        "event_id": data.get("id"),
        "event_url": data.get("htmlLink"),
        "title": data.get("summary"),
        "start": data.get("start", {}).get("dateTime"),
        "end":   data.get("end",   {}).get("dateTime"),
        "attendees": [a["email"] for a in data.get("attendees", [])],
    }
