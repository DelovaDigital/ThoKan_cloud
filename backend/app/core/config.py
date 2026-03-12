from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "ThoKan Cloud API"
    app_env: str = "development"
    app_url: str = "http://localhost:3000"
    api_url: str = "http://localhost:8000"

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "thokan_cloud"
    postgres_user: str = "thokan"
    postgres_password: str = "change_me"

    jwt_access_secret: str = Field(default="change_me_access_secret")
    jwt_refresh_secret: str = Field(default="change_me_refresh_secret")
    # Set very long defaults so sessions effectively do not expire by default.
    # Minutes for access token (default ~10 years)
    jwt_access_expires_min: int = 5256000
    # Days for refresh token (default ~10 years)
    jwt_refresh_expires_days: int = 3650
    csrf_secret: str = "change_me_csrf_secret"

    storage_driver: str = "local"
    storage_local_root: str = "./storage"
    storage_encryption_key: str = "change_me_32_plus_chars"

    s3_endpoint: str | None = None
    s3_region: str | None = None
    s3_bucket: str | None = None
    s3_access_key: str | None = None
    s3_secret_key: str | None = None

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "admin@thokan.com"
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False

    rate_limit_per_minute: int = 120
    cors_origins: str = "http://localhost:3000,capacitor://localhost,ionic://localhost"
    
    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS env var (comma-separated) into list"""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()
