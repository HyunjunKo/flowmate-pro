from fastapi import APIRouter
from app.api.v1.endpoints import workflows, executions, integrations

api_router = APIRouter()
api_router.include_router(workflows.router)
api_router.include_router(executions.router)
api_router.include_router(integrations.router)
