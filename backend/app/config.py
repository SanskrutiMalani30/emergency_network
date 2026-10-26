from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    APP_NAME: str = "Rakshak AI — Tactical Crisis Response API"
    APP_VERSION: str = "2.4.0"
    DEBUG: bool = True
    
    # ScyllaDB Settings
    SCYLLA_HOSTS: List[str] = ["127.0.0.1"]
    SCYLLA_PORT: int = 9042
    SCYLLA_KEYSPACE: str = "rakshak_tactical"
    SCYLLA_USER: str = ""
    SCYLLA_PASSWORD: str = ""
    SCYLLA_LOCAL_DC: str = "datacenter1"
    SCYLLA_TIMEOUT_SECONDS: float = 3.0
    SCYLLA_CONNECT_TIMEOUT: float = 5.0
    
    # AI Engine Settings
    AI_CONFIDENCE_THRESHOLD: float = 0.70
    AI_MOCK_FALLBACK: bool = True
    
    # Demo Emergencies & Sector Center (CASCADE '26 / Nagpur Tactical Sector)
    DEMO_MODE_ENABLED: bool = True
    DEMO_CENTER_LAT: float = 21.1458
    DEMO_CENTER_LNG: float = 79.0882
    
    # CORS
    CORS_ORIGINS: List[str] = ["*"]
    
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

settings = Settings()
