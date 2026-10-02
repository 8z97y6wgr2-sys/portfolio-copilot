"""Environment configuration; secrets are never sent to the web client."""
import os
from dataclasses import dataclass, field


@dataclass
class Settings:
    database_url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///./data/ea-inversion.db"))
    app_origin: str = field(default_factory=lambda: os.getenv("APP_ORIGIN", "http://localhost:3000"))
    cookie_secure: bool = field(default_factory=lambda: os.getenv("COOKIE_SECURE", "false").lower() == "true")
    market_api_key: str = field(default_factory=lambda: os.getenv("TWELVE_DATA_API_KEY", ""))
    session_seconds: int = 60 * 60 * 24 * 7
    max_body_bytes: int = 2_000_000
