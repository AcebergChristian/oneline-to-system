import base64
import datetime
import hashlib
import hmac
import json
import os
import secrets
import jwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
USERS_FILE = os.path.join(DATA_DIR, "users.json")
SECRET_KEY = "ticket-system-secret-key-2024"
ALGORITHM = "HS256"
security = HTTPBearer()

PBKDF2_ROUNDS = 120000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return "pbkdf2_sha256${}${}${}".format(
        PBKDF2_ROUNDS,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, stored_hash: str) -> bool:
    if not stored_hash.startswith("pbkdf2_sha256$"):
        return False
    _, rounds, salt_b64, digest_b64 = stored_hash.split("$", 3)
    salt = base64.b64decode(salt_b64.encode("ascii"))
    expected = base64.b64decode(digest_b64.encode("ascii"))
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(rounds))
    return hmac.compare_digest(actual, expected)

def load_users():
    if not os.path.exists(USERS_FILE):
        return []
    with open(USERS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_users(users):
    with open(USERS_FILE, "w", encoding="utf-8") as f:
        json.dump(users, f, ensure_ascii=False, indent=2)

def init_default_admin():
    users = load_users()
    if not any(u["username"] == "admin" for u in users):
        users.append({
            "id": 1,
            "username": "admin",
            "password": hash_password("admin123"),
            "role": "admin",
            "display_name": "管理员"
        })
        save_users(users)
    else:
        for u in users:
            if u["username"] == "admin" and not u["password"].startswith("pbkdf2_sha256$"):
                u["password"] = hash_password("admin123")
        save_users(users)

def authenticate_user(username: str, password: str):
    users = load_users()
    for u in users:
        if u["username"] == username:
            if verify_password(password, u["password"]):
                return u
    return None

def create_token(user: dict) -> str:
    payload = {
        "sub": user["username"],
        "role": user.get("role", "user"),
        "display_name": user.get("display_name", user["username"]),
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        users = load_users()
        for u in users:
            if u["username"] == username:
                return u
        raise HTTPException(status_code=401, detail="用户不存在")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token已过期")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="无效的Token")
