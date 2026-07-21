import json
import os
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from models import LoginRequest, TicketCreate, TicketUpdate
from auth import (
    init_default_admin, authenticate_user, create_token,
    get_current_user, load_users, DATA_DIR
)

TICKETS_FILE = os.path.join(DATA_DIR, "tickets.json")

app = FastAPI(title="工单管理系统 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def load_tickets():
    if not os.path.exists(TICKETS_FILE):
        return []
    with open(TICKETS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_tickets(tickets):
    with open(TICKETS_FILE, "w", encoding="utf-8") as f:
        json.dump(tickets, f, ensure_ascii=False, indent=2)

def get_next_id(items):
    if not items:
        return 1
    return max(item["id"] for item in items) + 1

@app.on_event("startup")
def startup():
    init_default_admin()

# ─── 登录 ─────────────────────────────────────────────────────────────────────

@app.post("/api/login")
def login(req: LoginRequest):
    user = authenticate_user(req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_token(user)
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user["username"],
        "role": user["role"],
        "display_name": user["display_name"]
    }

@app.get("/api/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "username": current_user["username"],
        "role": current_user["role"],
        "display_name": current_user["display_name"]
    }

# ─── 仪表盘 ───────────────────────────────────────────────────────────────────

@app.get("/api/dashboard")
def get_dashboard(current_user: dict = Depends(get_current_user)):
    tickets = load_tickets()
    total = len(tickets)
    open_count = sum(1 for t in tickets if t["status"] == "open")
    in_progress = sum(1 for t in tickets if t["status"] == "in_progress")
    resolved = sum(1 for t in tickets if t["status"] == "resolved")
    closed = sum(1 for t in tickets if t["status"] == "closed")
    urgent = sum(1 for t in tickets if t["priority"] == "urgent")
    high = sum(1 for t in tickets if t["priority"] == "high")

    # 最近工单
    recent = sorted(tickets, key=lambda t: t["created_at"], reverse=True)[:5]

    return {
        "total": total,
        "open_count": open_count,
        "in_progress": in_progress,
        "resolved": resolved,
        "closed": closed,
        "urgent": urgent,
        "high": high,
        "recent_tickets": recent
    }

# ─── 工单 CRUD ───────────────────────────────────────────────────────────────

@app.get("/api/tickets")
def list_tickets(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user)
):
    tickets = load_tickets()
    if status:
        tickets = [t for t in tickets if t["status"] == status]
    if priority:
        tickets = [t for t in tickets if t["priority"] == priority]

    # 排序：最新优先
    tickets.sort(key=lambda t: t["created_at"], reverse=True)

    total = len(tickets)
    start = (page - 1) * page_size
    end = start + page_size
    items = tickets[start:end]

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 1
    }

@app.get("/api/tickets/{ticket_id}")
def get_ticket(ticket_id: int, current_user: dict = Depends(get_current_user)):
    tickets = load_tickets()
    for t in tickets:
        if t["id"] == ticket_id:
            return t
    raise HTTPException(status_code=404, detail="工单不存在")

@app.post("/api/tickets")
def create_ticket(
    data: TicketCreate,
    current_user: dict = Depends(get_current_user)
):
    tickets = load_tickets()
    import datetime
    now = datetime.datetime.utcnow().isoformat()
    new_ticket = {
        "id": get_next_id(tickets),
        "title": data.title,
        "description": data.description,
        "priority": data.priority,
        "status": "open",
        "creator": current_user["username"],
        "assignee": None,
        "created_at": now,
        "updated_at": now
    }
    tickets.append(new_ticket)
    save_tickets(tickets)
    return new_ticket

@app.put("/api/tickets/{ticket_id}")
def update_ticket(
    ticket_id: int,
    data: TicketUpdate,
    current_user: dict = Depends(get_current_user)
):
    tickets = load_tickets()
    for t in tickets:
        if t["id"] == ticket_id:
            if data.title is not None:
                t["title"] = data.title
            if data.description is not None:
                t["description"] = data.description
            if data.status is not None:
                t["status"] = data.status
            if data.priority is not None:
                t["priority"] = data.priority
            if data.assignee is not None:
                t["assignee"] = data.assignee
            import datetime
            t["updated_at"] = datetime.datetime.utcnow().isoformat()
            save_tickets(tickets)
            return t
    raise HTTPException(status_code=404, detail="工单不存在")

@app.delete("/api/tickets/{ticket_id}")
def delete_ticket(
    ticket_id: int,
    current_user: dict = Depends(get_current_user)
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可删除工单")
    tickets = load_tickets()
    for i, t in enumerate(tickets):
        if t["id"] == ticket_id:
            deleted = tickets.pop(i)
            save_tickets(tickets)
            return {"message": "已删除", "ticket": deleted}
    raise HTTPException(status_code=404, detail="工单不存在")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)