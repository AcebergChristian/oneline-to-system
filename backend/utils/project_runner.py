"""生成项目的启动与健康检查。

部署模型(与 project_template.py 对应):
- 每个生成项目 = 单容器;
- 前端 build 产物由后端 FastAPI 静态托管;
- 对外只发布一个宿主端口(由 port_alloc 分配,绝不与已有端口冲突);
- 预览地址 == 后端接口地址。

启动前平台会强制写入规范化的 Dockerfile / docker-compose.yml / backend/_dw_serve.py,
无论 LLM 之前写了什么部署文件都会被覆盖,保证每次启动的部署结构一致、端口正确。
"""
from __future__ import annotations

import json
import shutil
import subprocess
import time
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

from .config import PROJECT_ROOT, get_settings
from .logger import log_session_event
from .port_alloc import allocate_backend_port, parse_port_from_url
from .project_template import (
    INTERNAL_PORT,
    render_compose,
    render_dockerfile,
    render_dockerignore,
    render_requirements_fallback,
    render_serve_wrapper,
)
from .storage import (
    append_project_run,
    load_project_meta,
    load_session,
    save_session,
    upsert_project_meta,
)


PORT_CONFLICT_MARKERS = (
    "port is already allocated",
    "address already in use",
    "bind: address already in use",
    "ports are not available",
)
MAX_PORT_RETRIES = 3


# ---------------------------------------------------------------------------
# docker / compose 基础工具
# ---------------------------------------------------------------------------

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


def _inside_container() -> bool:
    """判断主控后端自己是否运行在容器里。

    在容器里时,`localhost` 指向容器自身,访问不到宿主机发布的端口,
    必须改用 host.docker.internal(Docker Desktop 提供)。
    """
    if Path("/.dockerenv").exists():
        return True
    try:
        cgroup = Path("/proc/1/cgroup").read_text(encoding="utf-8")
        return "docker" in cgroup or "containerd" in cgroup
    except OSError:
        return False


def _public_url_for_port(port: int) -> str:
    """给浏览器用的访问地址:本机就是 localhost,配置了公网地址则替换 host。"""
    from .config import _public_origin_without_port

    origin = _public_origin_without_port()
    if origin:
        return f"{origin}:{port}"
    return f"http://localhost:{port}"


# ---------------------------------------------------------------------------
# 项目文件校验与规范化部署文件写入
# ---------------------------------------------------------------------------

def _validate_project_files(project_dir: Path) -> None:
    frontend_package = project_dir / "frontend" / "package.json"
    backend_main = project_dir / "backend" / "main.py"

    problems: list[str] = []
    if not (project_dir / "frontend").exists():
        problems.append("缺少 frontend/ 目录")
    elif not frontend_package.exists():
        problems.append("缺少 frontend/package.json")
    if not (project_dir / "backend").exists():
        problems.append("缺少 backend/ 目录")
    elif not backend_main.exists():
        problems.append("缺少 backend/main.py")

    if problems:
        raise RuntimeError(
            "项目文件不完整,无法启动:" + "、".join(problems)
            + "。请继续在当前会话描述需求,让 Agent 补全 frontend/ 与 backend/ 源码。"
        )

    requirements_path = project_dir / "backend" / "requirements.txt"
    if not requirements_path.exists():
        requirements_path.write_text(render_requirements_fallback(), encoding="utf-8")


def _build_args() -> dict[str, str]:
    settings = get_settings()
    args: dict[str, str] = {}
    npm_registry = (settings.npm_registry or "").strip()
    if npm_registry and npm_registry.lower() != "off":
        args["NPM_CONFIG_REGISTRY"] = npm_registry
    pip_index_url = (settings.pip_index_url or "").strip()
    if pip_index_url and pip_index_url.lower() != "off":
        args["PIP_INDEX_URL"] = pip_index_url
        trusted_host = (settings.pip_trusted_host or "").strip()
        if trusted_host:
            args["PIP_TRUSTED_HOST"] = trusted_host
    return args


def write_deploy_files(project_dir: Path, host_port: int) -> list[str]:
    """把规范化的部署文件写入项目目录,返回写入的相对路径列表。"""
    _validate_project_files(project_dir)

    written: list[str] = []
    (project_dir / "Dockerfile").write_text(render_dockerfile(), encoding="utf-8")
    written.append("Dockerfile")

    (project_dir / "docker-compose.yml").write_text(
        render_compose(host_port, _build_args()), encoding="utf-8"
    )
    written.append("docker-compose.yml")

    (project_dir / ".dockerignore").write_text(render_dockerignore(), encoding="utf-8")
    written.append(".dockerignore")

    wrapper_path = project_dir / "backend" / "_dw_serve.py"
    wrapper_path.write_text(render_serve_wrapper(), encoding="utf-8")
    written.append("backend/_dw_serve.py")

    # 清理旧版运行器生成的临时 compose 文件,避免混淆
    legacy_runtime = project_dir / ".codex-runtime.compose.yml"
    if legacy_runtime.exists():
        legacy_runtime.unlink()

    return written


def rewrite_compose_port(project_dir: Path, host_port: int) -> None:
    (project_dir / "docker-compose.yml").write_text(
        render_compose(host_port, _build_args()), encoding="utf-8"
    )


# ---------------------------------------------------------------------------
# compose 状态与健康检查
# ---------------------------------------------------------------------------

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

    payloads: list[dict] = []
    stdout = result.stdout.strip()
    if stdout.startswith("["):
        try:
            data = json.loads(stdout)
            if isinstance(data, list):
                payloads = [item for item in data if isinstance(item, dict)]
        except json.JSONDecodeError:
            payloads = []
    if not payloads:
        for line in [line.strip() for line in stdout.splitlines() if line.strip()]:
            try:
                payloads.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    states: dict[str, str] = {}
    for payload in payloads:
        service = payload.get("Service") or payload.get("Name") or "unknown"
        state = payload.get("State") or payload.get("Status") or "unknown"
        states[str(service)] = str(state)
    return states, ""


def _compose_ps_text(compose_command: list[str], project_dir: Path) -> str:
    result = subprocess.run(
        [*compose_command, "ps", "-a"],
        cwd=project_dir,
        capture_output=True,
        text=True,
        check=False,
    )
    output = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
    return output[-6000:].strip()


def _compose_logs_tail(compose_command: list[str], project_dir: Path, tail: int = 160) -> str:
    result = subprocess.run(
        [*compose_command, "logs", "--tail", str(tail)],
        cwd=project_dir,
        capture_output=True,
        text=True,
        check=False,
    )
    output = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
    return output[-12000:].strip()


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


def _check_project_url(base_url: str) -> tuple[bool, str]:
    """检查单个部署地址是否可用:/api/health 优先,其次根路径。"""
    normalized = str(base_url).rstrip("/")
    for candidate in (f"{normalized}/api/health", normalized):
        ok, check = _check_http(candidate)
        if ok:
            return True, f"{candidate} -> {check}"
    return False, f"{normalized} -> unreachable"


def _candidate_bases(host_port: int) -> list[str]:
    """健康检查候选地址。主控在容器内时优先走 host.docker.internal。"""
    localhost = f"http://localhost:{host_port}"
    if _inside_container():
        return [f"http://host.docker.internal:{host_port}", localhost]
    return [localhost]


def _check_url_with_retry(
    host_port: int, attempts: int = 15, delay_seconds: float = 2.0
) -> tuple[bool, str, str | None]:
    """带重试地检查项目地址,返回 (是否健康, 检查详情, 可用的内部基础地址)。"""
    last_check = "not_checked"
    for attempt in range(attempts):
        for base in _candidate_bases(host_port):
            ok, check = _check_project_url(base)
            last_check = f"{base} :: {check}"
            if ok:
                return True, last_check, base
        if attempt < attempts - 1:
            time.sleep(delay_seconds)
    return False, last_check, None


# ---------------------------------------------------------------------------
# 元数据维护
# ---------------------------------------------------------------------------

def _current_project_port(project_slug: str, project_dir: Path) -> int | None:
    """读取项目当前已分配的宿主端口(优先 meta,其次 compose 文件)。"""
    for entry in load_project_meta():
        if entry.get("project_slug") == project_slug:
            for key in ("internal_backend_url", "backend_url"):
                port = parse_port_from_url(entry.get(key))
                if port:
                    return port
    from .port_alloc import _compose_host_ports

    compose_path = project_dir / "docker-compose.yml"
    if compose_path.exists():
        ports = _compose_host_ports(compose_path)
        backend_like = [port for port in ports if port >= 8000]
        if backend_like:
            return min(backend_like)
    return None


def refresh_project_entry_runtime(entry: dict) -> dict:
    """列表页刷新:检查项目地址是否仍然可用。"""
    project_slug = str(entry.get("project_slug") or "")
    normalized = dict(entry)
    if not project_slug:
        return normalized

    internal_url = normalized.get("internal_backend_url") or normalized.get("backend_url")
    port = parse_port_from_url(internal_url)
    if not port:
        from .config import project_backend_port

        port = project_backend_port(project_slug)

    # 单端口部署:预览地址与后端地址统一
    public_url = _public_url_for_port(port)
    normalized.setdefault("internal_backend_url", internal_url or f"http://localhost:{port}")
    normalized["preview_url"] = public_url
    normalized["backend_url"] = public_url

    ok, check = _check_project_url(normalized["internal_backend_url"])
    if not ok:
        for base in _candidate_bases(port):
            ok, check = _check_project_url(base)
            if ok:
                normalized["internal_backend_url"] = base
                break

    if ok:
        normalized.update(
            {
                "runtime_status": "running",
                "failure_reason": None,
                "last_verified_at": datetime.utcnow().isoformat(),
                "last_backend_check": check,
            }
        )
    elif normalized.get("runtime_status") == "running":
        # 之前是 running,现在探测不到,说明容器已经停了
        normalized["runtime_status"] = "stopped"
    return normalized


# ---------------------------------------------------------------------------
# 启动主流程
# ---------------------------------------------------------------------------

def start_project_for_session(session_id: str) -> dict:
    session = load_session(session_id)
    if session is None:
        raise FileNotFoundError(session_id)

    project_dir = PROJECT_ROOT / session.project_slug
    if not project_dir.exists():
        raise FileNotFoundError(f"Project directory not found: {project_dir}")

    # 1. 校验源码文件并分配端口(先检查已占用端口,绝不复用)
    current_port = _current_project_port(session.project_slug, project_dir)
    host_port = allocate_backend_port(session.project_slug, current_port=current_port)

    # 2. 强制写入规范化部署文件(覆盖 LLM 自己写的 Dockerfile/compose)
    written_files = write_deploy_files(project_dir, host_port)

    compose_base = _resolve_compose_command()
    if compose_base is None:
        raise RuntimeError("docker 或 docker-compose 不可用,无法启动项目。")
    compose_command = [*compose_base, "-p", session.project_slug, "-f", str(project_dir / "docker-compose.yml")]

    # 3. compose up,端口冲突时自动换端口重试
    result = None
    command_used: list[str] = []
    tried_ports: list[int] = []
    for attempt in range(MAX_PORT_RETRIES):
        build_and_up_command = [*compose_command, "up", "-d", "--build", "--remove-orphans"]
        log_session_event(
            session_id,
            "project",
            "start_command_started",
            {
                "command": build_and_up_command,
                "cwd": str(project_dir),
                "host_port": host_port,
                "written_files": written_files,
                "attempt": attempt + 1,
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

        # 构建阶段因网络抖动失败时,尝试直接用已有镜像启动
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
                combined_output = f"{fallback.stdout}\n{fallback.stderr}".lower()

        port_conflict = result.returncode != 0 and any(marker in combined_output for marker in PORT_CONFLICT_MARKERS)
        if port_conflict and attempt < MAX_PORT_RETRIES - 1:
            tried_ports.append(host_port)
            log_session_event(
                session_id,
                "project",
                "port_conflict_detected",
                {"port": host_port, "tried_ports": tried_ports},
            )
            host_port = allocate_backend_port(
                session.project_slug, extra_excluded=set(tried_ports)
            )
            rewrite_compose_port(project_dir, host_port)
            continue
        break

    # 4. 状态收集与健康检查(单端口:预览即后端)
    internal_base_url: str | None = f"http://localhost:{host_port}"
    service_states: dict[str, str] = {}
    service_state_error = ""
    compose_ps = ""
    compose_logs = ""
    runtime_status = "running" if result.returncode == 0 else "failed"
    failure_reason = None
    health_check = ""

    if result.returncode != 0:
        combined_output = f"{result.stdout}\n{result.stderr}".lower()
        if "pypi.org" in combined_output or "no matching distribution" in combined_output or "ssl" in combined_output:
            failure_reason = "python_dependency_network_failure"
        elif "registry-1.docker.io" in combined_output or "pull access denied" in combined_output:
            failure_reason = "docker_registry_failure"
        elif "cannot connect to the docker daemon" in combined_output or "is the docker daemon running?" in combined_output:
            failure_reason = "docker_daemon_unavailable"
        elif any(marker in combined_output for marker in PORT_CONFLICT_MARKERS):
            failure_reason = "port_conflict"
        else:
            failure_reason = "compose_start_failed"
        compose_ps = _compose_ps_text(compose_command, project_dir)
        compose_logs = _compose_logs_tail(compose_command, project_dir)
    else:
        service_states, service_state_error = _compose_service_states(compose_command, project_dir)
        unhealthy_services = {name: state for name, state in service_states.items() if "running" not in state.lower()}
        health_ok, health_check, working_base = _check_url_with_retry(host_port)
        if working_base:
            internal_base_url = working_base
        if unhealthy_services:
            runtime_status = "failed"
            failure_reason = "services_not_running"
        elif not health_ok:
            runtime_status = "failed"
            failure_reason = "backend_unreachable"
        if runtime_status == "failed":
            compose_ps = _compose_ps_text(compose_command, project_dir)
            compose_logs = _compose_logs_tail(compose_command, project_dir)
        log_session_event(
            session_id,
            "project",
            "post_start_healthcheck",
            {
                "service_states": service_states,
                "service_state_error": service_state_error,
                "health_ok": health_ok,
                "health_check": health_check,
                "host_port": host_port,
                "internal_base_url": internal_base_url,
                "compose_ps": compose_ps[-2000:],
                "compose_logs": compose_logs[-4000:],
            },
        )

    public_url = _public_url_for_port(host_port)

    # 5. 会话里的预览/后端地址同步为真实分配的端口
    session.preview_url = public_url
    session.backend_url = public_url
    save_session(session)

    payload = {
        "session_id": session.id,
        "project_slug": session.project_slug,
        "path": str(project_dir.relative_to(PROJECT_ROOT.parent)),
        "preview_url": public_url,
        "backend_url": public_url,
        "internal_backend_url": internal_base_url,
        "host_port": host_port,
        "internal_port": INTERNAL_PORT,
        "runtime_status": runtime_status,
        "started_at": datetime.utcnow().isoformat(),
        "command": command_used,
        "returncode": result.returncode,
        "stdout": result.stdout[-4000:],
        "stderr": result.stderr[-4000:],
        "failure_reason": failure_reason,
        "service_states": service_states,
        "service_state_error": service_state_error,
        "compose_ps": compose_ps,
        "compose_logs": compose_logs,
        "last_backend_check": health_check,
    }
    upsert_project_meta(payload)
    append_project_run(payload)
    log_session_event(
        session_id,
        "project",
        "start_command_finished",
        {
            "runtime_status": runtime_status,
            "preview_url": public_url,
            "host_port": host_port,
            "returncode": result.returncode,
            "failure_reason": failure_reason,
        },
    )
    return payload


# ---------------------------------------------------------------------------
# 停止项目
# ---------------------------------------------------------------------------

def stop_project_for_session(session_id: str) -> dict:
    """停止会话对应项目的容器(docker compose stop,保留容器便于快速再启动)。"""
    session = load_session(session_id)
    if session is None:
        raise FileNotFoundError(session_id)

    project_dir = PROJECT_ROOT / session.project_slug
    compose_path = project_dir / "docker-compose.yml"
    if not compose_path.exists():
        raise RuntimeError("该项目还没有启动过,没有可停止的容器。")

    compose_base = _resolve_compose_command()
    if compose_base is None:
        raise RuntimeError("docker 或 docker-compose 不可用,无法停止项目。")
    compose_command = [*compose_base, "-p", session.project_slug, "-f", str(compose_path)]

    result = subprocess.run(
        [*compose_command, "stop"],
        cwd=project_dir,
        capture_output=True,
        text=True,
        check=False,
        timeout=120,
    )
    log_session_event(
        session_id,
        "project",
        "stop_command_finished",
        {
            "returncode": result.returncode,
            "stdout": result.stdout[-2000:],
            "stderr": result.stderr[-2000:],
        },
    )

    stopped_ok = result.returncode == 0
    upsert_project_meta(
        {
            "session_id": session.id,
            "project_slug": session.project_slug,
            "runtime_status": "stopped" if stopped_ok else "failed",
            "failure_reason": None if stopped_ok else "compose_stop_failed",
        }
    )
    return {
        "session_id": session.id,
        "project_slug": session.project_slug,
        "runtime_status": "stopped" if stopped_ok else "failed",
        "returncode": result.returncode,
        "stdout": result.stdout[-2000:],
        "stderr": result.stderr[-2000:],
    }


__all__ = [
    "refresh_project_entry_runtime",
    "start_project_for_session",
    "stop_project_for_session",
    "write_deploy_files",
]
