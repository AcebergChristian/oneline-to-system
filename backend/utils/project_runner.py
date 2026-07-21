from __future__ import annotations

import json
import shutil
import subprocess
import time
from datetime import datetime
from pathlib import Path
import re
from urllib.error import URLError
from urllib.request import urlopen

from .config import PROJECT_ROOT
from .logger import log_session_event
from .storage import append_project_run, load_session, upsert_project_meta


def _detect_runtime_urls(project_dir: Path, fallback_preview_url: str | None) -> tuple[str | None, str | None]:
    compose_path = project_dir / "docker-compose.yml"
    if not compose_path.exists():
        return fallback_preview_url, None

    content = compose_path.read_text(encoding="utf-8")
    preview_url = fallback_preview_url
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


def _check_http(url: str | None) -> tuple[bool, str]:
    if not url:
        return False, "missing_url"
    try:
        with urlopen(url, timeout=3) as response:  # noqa: S310
            return 200 <= response.status < 500, f"http_{response.status}"
    except URLError as exc:
        return False, str(exc.reason)
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


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


def refresh_project_entry_runtime(entry: dict) -> dict:
    preview_url = entry.get("preview_url")
    backend_url = entry.get("backend_url")
    frontend_ok, frontend_check = _check_http(preview_url)
    backend_ok, backend_check = _check_http(f"{backend_url}/api/health" if backend_url else None)

    if frontend_ok and backend_ok:
        return {
            **entry,
            "runtime_status": "running",
            "failure_reason": None,
            "service_states": entry.get("service_states", {}),
            "service_state_error": entry.get("service_state_error", ""),
            "last_verified_at": datetime.utcnow().isoformat(),
            "last_frontend_check": frontend_check,
            "last_backend_check": backend_check,
        }

    return entry


def start_project_for_session(session_id: str) -> dict:
    session = load_session(session_id)
    if session is None:
        raise FileNotFoundError(session_id)

    project_dir = PROJECT_ROOT / session.project_slug
    if not project_dir.exists():
        raise FileNotFoundError(f"Project directory not found: {project_dir}")

    compose_command: list[str] | None = None
    if shutil.which("docker"):
        compose_command = ["docker", "compose", "-p", session.project_slug]
    elif shutil.which("docker-compose"):
        compose_command = ["docker-compose", "-p", session.project_slug]

    if compose_command is None:
        raise RuntimeError("docker 或 docker-compose 不可用，无法启动项目。")

    build_and_up_command = [*compose_command, "up", "-d", "--build"]
    log_session_event(
        session_id,
        "project",
        "start_command_started",
        {"command": build_and_up_command, "cwd": str(project_dir)},
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

    preview_url, backend_url = _detect_runtime_urls(project_dir, session.preview_url)
    service_states: dict[str, str] = {}
    service_state_error = ""
    if result.returncode == 0:
        service_states, service_state_error = _compose_service_states(compose_command, project_dir)

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
        frontend_ok, frontend_check = _check_http_with_retry(preview_url)
        backend_ok, backend_check = _check_http_with_retry(f"{backend_url}/api/health" if backend_url else None)
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
    payload = {
        "session_id": session.id,
        "project_slug": session.project_slug,
        "path": str(project_dir.relative_to(PROJECT_ROOT.parent)),
        "preview_url": preview_url,
        "backend_url": backend_url,
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
            "preview_url": preview_url,
            "returncode": result.returncode,
            "failure_reason": failure_reason,
        },
    )
    return payload
