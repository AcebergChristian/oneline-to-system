from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
DATA_DIR = BACKEND_DIR / "data"
SESSIONS_DIR = DATA_DIR / "sessions"
LOGS_DIR = DATA_DIR / "logs"
PROJECTS_META_PATH = DATA_DIR / "projects.json"
PROJECT_EVENTS_PATH = DATA_DIR / "project_events.jsonl"
PROJECT_RUNS_PATH = DATA_DIR / "project_runs.jsonl"
PROJECT_ROOT = ROOT_DIR / "project"
STREAMS_DIR = DATA_DIR / "streams"


class Settings(BaseSettings):
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4.1-mini"
    ai_memory_window: int = 8
    ai_max_tool_rounds: int = 24
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    frontend_port: int = 5173

    model_config = SettingsConfigDict(
        env_file=str(ROOT_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


def ensure_data_dirs() -> None:
    for path in [DATA_DIR, SESSIONS_DIR, STREAMS_DIR, LOGS_DIR, PROJECT_ROOT]:
        path.mkdir(parents=True, exist_ok=True)
    if not PROJECTS_META_PATH.exists():
        PROJECTS_META_PATH.write_text("[]\n", encoding="utf-8")
    if not PROJECT_EVENTS_PATH.exists():
        PROJECT_EVENTS_PATH.write_text("", encoding="utf-8")
    if not PROJECT_RUNS_PATH.exists():
        PROJECT_RUNS_PATH.write_text("", encoding="utf-8")
