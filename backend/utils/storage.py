from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from .config import LOGS_DIR, PROJECTS_META_PATH, PROJECT_EVENTS_PATH, PROJECT_RUNS_PATH, SESSIONS_DIR
from .schemas import Message, SessionDetail, SessionSummary, StepEvent


def _session_path(session_id: str) -> Path:
    return SESSIONS_DIR / f"{session_id}.json"


def _session_messages_log_path(session_id: str) -> Path:
    return LOGS_DIR / f"{session_id}.messages.jsonl"


def _session_steps_log_path(session_id: str) -> Path:
    return LOGS_DIR / f"{session_id}.steps.jsonl"


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Unsupported type: {type(value)!r}")


def _append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.open("a", encoding="utf-8").write(
        json.dumps(payload, ensure_ascii=False, default=_json_default) + "\n"
    )


def list_sessions() -> list[SessionSummary]:
    sessions: list[SessionSummary] = []
    for path in sorted(SESSIONS_DIR.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        sessions.append(SessionSummary(**data))
    return sorted(sessions, key=lambda item: item.updated_at, reverse=True)


def load_session(session_id: str) -> SessionDetail | None:
    path = _session_path(session_id)
    if not path.exists():
        return None
    return SessionDetail(**json.loads(path.read_text(encoding="utf-8")))


def save_session(session: SessionDetail) -> None:
    path = _session_path(session.id)
    path.write_text(
        json.dumps(session.model_dump(), ensure_ascii=False, indent=2, default=_json_default) + "\n",
        encoding="utf-8",
    )


def append_message(session_id: str, message: Message) -> SessionDetail:
    session = load_session(session_id)
    if session is None:
        raise FileNotFoundError(session_id)
    session.messages.append(message)
    session.last_message = message.content
    session.updated_at = datetime.utcnow()
    save_session(session)
    _append_jsonl(
        _session_messages_log_path(session_id),
        {
            "session_id": session_id,
            "event": "message",
            "message": message.model_dump(),
            "updated_at": session.updated_at,
        },
    )
    return session


def append_step(session_id: str, step: StepEvent, status: str | None = None) -> SessionDetail:
    session = load_session(session_id)
    if session is None:
        raise FileNotFoundError(session_id)
    session.steps.append(step)
    session.updated_at = datetime.utcnow()
    if status:
        session.status = status
    save_session(session)
    _append_jsonl(
        _session_steps_log_path(session_id),
        {
            "session_id": session_id,
            "event": "step",
            "step": step.model_dump(),
            "status": session.status,
            "updated_at": session.updated_at,
        },
    )
    return session


def create_session(session: SessionDetail) -> SessionDetail:
    save_session(session)
    _append_jsonl(
        _session_messages_log_path(session.id),
        {
            "session_id": session.id,
            "event": "session_created",
            "project_slug": session.project_slug,
            "title": session.title,
            "created_at": session.updated_at,
        },
    )
    return session


def save_project_meta(entries: list[dict[str, Any]]) -> None:
    PROJECTS_META_PATH.write_text(
        json.dumps(entries, ensure_ascii=False, indent=2, default=_json_default) + "\n",
        encoding="utf-8",
    )


def load_project_meta() -> list[dict[str, Any]]:
    if not PROJECTS_META_PATH.exists():
        return []
    return json.loads(PROJECTS_META_PATH.read_text(encoding="utf-8"))


def get_project_meta(session_id: str) -> dict[str, Any] | None:
    for entry in load_project_meta():
        if entry.get("session_id") == session_id:
            return entry
    return None


def upsert_project_meta(entry: dict[str, Any]) -> list[dict[str, Any]]:
    entries = load_project_meta()
    replaced = False
    for index, current in enumerate(entries):
        if current.get("session_id") == entry.get("session_id"):
            merged = {**current, **entry}
            entries[index] = merged
            replaced = True
            break
    if not replaced:
        entries.append(entry)
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for current in reversed(entries):
        session_id = str(current.get("session_id", ""))
        if session_id in seen:
            continue
        seen.add(session_id)
        deduped.append(current)
    deduped.reverse()
    save_project_meta(deduped)
    _append_jsonl(PROJECT_EVENTS_PATH, {"event": "project_meta_upserted", "payload": entry, "written_at": datetime.utcnow()})
    return deduped


def append_project_run(payload: dict[str, Any]) -> None:
    _append_jsonl(PROJECT_RUNS_PATH, payload)
