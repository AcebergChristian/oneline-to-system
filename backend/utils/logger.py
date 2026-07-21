from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import Request

from .config import LOGS_DIR


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Unsupported type: {type(value)!r}")


def _safe_name(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_.-]+", "_", value).strip("_") or "unknown"


def _log_path(scope: str, channel: str) -> Path:
    return LOGS_DIR / f"{_safe_name(scope)}.{_safe_name(channel)}.jsonl"


def log_event(scope: str, channel: str, event: str, payload: dict[str, Any] | None = None) -> None:
    entry = {
        "ts": datetime.utcnow().isoformat(),
        "scope": scope,
        "channel": channel,
        "event": event,
        "payload": payload or {},
    }
    path = _log_path(scope, channel)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.open("a", encoding="utf-8").write(
        json.dumps(entry, ensure_ascii=False, default=_json_default) + "\n"
    )


def log_session_event(session_id: str, channel: str, event: str, payload: dict[str, Any] | None = None) -> None:
    log_event(session_id, channel, event, payload)


def log_system_event(channel: str, event: str, payload: dict[str, Any] | None = None) -> None:
    log_event("system", channel, event, payload)


def extract_session_id_from_request(request: Request) -> str | None:
    session_id = request.path_params.get("session_id")
    if session_id:
        return str(session_id)

    parts = [part for part in request.url.path.split("/") if part]
    if "sessions" in parts:
        index = parts.index("sessions")
        if len(parts) > index + 1:
            return parts[index + 1]
    return None
