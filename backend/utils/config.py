from functools import lru_cache
from pathlib import Path
import re
from urllib.parse import urlsplit

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
    public_base_url: str = ""
    project_preview_url_template: str = ""
    project_backend_url_template: str = ""

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


def project_index(project_slug: str) -> int:
    match = re.search(r"(\d+)$", project_slug)
    return int(match.group(1)) if match else 1


def _format_project_url(template: str, project_slug: str) -> str:
    index = project_index(project_slug)
    return template.format(
        project_slug=project_slug,
        project_index=index,
        port_preview=3000 + index,
        port_backend=8000 + index,
    )


def _public_origin_without_port() -> str | None:
    settings = get_settings()
    if not settings.public_base_url:
        return None

    parsed = urlsplit(settings.public_base_url.strip())
    if not parsed.scheme or not parsed.hostname:
        return None

    hostname = parsed.hostname
    if ":" in hostname and not hostname.startswith("["):
        hostname = f"[{hostname}]"
    return f"{parsed.scheme}://{hostname}"


def preview_url_for_slug(project_slug: str) -> str:
    settings = get_settings()
    if settings.project_preview_url_template:
        return _format_project_url(settings.project_preview_url_template, project_slug)

    origin = _public_origin_without_port()
    index = project_index(project_slug)
    if origin:
        return f"{origin}:{3000 + index}"
    return f"http://localhost:{3000 + index}"


def backend_url_for_slug(project_slug: str) -> str:
    settings = get_settings()
    if settings.project_backend_url_template:
        return _format_project_url(settings.project_backend_url_template, project_slug)

    origin = _public_origin_without_port()
    index = project_index(project_slug)
    if origin:
        return f"{origin}:{8000 + index}"
    return f"http://localhost:{8000 + index}"
