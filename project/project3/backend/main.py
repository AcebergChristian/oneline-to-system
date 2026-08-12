from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title='project3')

FRONTEND_DIST_DIR = Path(__file__).resolve().parents[1] / 'frontend-dist'

if FRONTEND_DIST_DIR.exists():
    assets_dir = FRONTEND_DIST_DIR / 'assets'
    if assets_dir.exists():
        app.mount('/assets', StaticFiles(directory=assets_dir), name='assets')


@app.get('/api/health')
def health():
    return {'ok': True, 'project': 'project3', 'prompt': '继续    帮我做  你上面的，'}


@app.get('/{full_path:path}')
def serve_frontend(full_path: str):
    if not FRONTEND_DIST_DIR.exists():
        raise HTTPException(status_code=404, detail='Frontend build not found')
    requested = FRONTEND_DIST_DIR / full_path
    if full_path and requested.is_file():
        return FileResponse(requested)
    index_file = FRONTEND_DIST_DIR / 'index.html'
    if index_file.exists():
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail='Frontend build not found')
