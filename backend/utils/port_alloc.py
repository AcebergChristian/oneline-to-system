"""端口分配工具。

核心原则:生成项目的宿主端口绝不拍脑袋,必须先收集「已被占用」的端口再挑选空闲端口。

占用来源:
1. 宿主机 Docker daemon 上所有容器已发布的端口(`docker ps`);
2. `project/` 下每个项目 docker-compose.yml 中已分配的宿主端口(即使容器当前没跑,
   该端口也视为已被那个项目预留,避免两个项目分到同一个端口);
3. `backend/data/projects.json` 元数据里记录过的端口;
4. 主控自身的端口(BACKEND_PORT / FRONTEND_PORT)。
"""
from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

import yaml

from .config import PROJECT_ROOT, PROJECTS_META_PATH, get_settings, project_index


# 生成项目后端宿主端口的分配区间:默认从 8001 开始自增。
PORT_BASE = 8000
PORT_MIN = 8001
PORT_MAX = 8999
# 8001-8999 全部占满时的备用区间。
OVERFLOW_MIN = 9100
OVERFLOW_MAX = 9299

_PORT_MAPPING_RE = re.compile(r"(\d{1,5})->(\d{1,5})/(?:tcp|udp)")
_URL_PORT_RE = re.compile(r":(\d{2,5})/?$")


def _docker_ports(args: list[str]) -> set[int]:
    docker_path = shutil.which("docker")
    if not docker_path:
        return set()
    try:
        result = subprocess.run(
            [docker_path, "ps", *args, "--format", "{{.Ports}}"],
            capture_output=True,
            text=True,
            check=False,
            timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired):
        return set()
    if result.returncode != 0:
        return set()

    ports: set[int] = set()
    for match in _PORT_MAPPING_RE.finditer(result.stdout):
        ports.add(int(match.group(1)))
    return ports


def _docker_published_ports(exclude_compose_project: str | None = None) -> set[int]:
    """读取宿主机 Docker daemon 上所有容器已发布的宿主端口。

    exclude_compose_project: 排除该项目自己的容器所发布的端口——
    否则项目重启时会误以为自己的端口被占用,导致端口不断漂移。
    """
    ports = _docker_ports([])
    if exclude_compose_project:
        own_ports = _docker_ports(
            ["--filter", f"label=com.docker.compose.project={exclude_compose_project}"]
        )
        ports -= own_ports
    return ports


def _compose_host_ports(compose_path: Path) -> set[int]:
    """解析一个 docker-compose.yml 中声明的宿主端口。"""
    try:
        payload = yaml.safe_load(compose_path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return set()

    services = payload.get("services")
    if not isinstance(services, dict):
        return set()

    ports: set[int] = set()
    for service in services.values():
        if not isinstance(service, dict):
            continue
        for entry in service.get("ports") or []:
            host_port = _extract_host_port(entry)
            if host_port is not None:
                ports.add(host_port)
    return ports


def _extract_host_port(entry: object) -> int | None:
    if isinstance(entry, dict):
        # 长语法: {published: 8006, target: 8000, ...}
        published = entry.get("published")
        if published is None:
            return None
        try:
            return int(published)
        except (TypeError, ValueError):
            return None

    if isinstance(entry, int):
        # 纯数字只暴露容器端口,不发布宿主端口
        return None

    if isinstance(entry, str):
        text = entry.strip()
        # 形如 "8006:8000" 或 "127.0.0.1:8006:8000"
        if ":" not in text:
            return None
        host_part = text.split(":")[-2]
        try:
            return int(host_part)
        except ValueError:
            return None
    return None


def _meta_recorded_ports(exclude_project_slug: str | None = None) -> set[int]:
    """从 projects.json 元数据里收集曾经分配过的端口。"""
    import json

    ports: set[int] = set()
    try:
        entries = json.loads(PROJECTS_META_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ports
    if not isinstance(entries, list):
        return ports

    for entry in entries:
        if not isinstance(entry, dict):
            continue
        if exclude_project_slug and entry.get("project_slug") == exclude_project_slug:
            continue
        for key in ("internal_backend_url", "backend_url", "internal_preview_url", "preview_url"):
            value = str(entry.get(key) or "")
            match = _URL_PORT_RE.search(value)
            if match:
                ports.add(int(match.group(1)))
    return ports


def ports_in_use(exclude_project_slug: str | None = None) -> set[int]:
    """汇总当前所有被占用的宿主端口。

    exclude_project_slug: 该项目自己 compose/meta 里的端口不计入「占用」,
    这样项目重启时可以继续复用自己原来的端口。
    """
    used: set[int] = set()
    settings = get_settings()
    used.add(settings.backend_port)
    used.add(settings.frontend_port)

    used |= _docker_published_ports(exclude_compose_project=exclude_project_slug)
    used |= _meta_recorded_ports(exclude_project_slug=exclude_project_slug)

    if PROJECT_ROOT.exists():
        for project_dir in sorted(PROJECT_ROOT.iterdir()):
            if not project_dir.is_dir():
                continue
            if exclude_project_slug and project_dir.name == exclude_project_slug:
                continue
            compose_path = project_dir / "docker-compose.yml"
            if compose_path.exists():
                used |= _compose_host_ports(compose_path)
    return used


def parse_port_from_url(url: str | None) -> int | None:
    if not url:
        return None
    match = _URL_PORT_RE.search(str(url))
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def allocate_backend_port(
    project_slug: str,
    current_port: int | None = None,
    extra_excluded: set[int] | None = None,
) -> int:
    """为项目挑选一个空闲的宿主后端端口。

    优先级:
    1. 项目当前已在用的端口(仍然空闲则原样复用,保证 URL 稳定);
    2. 8000 + 项目序号(约定的自增起点);
    3. 从自增起点向上逐个扫描;
    4. 备用区间 9100-9299。
    """
    used = ports_in_use(exclude_project_slug=project_slug)
    if extra_excluded:
        used |= extra_excluded

    if current_port and PORT_MIN <= current_port <= OVERFLOW_MAX and current_port not in used:
        return current_port

    preferred = PORT_BASE + project_index(project_slug)
    if PORT_MIN <= preferred <= PORT_MAX and preferred not in used:
        return preferred

    port = max(preferred, PORT_MIN)
    while port <= PORT_MAX:
        if port not in used:
            return port
        port += 1

    port = OVERFLOW_MIN
    while port <= OVERFLOW_MAX:
        if port not in used:
            return port
        port += 1

    raise RuntimeError("没有可分配的宿主端口:8001-8999 与 9100-9299 均已被占用。")
