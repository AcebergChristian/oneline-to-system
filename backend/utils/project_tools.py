from __future__ import annotations

from pathlib import Path

from .config import PROJECT_ROOT
from .schemas import ToolAction, ToolResult


BLOCKED_NAMES = {".env", ".env.local", ".env.production", ".env.development"}


def _resolve_project_path(project_slug: str, relative_path: str) -> Path:
    project_dir = (PROJECT_ROOT / project_slug).resolve()
    target = (project_dir / relative_path).resolve()
    if project_dir not in [target, *target.parents]:
        raise PermissionError("Path escapes project root")
    if any(part in BLOCKED_NAMES for part in target.parts):
        raise PermissionError("Sensitive env files are blocked")
    return target


def run_tool_action(project_slug: str, action: ToolAction) -> ToolResult:
    try:
        project_dir = (PROJECT_ROOT / project_slug).resolve()
        project_dir.mkdir(parents=True, exist_ok=True)
        if action.action == "list":
            target = _resolve_project_path(project_slug, action.path or ".")
            entries = []
            for child in sorted(target.iterdir()):
                entries.append({"name": child.name, "is_dir": child.is_dir()})
            return ToolResult(ok=True, message="listed", data={"entries": entries})

        if action.action == "read":
            target = _resolve_project_path(project_slug, action.path)
            return ToolResult(ok=True, message="read", data={"content": target.read_text(encoding="utf-8")})

        if action.action == "mkdir":
            target = _resolve_project_path(project_slug, action.path)
            target.mkdir(parents=True, exist_ok=True)
            return ToolResult(ok=True, message="created", data={"path": str(target.relative_to(project_dir))})

        if action.action == "write":
            target = _resolve_project_path(project_slug, action.path)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(action.content, encoding="utf-8")
            return ToolResult(ok=True, message="written", data={"path": str(target.relative_to(project_dir))})

        return ToolResult(ok=False, message=f"Unsupported action: {action.action}")
    except Exception as exc:  # noqa: BLE001
        return ToolResult(ok=False, message=str(exc))
