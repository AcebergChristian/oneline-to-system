from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime
from typing import Any
from uuid import uuid4

from openai import OpenAI

from .config import PROJECT_ROOT, get_settings
from .logger import log_session_event
from .project_tools import run_tool_action
from .schemas import Message, SessionDetail, StepEvent, ToolAction, ToolResult
from .storage import append_message, create_session, get_project_meta, save_session, upsert_project_meta


SYSTEM_PROMPT = """
You are a software-building agent inside a controlled workspace.

You must create a real project inside the assigned project directory using only the provided tools.

Rules:
- You may only operate inside the assigned project root.
- Never read or write any .env file or any path outside the assigned project root.
- Build a complete deliverable for the user's request:
  - frontend/
  - backend/
  - Dockerfile
  - docker-compose.yml
- The frontend stack must be React.
- The backend stack must be Python FastAPI.
- Data storage inside generated projects should use JSON or JSONL files rather than a database unless the user explicitly asks otherwise.
- Keep files practical and runnable. Prefer a small but real implementation over placeholders.
- If you need to inspect existing generated files, use tools first.
- Every generated project must use its own backend port and must not reuse the main controller backend port.
- For projectN, use frontend preview port 300N and backend API port 800N unless the existing project files already define a different project-specific port plan that still avoids 8000.

Execution contract:
- First produce a concise execution plan.
- Then call tools to create directories and files.
- After tool execution is complete, return a concise final summary that mentions what was created and any startup commands.
""".strip()


PLAN_PROMPT = """
Read the recent conversation and produce a concise build plan.
Return plain text with:
1. Scope
2. Files/services to create
3. Execution steps
Keep it under 12 lines.
""".strip()


def slugify(value: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return base[:36] or f"project-{uuid4().hex[:8]}"


def next_project_slug() -> str:
    existing = {path.name for path in PROJECT_ROOT.iterdir() if path.is_dir()}
    index = 1
    while f"project{index}" in existing:
        index += 1
    return f"project{index}"


def preview_url_for_slug(project_slug: str) -> str:
    match = re.search(r"(\d+)$", project_slug)
    index = int(match.group(1)) if match else 1
    return f"http://localhost:{3000 + index}"


def backend_url_for_slug(project_slug: str) -> str:
    match = re.search(r"(\d+)$", project_slug)
    index = int(match.group(1)) if match else 1
    return f"http://localhost:{8000 + index}"


def build_session(prompt: str) -> SessionDetail:
    session_id = uuid4().hex
    project_slug = next_project_slug()
    title = prompt[:24] or "New Session"
    session = SessionDetail(
        id=session_id,
        title=title,
        project_slug=project_slug,
        status="idle",
        last_message=prompt,
        messages=[Message(role="user", content=prompt)],
        steps=[],
        preview_url=preview_url_for_slug(project_slug),
    )
    create_session(session)
    log_session_event(
        session.id,
        "agent",
        "session_initialized",
        {"project_slug": project_slug, "title": title, "preview_url": session.preview_url},
    )
    return session


def _client() -> OpenAI:
    settings = get_settings()
    return OpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)


def _chat_messages_from_history(messages: list[Message]) -> list[dict[str, str]]:
    items: list[dict[str, Any]] = []
    for message in messages:
        items.append({"role": message.role, "content": message.content})
    return items


def _project_metadata(session: SessionDetail) -> dict[str, Any]:
    project_dir = PROJECT_ROOT / session.project_slug
    return {
        "session_id": session.id,
        "project_slug": session.project_slug,
        "title": session.title,
        "path": str(project_dir.relative_to(PROJECT_ROOT.parent)),
        "created_at": datetime.utcnow().isoformat(),
        "preview_url": session.preview_url,
        "backend_url": backend_url_for_slug(session.project_slug),
    }


def _tool_specs(project_slug: str, preview_url: str) -> list[dict[str, Any]]:
    backend_url = backend_url_for_slug(project_slug)
    path_description = (
        f"Relative path inside project/{project_slug}. "
        "Do not use absolute paths. Do not target .env files."
    )
    return [
        {
            "type": "function",
            "function": {
                "name": "list",
                "description": f"List files or folders inside project/{project_slug}.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": path_description},
                    },
                    "required": ["path"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "read",
                "description": f"Read a UTF-8 text file inside project/{project_slug}.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": path_description},
                    },
                    "required": ["path"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "mkdir",
                "description": f"Create a directory inside project/{project_slug}.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": path_description},
                    },
                    "required": ["path"],
                    "additionalProperties": False,
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "write",
                "description": (
                    f"Write a UTF-8 text file inside project/{project_slug}. "
                    f"Use this to create frontend, backend, Dockerfile and docker-compose.yml. "
                    f"Generated app should be previewable at {preview_url} when the frontend is started. "
                    f"The generated backend API must use the project-specific port {backend_url}, not the controller backend port 8000."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": path_description},
                        "content": {"type": "string", "description": "Complete file content to write."},
                    },
                    "required": ["path", "content"],
                    "additionalProperties": False,
                },
            },
        },
    ]


def _runtime_context(session: SessionDetail) -> str:
    project = get_project_meta(session.id)
    if not project:
        return "No runtime information recorded yet."

        return (
        "Latest project runtime context:\n"
        f"- runtime_status: {project.get('runtime_status', 'unknown')}\n"
        f"- preview_url: {project.get('preview_url', session.preview_url or '')}\n"
        f"- backend_url: {project.get('backend_url', backend_url_for_slug(session.project_slug))}\n"
        f"- failure_reason: {project.get('failure_reason', '')}\n"
        f"- last_command: {project.get('command', [])}\n"
        f"- stdout_tail: {project.get('stdout', '')[-1200:]}\n"
        f"- stderr_tail: {project.get('stderr', '')[-1200:]}\n"
        "If the user asks to fix startup, inspect the current files first and then update the generated project."
    )


def _assistant_message(response: Any) -> Any:
    return response.choices[0].message


def _tool_result_payload(result: ToolResult) -> dict[str, Any]:
    return {
        "ok": result.ok,
        "message": result.message,
        "data": result.data,
    }


def _run_tool_call(project_slug: str, call: Any) -> tuple[ToolResult, dict[str, Any], str]:
    function = getattr(call, "function", None)
    name = getattr(function, "name", "")
    raw_arguments = getattr(function, "arguments", "") or "{}"
    arguments = json.loads(raw_arguments)
    path = arguments.get("path", "")
    content = arguments.get("content", "")
    result = run_tool_action(project_slug, ToolAction(action=name, path=path, content=content))
    payload = _tool_result_payload(result)
    output_item = {
        "role": "tool",
        "tool_call_id": getattr(call, "id", ""),
        "content": json.dumps(payload, ensure_ascii=False),
    }
    summary = f"{name} {path}".strip()
    return result, output_item, summary


async def _create_completion(**kwargs: Any) -> Any:
    return await asyncio.to_thread(_client().chat.completions.create, **kwargs)


async def _plan_response(session: SessionDetail, history: list[Message]) -> str:
    log_session_event(
        session.id,
        "llm",
        "plan_request_started",
        {"model": get_settings().openai_model, "history_count": len(history)},
    )
    response = await _create_completion(
        model=get_settings().openai_model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            *_chat_messages_from_history(history),
            {"role": "user", "content": PLAN_PROMPT},
        ],
    )
    plan_text = (response.choices[0].message.content or "").strip()
    log_session_event(
        session.id,
        "llm",
        "plan_request_finished",
        {"has_text": bool(plan_text), "chars": len(plan_text)},
    )
    return plan_text or "模型未返回计划文本。"


async def stream_agent_run(session: SessionDetail, prompt: str):
    try:
        settings = get_settings()
        session.status = "running"
        save_session(session)
        log_session_event(
            session.id,
            "agent",
            "run_started",
            {
                "project_slug": session.project_slug,
                "prompt_length": len(prompt),
                "memory_window": settings.ai_memory_window,
                "model": settings.openai_model,
            },
        )

        if not settings.openai_api_key:
            log_session_event(session.id, "agent", "missing_api_key", {})
            yield StepEvent(type="error", content="缺少 OPENAI_API_KEY，真实 Agent 未启动。请先在根目录 .env 中配置模型密钥。")
            return

        history = session.messages[-settings.ai_memory_window :]
        upsert_project_meta(_project_metadata(session))
        yield StepEvent(
            type="status",
            content="真实 Agent 已启动，开始读取最近历史并规划执行。",
            metadata={"memory_window": settings.ai_memory_window, "project_slug": session.project_slug},
        )

        plan_text = await _plan_response(session, history)
        log_session_event(session.id, "agent", "plan_generated", {"chars": len(plan_text)})
        yield StepEvent(type="step", content=plan_text)

        project_slug = session.project_slug
        project_dir = PROJECT_ROOT / project_slug
        project_dir.mkdir(parents=True, exist_ok=True)

        messages: list[dict[str, Any]] = [
            {
                "role": "system",
                "content": (
                    f"{SYSTEM_PROMPT}\n\n"
                    f"Assigned project root: project/{project_slug}\n"
                    f"Required preview URL target: {session.preview_url}\n"
                    f"Required backend API target: {backend_url_for_slug(project_slug)}\n"
                    f"{_runtime_context(session)}\n"
                    "Create a real implementation now."
                ),
            },
            *_chat_messages_from_history(history),
            {
                "role": "assistant",
                "content": f"Execution plan:\n{plan_text}",
            },
        ]

        log_session_event(
            session.id,
            "llm",
            "tool_loop_request_started",
            {"message_count": len(messages), "tools_enabled": True},
        )
        response = await _create_completion(
            model=settings.openai_model,
            messages=messages,
            tools=_tool_specs(project_slug, session.preview_url or ""),
        )
        log_session_event(session.id, "llm", "tool_loop_request_finished", {})

        round_index = 0
        while True:
            message = _assistant_message(response)
            if getattr(message, "content", None):
                log_session_event(
                    session.id,
                    "agent",
                    "assistant_thinking",
                    {"chars": len(message.content), "round_index": round_index},
                )
                yield StepEvent(type="thinking", content=message.content)

            function_calls = list(getattr(message, "tool_calls", None) or [])
            if not function_calls:
                log_session_event(session.id, "agent", "tool_loop_completed", {"rounds": round_index})
                break

            round_index += 1
            if round_index > settings.ai_max_tool_rounds:
                log_session_event(session.id, "agent", "tool_round_limit_exceeded", {"limit": settings.ai_max_tool_rounds})
                yield StepEvent(type="error", content="工具调用轮次超过限制，已中止。")
                return

            messages.append(
                {
                    "role": "assistant",
                    "content": message.content or "",
                    "tool_calls": [
                        {
                            "id": call.id,
                            "type": call.type,
                            "function": {
                                "name": call.function.name,
                                "arguments": call.function.arguments,
                            },
                        }
                        for call in function_calls
                    ],
                }
            )

            for call in function_calls:
                result, output_item, summary = _run_tool_call(project_slug, call)
                log_session_event(
                    session.id,
                    "tool",
                    "tool_called",
                    {
                        "summary": summary,
                        "name": getattr(call.function, "name", ""),
                        "arguments": getattr(call.function, "arguments", ""),
                        "ok": result.ok,
                    },
                )
                yield StepEvent(
                    type="tool",
                    content=summary,
                    metadata={
                        "ok": result.ok,
                        "name": getattr(call.function, "name", ""),
                        "path": json.loads(getattr(call.function, "arguments", "") or "{}").get("path", ""),
                    },
                )
                log_session_event(
                    session.id,
                    "tool",
                    "tool_result",
                    _tool_result_payload(result) | {"summary": summary},
                )
                yield StepEvent(type="result", content=result.message, metadata=_tool_result_payload(result))
                messages.append(output_item)

            log_session_event(
                session.id,
                "llm",
                "tool_followup_request_started",
                {"round_index": round_index, "message_count": len(messages)},
            )
            response = await _create_completion(
                model=settings.openai_model,
                messages=messages,
                tools=_tool_specs(project_slug, session.preview_url or ""),
            )
            log_session_event(session.id, "llm", "tool_followup_request_finished", {"round_index": round_index})

        final_text = (_assistant_message(response).content or "").strip()
        if not final_text:
            final_text = (
                f"已完成 project/{project_slug} 的生成。请检查 frontend、backend、Dockerfile 与 docker-compose.yml。"
            )

        append_message(session.id, Message(role="assistant", content=final_text))
        upsert_project_meta(_project_metadata(session))
        log_session_event(
            session.id,
            "agent",
            "run_completed",
            {"final_chars": len(final_text), "project_path": str(project_dir.relative_to(PROJECT_ROOT.parent))},
        )
        yield StepEvent(
            type="done",
            content=final_text,
            metadata={"project_path": str(project_dir.relative_to(PROJECT_ROOT.parent))},
        )
    except Exception as exc:  # noqa: BLE001
        log_session_event(session.id, "agent", "run_failed", {"error": str(exc)})
        yield StepEvent(type="error", content=f"Agent 执行失败: {exc}")


async def persist_stream(session_id: str, stream):
    async for event in stream:
        status = None
        if event.type == "done":
            status = "done"
        elif event.type == "error":
            status = "error"
        else:
            status = "running"
        from .storage import append_step

        append_step(session_id, event, status=status)
        yield event
