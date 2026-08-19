"""生成项目的规范化部署模板。

这些文件由主控平台在「启动项目」时强制写入/覆盖,不依赖 LLM 自己编写,
从根上避免端口写错、container_name 冲突、nginx/构建产物路径不一致等问题。

部署模型(单容器、单端口):
- node 阶段构建 frontend/ → 产物统一归一到 /out(兼容 dist 与 build 两种输出目录);
- python 阶段安装 backend/ 依赖并额外补装 fastapi/uvicorn;
- backend/_dw_serve.py 导入项目自己的 FastAPI app,并把前端静态资源托管出去;
- 容器内固定监听 8000,只有宿主端口由端口分配器决定(见 port_alloc.py)。
"""
from __future__ import annotations


# 容器内部固定端口:与宿主端口解耦,宿主端口由分配器写入 compose。
INTERNAL_PORT = 8000


def render_dockerfile() -> str:
    return """# 由 DeepWisdom 平台自动生成,请勿手动修改。
# 单容器部署:前端构建产物由后端静态托管,对外只暴露一个端口。

FROM node:20-alpine AS frontend-build
ARG NPM_CONFIG_REGISTRY
WORKDIR /app/frontend
# LLM 生成的代码常带有轻微 lint/警告问题,不应阻断构建
ENV CI=false
ENV DISABLE_ESLINT_PLUGIN=true
ENV GENERATE_SOURCEMAP=false
COPY frontend/ ./
RUN if [ -n "$NPM_CONFIG_REGISTRY" ]; then \\
      npm install --registry="$NPM_CONFIG_REGISTRY" --no-audit --no-fund; \\
    else \\
      npm install --no-audit --no-fund; \\
    fi
RUN npm run build
RUN if [ -d dist ]; then mv dist /out; \\
    elif [ -d build ]; then mv build /out; \\
    else mkdir -p /out && echo "<h1>frontend build output not found</h1>" > /out/index.html; \\
    fi

FROM python:3.11-slim
ARG PIP_INDEX_URL
ARG PIP_TRUSTED_HOST
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY backend/requirements.txt /tmp/requirements.txt
RUN set -e; \\
    PIP_EXTRA=""; \\
    if [ -n "$PIP_INDEX_URL" ]; then PIP_EXTRA="--index-url $PIP_INDEX_URL"; fi; \\
    if [ -n "$PIP_TRUSTED_HOST" ]; then PIP_EXTRA="$PIP_EXTRA --trusted-host $PIP_TRUSTED_HOST"; fi; \\
    pip install --no-cache-dir $PIP_EXTRA -r /tmp/requirements.txt; \\
    pip install --no-cache-dir $PIP_EXTRA fastapi uvicorn
COPY backend/ ./backend/
COPY --from=frontend-build /out ./static
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "backend._dw_serve:app", "--host", "0.0.0.0", "--port", "8000"]
"""


def render_compose(host_port: int, build_args: dict[str, str] | None = None) -> str:
    # 注意:
    # - 不写 container_name,避免与其他项目/历史容器冲突;
    # - 不写任何 bind mount(主控在容器内通过 docker.sock 驱动宿主机 daemon,
    #   相对路径挂载会解析到宿主机上不存在的目录);
    # - 只发布一个宿主端口 -> 容器内固定 8000。
    args_block = ""
    if build_args:
        lines = "\n".join(f"        {key}: {value}" for key, value in build_args.items())
        args_block = f"\n      args:\n{lines}"

    return f"""# 由 DeepWisdom 平台自动生成,请勿手动修改。
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile{args_block}
    ports:
      - "{host_port}:{INTERNAL_PORT}"
    restart: unless-stopped
"""


def render_dockerignore() -> str:
    return """**/node_modules
**/__pycache__
**/.git
**/.venv
**/*.pyc
**/.DS_Store
.codex-runtime.compose.yml
"""


def render_requirements_fallback() -> str:
    return """fastapi>=0.110
uvicorn>=0.29
"""


def render_serve_wrapper() -> str:
    """backend/_dw_serve.py 的内容:导入项目的 FastAPI app 并托管前端静态资源。"""
    return '''"""由 DeepWisdom 平台自动生成,请勿手动修改。

职责:
1. 从生成的后端代码中找到 FastAPI 实例(优先 backend/main.py 里的 app);
2. 把前端构建产物(static/)以同源方式托管,SPA 路由回退到 index.html;
3. 保证 /api/health 一定存在,供主控做健康检查。
"""
import importlib
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BACKEND_DIR.parent
for _path in (str(BACKEND_DIR), str(PROJECT_DIR)):
    if _path not in sys.path:
        sys.path.insert(0, _path)

app = None
_import_error = None
for _module_name in ("backend.main", "main", "backend.app", "app", "backend.server", "server"):
    try:
        _module = importlib.import_module(_module_name)
    except Exception as _exc:  # noqa: BLE001
        _import_error = _exc
        continue
    for _attr in ("app", "application", "api"):
        _candidate = getattr(_module, _attr, None)
        if _candidate is not None and _candidate.__class__.__name__ == "FastAPI":
            app = _candidate
            break
    if app is not None:
        break

if app is None:
    from fastapi import FastAPI

    app = FastAPI(title="generated-project")
    _detail = f"FastAPI app not found: {_import_error!r}"

    @app.get("/api/health")
    def _dw_missing_health():
        return {"ok": False, "detail": _detail}

    @app.get("/")
    def _dw_missing_index():
        return {"ok": False, "detail": _detail}


def _dw_has_route(path: str) -> bool:
    for _route in getattr(app, "routes", []):
        if getattr(_route, "path", None) == path:
            return True
    return False


_STATIC_DIR = os.environ.get("DW_STATIC_DIR", "")
if not _STATIC_DIR or not Path(_STATIC_DIR).is_dir():
    _STATIC_DIR = str(PROJECT_DIR / "static")

if Path(_STATIC_DIR).is_dir():
    from fastapi import HTTPException
    from fastapi.responses import FileResponse

    _static_root = Path(_STATIC_DIR).resolve()

    if not _dw_has_route("/api/health"):

        @app.get("/api/health")
        def _dw_health():
            return {"ok": True, "project": "generated"}

    @app.get("/{full_path:path}", include_in_schema=False)
    def _dw_static(full_path: str):
        requested = (_static_root / full_path).resolve()
        try:
            requested.relative_to(_static_root)
        except ValueError:
            raise HTTPException(status_code=404) from None
        if requested.is_file():
            return FileResponse(requested)
        index_file = _static_root / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)
        raise HTTPException(status_code=404)
'''
