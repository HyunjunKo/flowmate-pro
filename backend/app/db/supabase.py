from functools import lru_cache
from supabase import create_client, Client
from app.core.config import settings


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    return create_client(settings.supabase_url, settings.supabase_anon_key)


@lru_cache(maxsize=1)
def get_supabase_admin() -> Client:
    """service_role 키 사용 — RLS 우회, 서버 내부 전용"""
    return create_client(settings.supabase_url, settings.SUPABASE_SERVICE_ROLE_KEY)
