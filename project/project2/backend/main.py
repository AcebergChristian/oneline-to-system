from fastapi import FastAPI

app = FastAPI(title="project2")


@app.get("/api/health")
def health():
    return {"ok": True, "project": "project2"}
