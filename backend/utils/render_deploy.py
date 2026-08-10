from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from .config import get_settings


RENDER_API_BASE = "https://api.render.com/v1"


class RenderConfigError(RuntimeError):
    pass


class RenderDeployError(RuntimeError):
    pass


@dataclass
class RenderServiceInfo:
    id: str | None
    name: str
    url: str | None
    service_type: str
    dashboard_url: str | None = None
    created_now: bool = False


def render_autocreate_enabled() -> bool:
    settings = get_settings()
    return settings.project_runtime_mode.lower() == "external" and settings.render_auto_create


def render_configured() -> bool:
    settings = get_settings()
    return all(
        [
            settings.render_api_key,
            settings.render_owner_id,
            settings.render_repo_url,
        ]
    )


def ensure_render_config() -> None:
    settings = get_settings()
    missing: list[str] = []
    if not settings.render_api_key:
        missing.append("RENDER_API_KEY")
    if not settings.render_owner_id:
        missing.append("RENDER_OWNER_ID")
    if not settings.render_repo_url:
        missing.append("RENDER_REPO_URL")
    if missing:
        raise RenderConfigError(f"Render 自动部署未配置完整，缺少: {', '.join(missing)}")


def ensure_render_project_services(project_slug: str) -> dict[str, RenderServiceInfo]:
    ensure_render_config()
    frontend_name = f"{project_slug}-frontend"
    backend_name = f"{project_slug}-api"
    services = {
        "frontend": _ensure_service(
            frontend_name,
            root_dir=f"project/{project_slug}/frontend",
            health_check_path=None,
            env_vars=[],
        ),
        "backend": _ensure_service(
            backend_name,
            root_dir=f"project/{project_slug}/backend",
            health_check_path="/api/health",
            env_vars=[],
        ),
    }
    return services


def _ensure_service(
    service_name: str,
    root_dir: str,
    health_check_path: str | None,
    env_vars: list[dict[str, str]],
) -> RenderServiceInfo:
    existing = _find_service_by_name(service_name)
    if existing is not None:
        return existing

    created = _create_service(service_name, root_dir, health_check_path, env_vars)
    created.created_now = True
    return created


def _find_service_by_name(service_name: str) -> RenderServiceInfo | None:
    settings = get_settings()
    response = _client().get(
        f"{RENDER_API_BASE}/services",
        params=[("name", service_name), ("limit", "20")],
    )
    _raise_for_status(response, f"查询 Render service 失败: {service_name}")
    items = response.json()
    if not isinstance(items, list):
        return None

    for item in items:
        payload = item.get("service", item) if isinstance(item, dict) else {}
        if str(payload.get("ownerId") or payload.get("owner_id") or "") != settings.render_owner_id:
            continue
        if str(payload.get("name") or "") != service_name:
            continue
        return _service_info_from_payload(payload)
    return None


def _create_service(
    service_name: str,
    root_dir: str,
    health_check_path: str | None,
    env_vars: list[dict[str, str]],
) -> RenderServiceInfo:
    settings = get_settings()
    payload: dict[str, Any] = {
        "type": "web_service",
        "name": service_name,
        "ownerId": settings.render_owner_id,
        "repo": settings.render_repo_url,
        "autoDeploy": "yes" if settings.render_auto_deploy else "no",
        "rootDir": root_dir,
        "serviceDetails": {
            "runtime": "docker",
            "plan": settings.render_service_plan,
            "region": settings.render_region,
            "renderSubdomainPolicy": "enabled",
            "envSpecificDetails": {
                "dockerfilePath": "Dockerfile",
                "dockerContext": ".",
            },
        },
    }
    if settings.render_repo_branch:
        payload["branch"] = settings.render_repo_branch
    if env_vars:
        payload["envVars"] = env_vars
    if health_check_path:
        payload["serviceDetails"]["healthCheckPath"] = health_check_path

    response = _client().post(f"{RENDER_API_BASE}/services", json=payload)
    if response.status_code == 409:
        existing = _find_service_by_name(service_name)
        if existing is not None:
            return existing
    _raise_for_status(response, f"创建 Render service 失败: {service_name}")
    return _service_info_from_payload(response.json())


def _service_info_from_payload(payload: dict[str, Any]) -> RenderServiceInfo:
    return RenderServiceInfo(
        id=str(payload.get("id") or "") or None,
        name=str(payload.get("name") or ""),
        url=(str(payload.get("url") or "").rstrip("/") or None),
        service_type=str(payload.get("type") or "web_service"),
        dashboard_url=(str(payload.get("dashboardUrl") or "").rstrip("/") or None),
    )


def _client() -> httpx.Client:
    settings = get_settings()
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {settings.render_api_key}",
    }
    return httpx.Client(headers=headers, timeout=45.0)


def _raise_for_status(response: httpx.Response, message: str) -> None:
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = response.text.strip()
        if detail:
            raise RenderDeployError(f"{message}: {detail}") from exc
        raise RenderDeployError(message) from exc
