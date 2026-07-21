import json
import os
from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_FILE = "data/scores.json"

class ScoreRecord(BaseModel):
    score: int
    max_tile: int
    won: bool

def load_scores():
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, "r") as f:
            return json.load(f)
    except:
        return []

def save_scores(scores):
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w") as f:
        json.dump(scores, f, indent=2)

@app.get("/api/scores")
def get_scores():
    scores = load_scores()
    return {"scores": scores[-10:][::-1]}  # latest 10, newest first

@app.post("/api/scores")
def add_score(record: ScoreRecord):
    scores = load_scores()
    entry = {
        "score": record.score,
        "max_tile": record.max_tile,
        "won": record.won,
        "timestamp": datetime.utcnow().isoformat()
    }
    scores.append(entry)
    save_scores(scores)
    return {"status": "ok"}

@app.get("/api/health")
def health():
    return {"status": "ok"}