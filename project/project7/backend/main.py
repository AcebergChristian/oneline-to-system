"""
Snake Game Backend — FastAPI
Stores high scores in a JSON file.
"""
import json
import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Snake Game Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SCORES_FILE = Path(__file__).parent / "scores.json"

# Ensure scores file exists
if not SCORES_FILE.exists():
    SCORES_FILE.write_text(json.dumps({"high_scores": []}))


def _read_scores():
    try:
        return json.loads(SCORES_FILE.read_text())
    except (json.JSONDecodeError, FileNotFoundError):
        return {"high_scores": []}


def _write_scores(data):
    SCORES_FILE.write_text(json.dumps(data, indent=2))


class ScorePayload(BaseModel):
    name: str
    score: int


@app.get("/api/scores")
def get_scores():
    """Return all high scores."""
    return _read_scores()


@app.post("/api/scores")
def submit_score(payload: ScorePayload):
    """Submit a new high score (only keeps top 10)."""
    data = _read_scores()
    entries = data.get("high_scores", [])
    entries.append({"name": payload.name[:20], "score": payload.score})
    # Sort descending and keep top 10
    entries.sort(key=lambda e: e["score"], reverse=True)
    data["high_scores"] = entries[:10]
    _write_scores(data)
    return {"ok": True, "high_scores": data["high_scores"]}


@app.get("/api/health")
def health():
    return {"status": "ok"}