from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Optional, List
from uuid import UUID
from app.db.supabase import get_supabase_admin

router = APIRouter(prefix="/workflows", tags=["workflows"])


class WorkflowCreate(BaseModel):
    name: str
    description: Optional[str] = None
    tags: List[str] = []
    icon: Optional[str] = None
    color: Optional[str] = None


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None


class VersionSave(BaseModel):
    nodes: List[dict]
    edges: List[dict]
    variables: dict = {}
    change_summary: Optional[str] = None


@router.get("/")
async def list_workflows(user_id: str):
    sb = get_supabase_admin()
    res = sb.table("workflows").select("*").eq("user_id", user_id).order("updated_at", desc=True).execute()
    return res.data


@router.post("/")
async def create_workflow(user_id: str, body: WorkflowCreate):
    sb = get_supabase_admin()
    res = sb.table("workflows").insert({
        "user_id": user_id,
        **body.model_dump(exclude_none=True),
    }).execute()
    return res.data[0]


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: UUID):
    sb = get_supabase_admin()
    res = sb.table("workflows").select("*, workflow_versions(*)").eq("id", str(workflow_id)).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="워크플로우를 찾을 수 없습니다")
    return res.data


@router.patch("/{workflow_id}")
async def update_workflow(workflow_id: UUID, body: WorkflowUpdate):
    sb = get_supabase_admin()
    res = sb.table("workflows").update(body.model_dump(exclude_none=True)).eq("id", str(workflow_id)).execute()
    return res.data[0]


@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: UUID):
    sb = get_supabase_admin()
    sb.table("workflows").update({"status": "archived"}).eq("id", str(workflow_id)).execute()
    return {"ok": True}


@router.post("/{workflow_id}/versions")
async def save_version(workflow_id: UUID, user_id: str, body: VersionSave):
    sb = get_supabase_admin()

    last = sb.table("workflow_versions").select("version_number").eq("workflow_id", str(workflow_id)).order("version_number", desc=True).limit(1).execute()
    next_version = (last.data[0]["version_number"] + 1) if last.data else 1

    version = sb.table("workflow_versions").insert({
        "workflow_id": str(workflow_id),
        "version_number": next_version,
        "nodes": body.nodes,
        "edges": body.edges,
        "variables": body.variables,
        "created_by": user_id,
        "change_summary": body.change_summary,
    }).execute().data[0]

    sb.table("workflows").update({
        "current_version_id": version["id"],
        "updated_at": "now()",
    }).eq("id", str(workflow_id)).execute()

    return version


@router.get("/{workflow_id}/versions")
async def list_versions(workflow_id: UUID):
    sb = get_supabase_admin()
    res = sb.table("workflow_versions").select("id, version_number, change_summary, created_by, created_at").eq("workflow_id", str(workflow_id)).order("version_number", desc=True).execute()
    return res.data
