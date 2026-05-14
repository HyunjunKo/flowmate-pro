"""Notion API 핸들러"""
from __future__ import annotations
import httpx
from .token_manager import get_access_token


NOTION_VERSION = "2022-06-28"


def _notion_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def _build_properties(title: str, extra: dict | None = None) -> dict:
    """Notion 페이지 properties 빌드"""
    props: dict = {
        "Name": {
            "title": [{"text": {"content": title}}]
        }
    }
    # extra props — 값이 문자열이면 rich_text로 추가
    if extra:
        for key, value in extra.items():
            if key == "Name":
                continue
            if isinstance(value, str):
                props[key] = {"rich_text": [{"text": {"content": str(value)}}]}
            elif isinstance(value, (int, float)):
                props[key] = {"number": value}
            elif isinstance(value, bool):
                props[key] = {"checkbox": value}
    return props


async def create_page(user_id: str, config: dict) -> dict:
    token = await get_access_token(user_id, "notion")

    database_id = config.get("database_id", "").replace("-", "")
    title = config.get("title", "")
    extra_props = config.get("properties", {}) or {}

    if not database_id or not title:
        raise ValueError("데이터베이스 ID와 제목은 필수입니다")

    body = {
        "parent": {"database_id": database_id},
        "properties": _build_properties(title, extra_props if isinstance(extra_props, dict) else {}),
    }

    async with httpx.AsyncClient() as client:
        res = await client.post(
            "https://api.notion.com/v1/pages",
            headers=_notion_headers(token),
            json=body,
            timeout=15,
        )
        if res.status_code == 404:
            raise ValueError(
                "노션 데이터베이스를 찾을 수 없습니다. 데이터베이스 ID를 확인하고, "
                "FlowMate 연동이 해당 데이터베이스에 접근 권한이 있는지 확인해주세요."
            )
        if res.status_code == 401:
            raise ValueError("노션 인증이 만료됐습니다. 연동 서비스 페이지에서 재연동해주세요.")
        res.raise_for_status()
        data = res.json()

    page_url = data.get("url", "")
    return {
        "page_id": data.get("id"),
        "page_url": page_url,
        "title": title,
        "created_time": data.get("created_time"),
    }


async def get_database(user_id: str, database_id: str) -> dict:
    """데이터베이스 정보 조회 (검증용)"""
    token = await get_access_token(user_id, "notion")
    db_id = database_id.replace("-", "")

    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"https://api.notion.com/v1/databases/{db_id}",
            headers=_notion_headers(token),
            timeout=10,
        )
        res.raise_for_status()
        return res.json()
