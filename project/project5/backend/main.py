import json
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="园区监控API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_PATH = os.path.join(os.path.dirname(__file__), "data.json")

def load_data():
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

@app.get("/api/park")
def get_park():
    return load_data()

@app.get("/api/building/{building_id}")
def get_building(building_id: str):
    data = load_data()
    for b in data["buildings"]:
        if b["id"] == building_id:
            return b
    raise HTTPException(status_code=404, detail="Building not found")

@app.get("/api/point/{point_id}")
def get_point(point_id: str):
    data = load_data()
    for b in data["buildings"]:
        for p in b["points"]:
            if p["id"] == point_id:
                return {"building": b["name"], "point": p}
    raise HTTPException(status_code=404, detail="Point not found")

@app.get("/api/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)