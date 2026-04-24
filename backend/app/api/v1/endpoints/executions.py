from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Any, Optional
from uuid import UUID
from app.db.supabase import get_supabase_admin

router = APIRouter(prefix="/executions", tags=["executions"])


class ExecutionCreate(BaseModel):
    workflow_id: str
    trigger_data: dict[str, Any] = {}
    triggered_by: str


@router.post("/")
async def start_execution(body: ExecutionCreate, background_tasks: BackgroundTasks):
    sb = get_supabase_admin()

    workflow = sb.table("workflows").select("*, workflow_versions!current_version_id(*)").eq("id", body.workflow_id).single().execute()
    if not workflow.data:
        raise HTTPException(status_code=404, detail="워크플로우를 찾을 수 없습니다")
    if workflow.data["status"] != "active":
        raise HTTPException(status_code=400, detail="비활성화된 워크플로우입니다")

    version_id = workflow.data["current_version_id"]

    execution = sb.table("executions").insert({
        "workflow_id": body.workflow_id,
        "workflow_version_id": version_id,
        "triggered_by": body.triggered_by,
        "trigger_type": "manual",
        "trigger_data": body.trigger_data,
        "status": "queued",
    }).execute().data[0]

    sb.table("execution_queue").insert({
        "execution_id": execution["id"],
        "priority": 5,
    }).execute()

    background_tasks.add_task(_run_execution, execution["id"])
    return {"execution_id": execution["id"], "status": "queued"}


async def _run_execution(execution_id: str):
    """실행 엔진 — 추후 Celery worker로 이관"""
    sb = get_supabase_admin()
    sb.table("executions").update({"status": "running", "started_at": "now()"}).eq("id", execution_id).execute()
    # TODO: 노드 순서대로 실행
    sb.table("executions").update({"status": "success", "finished_at": "now()"}).eq("id", execution_id).execute()


@router.get("/{execution_id}")
async def get_execution(execution_id: UUID):
    sb = get_supabase_admin()
    res = sb.table("executions").select("*, execution_node_logs(*)").eq("id", str(execution_id)).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="실행 기록을 찾을 수 없습니다")
    return res.data


@router.get("/")
async def list_executions(workflow_id: str, limit: int = 20, offset: int = 0):
    sb = get_supabase_admin()
    res = sb.table("executions").select("id, status, trigger_type, queued_at, started_at, finished_at, duration_ms").eq("workflow_id", workflow_id).order("created_at", desc=True).limit(limit).offset(offset).execute()
    return res.data


@router.post("/{execution_id}/cancel")
async def cancel_execution(execution_id: UUID):
    sb = get_supabase_admin()
    sb.table("executions").update({"status": "canceled", "finished_at": "now()"}).eq("id", str(execution_id)).eq("status", "queued").execute()
    return {"ok": True}
