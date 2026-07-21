from fastapi import FastAPI

app = FastAPI(title="project1")


@app.get("/api/health")
def health():
    return {"ok": True, "project": "project1"}
