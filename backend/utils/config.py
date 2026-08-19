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
    # 生成项目构建时使用的镜像源。置为 "off" 表示使用官方源。
    # 默认使用国内镜像,避免 docker build 阶段 npm / pip 拉包失败导致项目启动不了。
    npm_registry: str = "https://registry.npmmirror.com"
    pip_index_url: str = "https://mirrors.aliyun.com/pypi/simple/"
    pip_trusted_host: str = "mirrors.aliyun.com"

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


def project_backend_port(project_slug: str) -> int:
    """项目后端宿主端口的约定起点(真实端口以启动时的分配结果为准)。"""
    return 8000 + project_index(project_slug)


def _format_project_url(template: str, project_slug: str) -> str:
    index = project_index(project_slug)
    backend_port = 8000 + index
    return template.format(
        project_slug=project_slug,
        project_index=index,
        # 单端口部署:预览地址就是后端地址
        port_preview=backend_port,
        port_backend=backend_port,
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


def backend_url_for_slug(project_slug: str) -> str:
    settings = get_settings()
    if settings.project_backend_url_template:
        return _format_project_url(settings.project_backend_url_template, project_slug)

    origin = _public_origin_without_port()
    port = project_backend_port(project_slug)
    if origin:
        return f"{origin}:{port}"
    return f"http://localhost:{port}"


def preview_url_for_slug(project_slug: str) -> str:
    """单端口部署:前端由后端托管,预览地址与后端地址相同。"""
    settings = get_settings()
    if settings.project_preview_url_template:
        return _format_project_url(settings.project_preview_url_template, project_slug)
    return backend_url_for_slug(project_slug)
