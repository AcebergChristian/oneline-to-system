from __future__ import annotations

from dataclasses import dataclass
import re


@dataclass(frozen=True)
class TemplateFile:
    path: str
    content: str


def generate_project_files(user_prompt: str, project_slug: str) -> list[TemplateFile]:
    app_name = project_slug.replace("-", "_")
    match = re.search(r"(\d+)$", project_slug)
    index = int(match.group(1)) if match else 1
    frontend_port = 3000 + index
    backend_port = 8000 + index
    frontend_package = f"""{{
  "name": "{project_slug}-frontend",
  "private": true,
  "version": "0.0.1",
  "scripts": {{
    "dev": "vite --host 0.0.0.0 --port {frontend_port}",
    "build": "vite build",
    "preview": "vite preview --host 0.0.0.0 --port {frontend_port}"
  }},
  "dependencies": {{
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  }},
  "devDependencies": {{
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.2"
  }}
}}
"""
    frontend_app = f"""import React from 'react'

export default function App() {{
  return (
    <main style={{{{ fontFamily: 'sans-serif', padding: 32 }}}}>
      <h1>{project_slug}</h1>
      <p>Generated from requirement:</p>
      <pre style={{{{ whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 16 }}}}>{user_prompt}</pre>
    </main>
  )
}}
"""
    frontend_main = """import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\n\nReactDOM.createRoot(document.getElementById('root')).render(<App />)\n"""
    frontend_html = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{project_slug}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
"""
    backend_requirements = "fastapi==0.116.1\nuvicorn==0.35.0\n"
    backend_main = f"""from fastapi import FastAPI\n\napp = FastAPI(title='{project_slug}')\n\n\n@app.get('/api/health')\ndef health():\n    return {{'ok': True, 'project': '{project_slug}', 'prompt': {user_prompt!r}}}\n\n\nif __name__ == '__main__':\n    import uvicorn\n    uvicorn.run(app, host='0.0.0.0', port={backend_port})\n"""
    dockerfile = f"""FROM node:20-alpine AS frontend-build\nWORKDIR /app/frontend\nCOPY frontend/package.json ./package.json\nRUN npm install\nCOPY frontend .\nRUN npm run build\n\nFROM python:3.11-slim\nWORKDIR /app\nCOPY backend/requirements.txt ./backend/requirements.txt\nRUN pip install --no-cache-dir -r ./backend/requirements.txt\nCOPY backend ./backend\nCOPY --from=frontend-build /app/frontend/dist ./frontend-dist\nCMD [\"python\", \"-m\", \"uvicorn\", \"backend.main:app\", \"--host\", \"0.0.0.0\", \"--port\", \"{backend_port}\"]\n"""
    compose = f"""services:\n  {app_name}:\n    build:\n      context: .\n      dockerfile: Dockerfile\n    ports:\n      - \"{frontend_port}:{backend_port}\"\n"""
    return [
        TemplateFile("frontend/package.json", frontend_package),
        TemplateFile("frontend/index.html", frontend_html),
        TemplateFile("frontend/src/App.jsx", frontend_app),
        TemplateFile("frontend/src/main.jsx", frontend_main),
        TemplateFile("backend/requirements.txt", backend_requirements),
        TemplateFile("backend/main.py", backend_main),
        TemplateFile("Dockerfile", dockerfile),
        TemplateFile("docker-compose.yml", compose),
    ]
