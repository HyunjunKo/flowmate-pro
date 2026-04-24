"""Google Sheets API 핸들러"""
from __future__ import annotations
import httpx
from .token_manager import get_access_token


async def append_row(user_id: str, config: dict) -> dict:
    token = await get_access_token(user_id, "google_sheets")
    spreadsheet_id = config.get("spreadsheet_id", "")
    sheet_name = config.get("sheet_name", "Sheet1")
    values = config.get("values", [])

    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{sheet_name}:append",
            headers={"Authorization": f"Bearer {token}"},
            params={"valueInputOption": "USER_ENTERED", "insertDataOption": "INSERT_ROWS"},
            json={"values": [values]},
        )
        res.raise_for_status()
        data = res.json()
        updates = data.get("updates", {})
        return {
            "updated_range": updates.get("updatedRange"),
            "updated_rows": updates.get("updatedRows", 1),
        }


async def get_rows(user_id: str, config: dict) -> dict:
    token = await get_access_token(user_id, "google_sheets")
    spreadsheet_id = config.get("spreadsheet_id", "")
    range_ = config.get("range", "A:Z")

    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{range_}",
            headers={"Authorization": f"Bearer {token}"},
        )
        res.raise_for_status()
        data = res.json()
        rows = data.get("values", [])
        return {"rows": rows, "total_rows": len(rows)}
