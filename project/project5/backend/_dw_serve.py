"""由 DeepWisdom 平台自动生成,请勿手动修改。

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
