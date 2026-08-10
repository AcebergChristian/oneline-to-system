from __future__ import annotations

import json
from contextlib import asynccontextmanager
from pathlib import Path
from time import perf_counter
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
import httpx
import uvicorn

from utils.agent import build_session, persist_stream, stream_agent_run
from utils.config import ensure_data_dirs, get_settings
from utils.logger import extract_session_id_from_request, log_session_event, log_system_event
from utils.project_tools import run_tool_action
from utils.project_runner import refresh_project_entry_runtime, start_project_for_session
from utils.schemas import ChatRequest, Message, ProjectDeploymentUpdate, SessionCreateRequest, StepEvent, ToolAction
from utils.storage import (
    append_message,
    append_step,
    get_project_meta,
    get_project_meta_by_slug,
    list_sessions,
    load_project_meta,
    load_session,
    save_project_meta,
    upsert_project_meta,
)


FRONTEND_DIST_DIR = Path(__file__).resolve().parents[1] / "frontend" / "dist"


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

if FRONTEND_DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST_DIR / "assets"), name="frontend-assets")


PROXY_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]
TEXT_CONTENT_TYPES = (
    "text/",
    "application/javascript",
    "application/json",
    "application/manifest+json",
    "application/xml",
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
        runtime_status = result.get("runtime_status")
        step_type = "status" if runtime_status in {"running", "provisioning"} else "error"
        summary = (
            f"项目启动结果: {runtime_status}.\n"
            f"预览地址: {result.get('preview_url') or '无'}\n"
            f"失败原因: {result.get('failure_reason') or '无'}\n"
            f"stderr: {(result.get('stderr') or '')[-800:]}\n"
            f"stdout: {(result.get('stdout') or '')[-800:]}\n"
            "如果需要修复，请继续在当前会话直接描述要补什么，Agent 会基于现有 project 和失败日志继续修改。"
        )
        append_step(
            session_id,
            StepEvent(type=step_type, content=summary, metadata=result),
            status="running" if runtime_status in {"running", "provisioning"} else "error",
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


@app.patch("/api/projects/{session_id}")
def update_project_deployment(session_id: str, payload: ProjectDeploymentUpdate, request: Request):
    session = load_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    preview_url = _validate_external_deployment_url(payload.preview_url, request)
    backend_url = _validate_external_deployment_url(payload.backend_url, request)

    existing = get_project_meta(session_id) or {
        "session_id": session.id,
        "project_slug": session.project_slug,
        "title": session.title,
        "path": f"project/{session.project_slug}",
    }
    updated = {
        **existing,
        "preview_url": preview_url or existing.get("preview_url") or session.preview_url,
        "backend_url": backend_url or existing.get("backend_url") or session.backend_url,
    }
    upsert_project_meta(updated)
    log_session_event(
        session_id,
        "api",
        "project_deployment_updated",
        {"preview_url": updated.get("preview_url"), "backend_url": updated.get("backend_url")},
    )
    return updated


@app.get("/api/config")
def get_config():
    settings = get_settings()
    return {
        "model": settings.openai_model,
        "memory_window": settings.ai_memory_window,
        "frontend_port": settings.frontend_port,
        "backend_port": settings.backend_port,
        "project_runtime_mode": settings.project_runtime_mode,
        "project_preview_url_template": settings.project_preview_url_template,
        "project_backend_url_template": settings.project_backend_url_template,
        "render_auto_create": settings.render_auto_create,
        "render_configured": bool(settings.render_api_key and settings.render_owner_id and settings.render_repo_url),
        "render_git_push_enabled": settings.render_git_push_enabled,
    }


def _public_base_url(request: Request) -> str:
    settings = get_settings()
    if settings.public_base_url:
        return settings.public_base_url.rstrip("/")
    return str(request.base_url).rstrip("/")


def _project_proxy_urls(request: Request, project_slug: str) -> tuple[str, str]:
    base_url = _public_base_url(request)
    return (
        f"{base_url}/{project_slug}",
        f"{base_url}/{project_slug}/api",
    )


def _project_target_or_404(session_id: str, field: str) -> str:
    project = get_project_meta(session_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project metadata not found")
    target = project.get(field)
    if not target:
        raise HTTPException(status_code=404, detail=f"Project {field} not found")
    return str(target).rstrip("/")


def _project_target_by_slug_or_404(project_slug: str, field: str) -> str:
    project = get_project_meta_by_slug(project_slug)
    if project is None:
        raise HTTPException(status_code=404, detail="Project metadata not found")
    target = project.get(field)
    if not target:
        raise HTTPException(status_code=404, detail=f"Project {field} not found")
    return str(target).rstrip("/")


def _validate_external_deployment_url(url: str | None, request: Request) -> str | None:
    if not url:
        return None

    normalized = url.strip().rstrip("/")
    parsed = urlsplit(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="部署地址必须是完整的 http/https URL。")

    public_parsed = urlsplit(_public_base_url(request))
    if parsed.scheme == public_parsed.scheme and parsed.netloc == public_parsed.netloc and parsed.path.startswith("/project"):
        raise HTTPException(
            status_code=400,
            detail="请保存真实项目服务地址，不要保存主控代理地址。应填写类似 https://project6-frontend.onrender.com 和 https://project6-api.onrender.com。",
        )

    return normalized


def _join_target_url(base_url: str, path: str, query: str) -> str:
    suffix = f"/{path}" if path else ""
    target_url = f"{base_url}{suffix}"
    if query:
        target_url = f"{target_url}?{query}"
    return target_url


def _should_rewrite_content(content_type: str) -> bool:
    normalized = content_type.split(";", 1)[0].strip().lower()
    return any(normalized.startswith(prefix) for prefix in TEXT_CONTENT_TYPES)


def _rewrite_proxy_text(content: str, preview_proxy_url: str, backend_proxy_url: str, target_base_url: str) -> str:
    rewrites = [
        (f"{target_base_url}/api", f"{backend_proxy_url}/api"),
        (target_base_url, preview_proxy_url),
        ('"/static/', f'"{preview_proxy_url}/static/'),
        ("'/static/", f"'{preview_proxy_url}/static/"),
        ('"/assets/', f'"{preview_proxy_url}/assets/'),
        ("'/assets/", f"'{preview_proxy_url}/assets/"),
        ('href="/', f'href="{preview_proxy_url}/'),
        ("href='/", f"href='{preview_proxy_url}/"),
        ('src="/', f'src="{preview_proxy_url}/'),
        ("src='/", f"src='{preview_proxy_url}/"),
        ("url(/", f"url({preview_proxy_url}/"),
        ('"/api/', f'"{backend_proxy_url}/api/'),
        ("'/api/", f"'{backend_proxy_url}/api/"),
        ("`/api/", f"`{backend_proxy_url}/api/"),
    ]
    rewritten = content
    for source, target in rewrites:
        rewritten = rewritten.replace(source, target)
    return rewritten


async def _proxy_request(
    request: Request,
    target_base_url: str,
    project_slug: str,
    path: str,
    rewrite_content: bool = False,
) -> Response:
    preview_proxy_url, backend_proxy_url = _project_proxy_urls(request, project_slug)
    target_url = _join_target_url(target_base_url, path, request.url.query)
    request_headers = {
        key: value
        for key, value in request.headers.items()
        if key.lower() not in {"host", "content-length", "connection"}
    }
    body = await request.body()

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            upstream = await client.request(
                request.method,
                target_url,
                content=body if body else None,
                headers=request_headers,
            )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Project upstream unreachable: {target_url} ({exc})",
        ) from exc

    response_headers = {
        key: value
        for key, value in upstream.headers.items()
        if key.lower() not in {"content-length", "transfer-encoding", "connection", "content-encoding"}
    }
    content = upstream.content
    content_type = upstream.headers.get("content-type", "")
    if rewrite_content and _should_rewrite_content(content_type):
        text = upstream.text
        text = _rewrite_proxy_text(text, preview_proxy_url, backend_proxy_url, target_base_url)
        content = text.encode(upstream.encoding or "utf-8")

    return Response(content=content, status_code=upstream.status_code, headers=response_headers)


@app.api_route("/project-preview/{session_id}", methods=PROXY_METHODS, include_in_schema=False)
@app.api_route("/project-preview/{session_id}/{path:path}", methods=PROXY_METHODS, include_in_schema=False)
async def proxy_project_preview(session_id: str, request: Request, path: str = ""):
    target_base_url = _project_target_or_404(session_id, "preview_url")
    project = get_project_meta(session_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project metadata not found")
    return await _proxy_request(request, target_base_url, str(project.get("project_slug", "")), path, rewrite_content=True)


@app.api_route("/project-api/{session_id}", methods=PROXY_METHODS, include_in_schema=False)
@app.api_route("/project-api/{session_id}/{path:path}", methods=PROXY_METHODS, include_in_schema=False)
async def proxy_project_api(session_id: str, request: Request, path: str = ""):
    target_base_url = _project_target_or_404(session_id, "backend_url")
    project = get_project_meta(session_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project metadata not found")
    return await _proxy_request(request, target_base_url, str(project.get("project_slug", "")), path, rewrite_content=False)


@app.api_route("/project{project_index}/api", methods=PROXY_METHODS, include_in_schema=False)
@app.api_route("/project{project_index}/api/{path:path}", methods=PROXY_METHODS, include_in_schema=False)
async def proxy_project_api_by_slug(project_index: str, request: Request, path: str = ""):
    project_slug = f"project{project_index}"
    target_base_url = _project_target_by_slug_or_404(project_slug, "backend_url")
    return await _proxy_request(request, target_base_url, project_slug, path, rewrite_content=False)


@app.api_route("/project{project_index}", methods=PROXY_METHODS, include_in_schema=False)
@app.api_route("/project{project_index}/{path:path}", methods=PROXY_METHODS, include_in_schema=False)
async def proxy_project_preview_by_slug(project_index: str, request: Request, path: str = ""):
    project_slug = f"project{project_index}"
    target_base_url = _project_target_by_slug_or_404(project_slug, "preview_url")
    return await _proxy_request(request, target_base_url, project_slug, path, rewrite_content=True)


@app.get("/{full_path:path}", include_in_schema=False)
def serve_frontend(full_path: str):
    if not FRONTEND_DIST_DIR.exists():
        raise HTTPException(status_code=404, detail="Frontend build not found")
    requested = FRONTEND_DIST_DIR / full_path
    if full_path and requested.is_file():
        return FileResponse(requested)
    index_file = FRONTEND_DIST_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="Frontend build not found")


if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "main:app",
        host=settings.backend_host,
        port=settings.backend_port,
        reload=False,
        app_dir="backend",
    )
