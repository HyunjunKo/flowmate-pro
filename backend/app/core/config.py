from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_NAME: str = "FlowMate Pro"
    APP_ENV: str = "development"
    DEBUG: bool = True
    API_V1_PREFIX: str = "/api/v1"

    # Supabase
    NEXT_PUBLIC_SUPABASE_URL: str
    NEXT_PUBLIC_SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_PROJECT_REF: str

    # JWT
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7일

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Encryption key (토큰 암호화용)
    ENCRYPTION_KEY: str = "change-me-32-bytes-long-key-here!"

    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]

    # 카카오
    KAKAO_CLIENT_ID: str = ""
    KAKAO_CLIENT_SECRET: str = ""
    KAKAO_REDIRECT_URI: str = "http://localhost:3000/oauth/kakao"

    # 네이버
    NAVER_CLIENT_ID: str = ""
    NAVER_CLIENT_SECRET: str = ""
    NAVER_REDIRECT_URI: str = "http://localhost:3000/oauth/naver"

    @property
    def supabase_url(self) -> str:
        return self.NEXT_PUBLIC_SUPABASE_URL

    @property
    def supabase_anon_key(self) -> str:
        return self.NEXT_PUBLIC_SUPABASE_ANON_KEY


settings = Settings()
