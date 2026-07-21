from __future__ import annotations

import json
from contextlib import asynccontextmanager
from time import perf_counter

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import uvicorn

from utils.agent import build_session, persist_stream, stream_agent_run
from utils.config import ensure_data_dirs, get_settings
from utils.logger import extract_session_id_from_request, log_session_event, log_system_event
from utils.project_tools import run_tool_action
from utils.project_runner import refresh_project_entry_runtime, start_project_for_session
from utils.schemas import ChatRequest, Message, SessionCreateRequest, StepEvent, ToolAction
from utils.storage import append_message, append_step, list_sessions, load_project_meta, load_session, save_project_meta


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_data_dirs()
    yield


app = FastAPI(title="DeepWisdom Demo Backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    started = perf_counter()
    session_id = extract_session_id_from_request(request)
    scope = session_id or "system"
    payload = {
        "method": request.method,
        "path": request.url.path,
        "query": str(request.url.query),
        "client": request.client.host if request.client else None,
    }
    if session_id:
        log_session_event(session_id, "api", "request_started", payload)
    else:
        log_system_event("api", "request_started", payload)

    try:
        response = await call_next(request)
    except Exception as exc:  # noqa: BLE001
        duration_ms = round((perf_counter() - started) * 1000, 2)
        error_payload = {**payload, "duration_ms": duration_ms, "error": str(exc)}
        if session_id:
            log_session_event(session_id, "api", "request_failed", error_payload)
        else:
            log_system_event("api", "request_failed", error_payload)
        raise

    duration_ms = round((perf_counter() - started) * 1000, 2)
    done_payload = {**payload, "status_code": response.status_code, "duration_ms": duration_ms}
    if session_id:
        log_session_event(session_id, "api", "request_finished", done_payload)
    else:
        log_system_event("api", "request_finished", done_payload)
    return response


@app.get("/api/health")
def health():
    settings = get_settings()
    return {"ok": True, "model": settings.openai_model, "memory_window": settings.ai_memory_window}


@app.get("/api/sessions")
def get_sessions():
    return list_sessions()


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str):
    session = load_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.post("/api/sessions")
def create_session(payload: SessionCreateRequest):
    session = build_session(payload.prompt)
    log_session_event(
        session.id,
        "api",
        "session_created",
        {"title": session.title, "project_slug": session.project_slug, "prompt_length": len(payload.prompt)},
    )
    return session


@app.post("/api/sessions/{session_id}/messages")
def post_message(session_id: str, payload: ChatRequest):
    session = load_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    updated = append_message(session_id, Message(role="user", content=payload.prompt))
    log_session_event(session_id, "api", "message_received", {"prompt_length": len(payload.prompt)})
    return updated


@app.get("/api/sessions/{session_id}/stream")
async def stream_session(session_id: str):
    session = load_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    prompt = session.messages[-1].content if session.messages else session.title
    log_session_event(session_id, "api", "stream_opened", {"prompt_length": len(prompt)})

    async def event_generator():
        stream = persist_stream(session.id, stream_agent_run(session, prompt))
        async for event in stream:
            yield f"data: {json.dumps(event.model_dump(mode='json'), ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/projects")
def get_projects():
    entries = load_project_meta()
    refreshed = [refresh_project_entry_runtime(entry) for entry in entries]
    if refreshed != entries:
        save_project_meta(refreshed)
    return refreshed


@app.post("/api/sessions/{session_id}/tools")
def execute_tool(session_id: str, payload: ToolAction):
    session = load_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    result = run_tool_action(session.project_slug, payload)
    log_session_event(
        session_id,
        "api",
        "manual_tool_executed",
        {"action": payload.action, "path": payload.path, "ok": result.ok, "message": result.message},
    )
    return result


@app.post("/api/sessions/{session_id}/start")
def start_project(session_id: str):
    session = load_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    try:
        log_session_event(session_id, "api", "project_start_requested", {})
        result = start_project_for_session(session_id)
        step_type = "status" if result.get("runtime_status") == "running" else "error"
        summary = (
            f"项目启动结果: {result.get('runtime_status')}.\n"
            f"预览地址: {result.get('preview_url') or '无'}\n"
            f"失败原因: {result.get('failure_reason') or '无'}\n"
            f"stderr: {(result.get('stderr') or '')[-800:]}\n"
            f"stdout: {(result.get('stdout') or '')[-800:]}\n"
            "如果需要修复，请继续在当前会话直接描述要补什么，Agent 会基于现有 project 和失败日志继续修改。"
        )
        append_step(
            session_id,
            StepEvent(type=step_type, content=summary, metadata=result),
            status="running" if result.get("runtime_status") == "running" else "error",
        )
        return result
    except FileNotFoundError as exc:
        log_session_event(session_id, "api", "project_start_not_found", {"detail": str(exc)})
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        log_session_event(session_id, "api", "project_start_runtime_error", {"detail": str(exc)})
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        log_session_event(session_id, "api", "project_start_error", {"detail": str(exc)})
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/config")
def get_config():
    settings = get_settings()
    return {
        "model": settings.openai_model,
        "memory_window": settings.ai_memory_window,
        "frontend_port": settings.frontend_port,
        "backend_port": settings.backend_port,
    }


if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "main:app",
        host=settings.backend_host,
        port=settings.backend_port,
        reload=False,
        app_dir="backend",
    )
