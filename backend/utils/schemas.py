from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class Message(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class StepEvent(BaseModel):
    type: Literal["status", "thinking", "step", "tool", "result", "done", "error"]
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


class SessionSummary(BaseModel):
    id: str
    title: str
    project_slug: str
    status: Literal["idle", "running", "done", "error"] = "idle"
    last_message: str = ""
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SessionDetail(SessionSummary):
    messages: list[Message] = Field(default_factory=list)
    steps: list[StepEvent] = Field(default_factory=list)
    preview_url: str | None = None


class ChatRequest(BaseModel):
    prompt: str


class SessionCreateRequest(BaseModel):
    prompt: str


class ToolAction(BaseModel):
    action: Literal["list", "read", "write", "mkdir"]
    path: str = ""
    content: str = ""


class ToolResult(BaseModel):
    ok: bool
    message: str
    data: dict[str, Any] = Field(default_factory=dict)
