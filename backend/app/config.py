from functools import lru_cache
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_env: str = "prod"
    database_url: str = f"sqlite:///{ROOT_DIR / 'backend' / 'database' / 'tomchi.db'}"
    storage_dir: Path = ROOT_DIR / "backend" / "storage"
    dist_dir: Path = ROOT_DIR / "dist"
    firmware_dir: Path = ROOT_DIR / "firmware"

    device_key: str = "tomchi-dev-key-change-me"
    admin_username: str = "admin"
    admin_password: str = "tomchi2026"
    admin_token_secret: str = "tomchi-token-secret-change-me"
    admin_token_ttl_seconds: int = Field(default=86400, ge=300, le=2592000)

    port: int = 8000
    report_timezone_offset_minutes: int = 300
    bonus_amount: int = 20000
    bonus_per_press: int = 5000
    bonus_every_visits: int = 5
    pulse_value: int = 1000

    use_vaapi: bool = True
    vaapi_device: str = "/dev/dri/renderD128"
    anpr_enabled: bool = True
    anpr_tesseract_cmd: str = "tesseract"
    anpr_timeout_seconds: int = 5
    anpr_min_frames: int = 5
    anpr_window_size: int = 5
    anpr_agreement_threshold: float = 0.8
    anpr_max_frames: int = 15
    anpr_max_session_seconds: int = 20
    anpr_no_plate_abort_streak: int = 5

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
