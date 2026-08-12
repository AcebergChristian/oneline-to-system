from __future__ import annotations

import json
import shutil
import subprocess
import time
from datetime import datetime
from pathlib import Path
import re
from urllib.error import HTTPError, URLError
from urllib.request import urlopen
import yaml

from .config import PROJECT_ROOT, backend_url_for_slug, preview_url_for_slug
from .logger import log_session_event
from .storage import append_project_run, load_session, upsert_project_meta


def _command_available(command: list[str]) -> bool:
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return False
    return result.returncode == 0


def _resolve_compose_command() -> list[str] | None:
    docker_path = shutil.which("docker")
    if docker_path and _command_available([docker_path, "compose", "version"]):
        return [docker_path, "compose"]

    docker_compose_path = shutil.which("docker-compose")
    if docker_compose_path and _command_available([docker_compose_path, "version"]):
        return [docker_compose_path]

    return None


def _is_bind_mount(volume: object) -> bool:
    if isinstance(volume, str):
        source = volume.split(":", 1)[0].strip()
        return source.startswith((".", "/", "~"))
    if isinstance(volume, dict):
        mount_type = str(volume.get("type", "")).lower()
        source = str(volume.get("source", "")).strip()
        return mount_type == "bind" or source.startswith((".", "/", "~"))
    return False


def _prepare_runtime_compose_file(project_dir: Path) -> tuple[Path, bool]:
    compose_path = project_dir / "docker-compose.yml"
    if not compose_path.exists():
        return compose_path, False

    payload = yaml.safe_load(compose_path.read_text(encoding="utf-8")) or {}
    services = payload.get("services")
    if not isinstance(services, dict):
        return compose_path, False

    changed = False
    for service in services.values():
        if not isinstance(service, dict) or "volumes" not in service:
            continue
        volumes = service.get("volumes") or []
        if not isinstance(volumes, list):
            continue
        filtered_volumes = [volume for volume in volumes if not _is_bind_mount(volume)]
        if len(filtered_volumes) != len(volumes):
            changed = True
            if filtered_volumes:
                service["volumes"] = filtered_volumes
            else:
                service.pop("volumes", None)

    if not changed:
        return compose_path, False

    runtime_compose_path = project_dir / ".codex-runtime.compose.yml"
    runtime_compose_path.write_text(
        yaml.safe_dump(payload, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )
    return runtime_compose_path, True


def _detect_runtime_urls(project_dir: Path, fallback_preview_url: str | None) -> tuple[str | None, str | None]:
    compose_path = project_dir / "docker-compose.yml"
    if not compose_path.exists():
        return fallback_preview_url, None

    content = compose_path.read_text(encoding="utf-8")
    preview_url = None
    api_url = None
    for line in content.splitlines():
        stripped = line.strip().strip('"').strip("'")
        match = re.search(r"(\d{2,5})\s*:\s*(\d{2,5})", stripped)
        if not match:
            continue
        host_port = int(match.group(1))
        container_port = int(match.group(2))
        if host_port >= 1024 and container_port in {80, 3000, 4173, 5173}:
            preview_url = f"http://localhost:{host_port}"
        if host_port >= 1024 and container_port in {8000, 8005, 8080}:
            api_url = f"http://localhost:{host_port}"
    return preview_url, api_url


def _compose_service_states(compose_command: list[str], project_dir: Path) -> tuple[dict[str, str], str]:
    ps_command = [*compose_command, "ps", "--format", "json"]
    result = subprocess.run(
        ps_command,
        cwd=project_dir,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return {}, result.stderr[-2000:] or result.stdout[-2000:]

    states: dict[str, str] = {}
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    for line in lines:
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        service = payload.get("Service") or payload.get("Name") or "unknown"
        state = payload.get("State") or payload.get("Status") or "unknown"
        states[str(service)] = str(state)
    return states, ""


def _compose_services(compose_command: list[str], project_dir: Path) -> tuple[list[dict], str]:
    ps_command = [*compose_command, "ps", "--format", "json"]
    result = subprocess.run(
        ps_command,
        cwd=project_dir,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return [], result.stderr[-2000:] or result.stdout[-2000:]

    services: list[dict] = []
    for line in [line.strip() for line in result.stdout.splitlines() if line.strip()]:
        try:
            services.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return services, ""


def _urls_from_compose_runtime(compose_command: list[str], project_dir: Path) -> tuple[str | None, str | None]:
    services, _ = _compose_services(compose_command, project_dir)
    preview_url = None
    backend_url = None

    for service in services:
        publishers = service.get("Publishers") or []
        for publisher in publishers:
            published_port = publisher.get("PublishedPort")
            target_port = publisher.get("TargetPort")
            if published_port is None or target_port is None:
                continue
            host_port = int(published_port)
            container_port = int(target_port)
            if host_port >= 1024 and container_port in {80, 3000, 4173, 5173} and preview_url is None:
                preview_url = f"http://localhost:{host_port}"
            if host_port >= 1024 and container_port in {8000, 8005, 8080} and backend_url is None:
                backend_url = f"http://localhost:{host_port}"

    return preview_url, backend_url


def _check_http(url: str | None) -> tuple[bool, str]:
    if not url:
        return False, "missing_url"
    try:
        with urlopen(url, timeout=3) as response:  # noqa: S310
            return 200 <= response.status < 500, f"http_{response.status}"
    except HTTPError as exc:
        return exc.code < 500, f"http_{exc.code}"
    except URLError as exc:
        return False, str(exc.reason)
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


def _check_backend_http(url: str | None) -> tuple[bool, str]:
    if not url:
        return False, "missing_url"

    normalized = str(url).rstrip("/")
    candidate_urls = [f"{normalized}/api/health", normalized, f"{normalized}/docs", f"{normalized}/openapi.json"]
    last_check = "missing_url"
    for candidate in candidate_urls:
        ok, check = _check_http(candidate)
        last_check = f"{candidate} -> {check}"
        if ok:
            return True, last_check
    return False, last_check


def _check_http_with_retry(url: str | None, attempts: int = 8, delay_seconds: float = 1.5) -> tuple[bool, str]:
    last_check = "missing_url"
    for attempt in range(attempts):
        ok, check = _check_http(url)
        last_check = check
        if ok:
            return True, check
        if attempt < attempts - 1:
            time.sleep(delay_seconds)
    return False, last_check


def _is_local_url(url: str | None) -> bool:
    return bool(url) and ("localhost:" in str(url) or "127.0.0.1:" in str(url))


def _internal_preview_url_for_slug(project_slug: str) -> str:
    match = re.search(r"(\d+)$", project_slug)
    index = int(match.group(1)) if match else 1
    return f"http://localhost:{3000 + index}"


def _internal_backend_url_for_slug(project_slug: str) -> str:
    match = re.search(r"(\d+)$", project_slug)
    index = int(match.group(1)) if match else 1
    return f"http://localhost:{8000 + index}"


def _public_preview_url(project_slug: str, current_url: str | None) -> str | None:
    if current_url and not _is_local_url(current_url):
        return current_url
    return preview_url_for_slug(project_slug)


def _public_backend_url(project_slug: str, current_url: str | None) -> str | None:
    if current_url and not _is_local_url(current_url):
        return current_url
    return backend_url_for_slug(project_slug)


def _normalize_entry_urls(entry: dict) -> dict:
    project_slug = str(entry.get("project_slug") or "")
    if not project_slug:
        return entry

    normalized = dict(entry)
    normalized["preview_url"] = _public_preview_url(project_slug, normalized.get("preview_url"))
    normalized["backend_url"] = _public_backend_url(project_slug, normalized.get("backend_url"))
    normalized["internal_preview_url"] = normalized.get("internal_preview_url") or _internal_preview_url_for_slug(project_slug)
    normalized["internal_backend_url"] = normalized.get("internal_backend_url") or _internal_backend_url_for_slug(project_slug)
    return normalized


def refresh_project_entry_runtime(entry: dict) -> dict:
    normalized = _normalize_entry_urls(entry)
    preview_url = normalized.get("internal_preview_url") or normalized.get("preview_url")
    backend_url = normalized.get("internal_backend_url") or normalized.get("backend_url")
    frontend_ok, frontend_check = _check_http(preview_url)
    backend_ok, backend_check = _check_backend_http(backend_url)

    if frontend_ok and backend_ok:
        return {
            **normalized,
            "runtime_status": "running",
            "failure_reason": None,
            "service_states": normalized.get("service_states", {}),
            "service_state_error": normalized.get("service_state_error", ""),
            "last_verified_at": datetime.utcnow().isoformat(),
            "last_frontend_check": frontend_check,
            "last_backend_check": backend_check,
        }

    return normalized


def start_project_for_session(session_id: str) -> dict:
    session = load_session(session_id)
    if session is None:
        raise FileNotFoundError(session_id)

    project_dir = PROJECT_ROOT / session.project_slug
    if not project_dir.exists():
        raise FileNotFoundError(f"Project directory not found: {project_dir}")

    compose_file, using_runtime_compose = _prepare_runtime_compose_file(project_dir)

    compose_base = _resolve_compose_command()
    compose_command: list[str] | None = None
    if compose_base is not None:
        compose_command = [*compose_base, "-p", session.project_slug, "-f", str(compose_file)]

    if compose_command is None:
        raise RuntimeError("docker 或 docker-compose 不可用，无法启动项目。")

    build_and_up_command = [*compose_command, "up", "-d", "--build"]
    log_session_event(
        session_id,
        "project",
        "start_command_started",
        {
            "command": build_and_up_command,
            "cwd": str(project_dir),
            "compose_file": str(compose_file),
            "using_runtime_compose": using_runtime_compose,
        },
    )
    result = subprocess.run(
        build_and_up_command,
        cwd=project_dir,
        capture_output=True,
        text=True,
        check=False,
    )
    command_used = build_and_up_command

    combined_output = f"{result.stdout}\n{result.stderr}".lower()
    build_failed = result.returncode != 0 and any(
        marker in combined_output
        for marker in ["pypi.org", "ssl", "no matching distribution", "failed to solve", "pull access denied"]
    )
    if build_failed:
        fallback_command = [*compose_command, "up", "-d", "--no-build"]
        log_session_event(
            session_id,
            "project",
            "start_command_fallback_started",
            {"command": fallback_command, "reason": "build_failed_or_network_unstable"},
        )
        fallback = subprocess.run(
            fallback_command,
            cwd=project_dir,
            capture_output=True,
            text=True,
            check=False,
        )
        if fallback.returncode == 0:
            result = fallback
            command_used = fallback_command
            log_session_event(
                session_id,
                "project",
                "start_command_fallback_succeeded",
                {"command": fallback_command},
            )
        else:
            log_session_event(
                session_id,
                "project",
                "start_command_fallback_failed",
                {
                    "command": fallback_command,
                    "returncode": fallback.returncode,
                    "stdout_tail": fallback.stdout[-1000:],
                    "stderr_tail": fallback.stderr[-1000:],
                },
            )

    internal_preview_url, internal_backend_url = _detect_runtime_urls(
        project_dir,
        _internal_preview_url_for_slug(session.project_slug),
    )
    internal_backend_url = internal_backend_url or _internal_backend_url_for_slug(session.project_slug)
    service_states: dict[str, str] = {}
    service_state_error = ""
    if result.returncode == 0:
        service_states, service_state_error = _compose_service_states(compose_command, project_dir)
        runtime_preview_url, runtime_backend_url = _urls_from_compose_runtime(compose_command, project_dir)
        internal_preview_url = runtime_preview_url or internal_preview_url
        internal_backend_url = runtime_backend_url or internal_backend_url

    runtime_status = "running" if result.returncode == 0 else "failed"
    failure_reason = None
    if result.returncode != 0:
        if "pypi.org" in combined_output or "no matching distribution" in combined_output or "ssl" in combined_output:
            failure_reason = "python_dependency_network_failure"
        elif "registry-1.docker.io" in combined_output or "pull access denied" in combined_output:
            failure_reason = "docker_registry_failure"
        elif "cannot connect to the docker daemon" in combined_output or "is the docker daemon running?" in combined_output:
            failure_reason = "docker_daemon_unavailable"
        elif "port is already allocated" in combined_output or "bind: address already in use" in combined_output:
            failure_reason = "port_conflict"
        else:
            failure_reason = "compose_start_failed"
    else:
        unhealthy_services = {name: state for name, state in service_states.items() if "running" not in state.lower()}
        has_explicit_preview = internal_preview_url is not None
        frontend_ok, frontend_check = _check_http_with_retry(internal_preview_url) if has_explicit_preview else (True, "preview_not_required")
        backend_ok, backend_check = _check_http_with_retry(internal_backend_url, attempts=8, delay_seconds=1.5)
        if not backend_ok:
            backend_ok, backend_check = _check_backend_http(internal_backend_url)
        if unhealthy_services:
            runtime_status = "failed"
            failure_reason = "services_not_running"
        elif not backend_ok:
            runtime_status = "failed"
            failure_reason = "backend_unreachable"
        elif not frontend_ok:
            runtime_status = "failed"
            failure_reason = "frontend_unreachable"
        log_session_event(
            session_id,
            "project",
            "post_start_healthcheck",
            {
                "service_states": service_states,
                "service_state_error": service_state_error,
                "frontend_ok": frontend_ok,
                "frontend_check": frontend_check,
                "backend_ok": backend_ok,
                "backend_check": backend_check,
            },
        )

    public_preview_url = _public_preview_url(session.project_slug, internal_preview_url or session.preview_url)
    public_backend_url = _public_backend_url(session.project_slug, internal_backend_url or session.backend_url)
    payload = {
        "session_id": session.id,
        "project_slug": session.project_slug,
        "path": str(project_dir.relative_to(PROJECT_ROOT.parent)),
        "preview_url": public_preview_url,
        "backend_url": public_backend_url,
        "internal_preview_url": internal_preview_url,
        "internal_backend_url": internal_backend_url,
        "runtime_status": runtime_status,
        "started_at": datetime.utcnow().isoformat(),
        "command": command_used,
        "returncode": result.returncode,
        "stdout": result.stdout[-4000:],
        "stderr": result.stderr[-4000:],
        "failure_reason": failure_reason,
        "service_states": service_states,
        "service_state_error": service_state_error,
    }
    upsert_project_meta(payload)
    append_project_run(payload)
    log_session_event(
        session_id,
        "project",
        "start_command_finished",
        {
            "runtime_status": runtime_status,
            "preview_url": public_preview_url,
            "returncode": result.returncode,
            "failure_reason": failure_reason,
        },
    )
    return payload
