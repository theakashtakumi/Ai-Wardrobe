"""Local-first wardrobe API with persistent SQLite storage and optional Ollama vision."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import sqlite3
import urllib.error
import urllib.request
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, field_validator

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.getenv("WARDROBE_DATA_DIR", BASE_DIR / "data"))
UPLOAD_DIR = Path(os.getenv("WARDROBE_UPLOAD_DIR", BASE_DIR / "uploads"))
DB_PATH = Path(os.getenv("DATABASE_PATH", DATA_DIR / "wardrobe.sqlite3"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD = 8 * 1024 * 1024
ALLOWED = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
logger = logging.getLogger("ai_wardrobe")


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def initialize():
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
          password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS clothing(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Unknown', color TEXT NOT NULL DEFAULT 'Unknown',
          pattern TEXT, material TEXT, season TEXT, occasion TEXT, style TEXT, formality TEXT, image_path TEXT,
          favorite INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          ai_attributes TEXT, ai_provider TEXT, ai_confidence REAL, wear_count INTEGER NOT NULL DEFAULT 0, last_worn TEXT);
        CREATE INDEX IF NOT EXISTS clothing_owner ON clothing(user_id, created_at);
        CREATE TABLE IF NOT EXISTS preferences(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          styles TEXT NOT NULL DEFAULT '[]', colors TEXT NOT NULL DEFAULT '[]', occasions TEXT NOT NULL DEFAULT '[]');
        CREATE TABLE IF NOT EXISTS outfits(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL, occasion TEXT, explanation TEXT, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS outfit_items(outfit_id TEXT NOT NULL REFERENCES outfits(id) ON DELETE CASCADE,
          clothing_id TEXT NOT NULL REFERENCES clothing(id) ON DELETE CASCADE, PRIMARY KEY(outfit_id, clothing_id));
        CREATE TABLE IF NOT EXISTS feedback(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          outfit_id TEXT REFERENCES outfits(id) ON DELETE SET NULL, rating INTEGER NOT NULL, note TEXT, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS wear_events(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          worn_on TEXT NOT NULL, outfit_id TEXT REFERENCES outfits(id) ON DELETE SET NULL, outfit_snapshot TEXT,
          occasion TEXT, notes TEXT, request_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE UNIQUE INDEX IF NOT EXISTS wear_event_request ON wear_events(user_id,request_id) WHERE request_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS wear_event_owner_date ON wear_events(user_id,worn_on DESC);
        CREATE TABLE IF NOT EXISTS wear_event_items(event_id TEXT NOT NULL REFERENCES wear_events(id) ON DELETE CASCADE,
          ordinal INTEGER NOT NULL, clothing_id TEXT REFERENCES clothing(id) ON DELETE SET NULL,
          item_snapshot TEXT NOT NULL, PRIMARY KEY(event_id,ordinal));
        CREATE INDEX IF NOT EXISTS wear_event_item_clothing ON wear_event_items(clothing_id);
        """)
        clothing_columns = {row["name"] for row in c.execute("PRAGMA table_info(clothing)")}
        if "legacy_wear_count" not in clothing_columns:
            c.execute("ALTER TABLE clothing ADD COLUMN legacy_wear_count INTEGER NOT NULL DEFAULT 0")
            c.execute("UPDATE clothing SET legacy_wear_count=wear_count")
        if "legacy_last_worn" not in clothing_columns:
            c.execute("ALTER TABLE clothing ADD COLUMN legacy_last_worn TEXT")
            c.execute("UPDATE clothing SET legacy_last_worn=last_worn")
        # Additive SQLite migrations preserve existing local profiles and saved outfits.
        for table, columns in {
            "preferences": {
                "avoid_colors": "TEXT NOT NULL DEFAULT '[]'", "neutral_colors": "TEXT NOT NULL DEFAULT '[]'",
                "accent_colors": "TEXT NOT NULL DEFAULT '[]'", "fit": "TEXT NOT NULL DEFAULT ''",
                "layering": "INTEGER NOT NULL DEFAULT 0", "comfort_formality": "INTEGER NOT NULL DEFAULT 50",
                "seasons": "TEXT NOT NULL DEFAULT '[]'", "warm_weather": "INTEGER NOT NULL DEFAULT 0",
                "cold_layering": "INTEGER NOT NULL DEFAULT 0", "rain_conscious": "INTEGER NOT NULL DEFAULT 0",
                "variety": "INTEGER NOT NULL DEFAULT 50", "avoid_recent": "INTEGER NOT NULL DEFAULT 0",
                "exclude_disliked": "INTEGER NOT NULL DEFAULT 0",
            },
            "outfits": {
                "description": "TEXT", "notes": "TEXT", "style": "TEXT", "season": "TEXT",
                "favorite": "INTEGER NOT NULL DEFAULT 0", "updated_at": "TEXT", "provenance": "TEXT NOT NULL DEFAULT 'manual'",
            },
            "feedback": {"item_signature": "TEXT"},
        }.items():
            existing = {row["name"] for row in c.execute(f"PRAGMA table_info({table})")}
            for column, definition in columns.items():
                if column not in existing:
                    c.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


initialize()
app = FastAPI(title="Ai-Wardrobe API", version="1.0.0", description="Private local wardrobe, outfits, and optional AI analysis.")
origins = [v.strip() for v in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if v.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


def now():
    return datetime.now(timezone.utc).isoformat()


def password_hash(password: str, salt: bytes):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000).hex()


def current_user(request: Request, authorization: str | None = Header(default=None)):
    token = authorization[7:] if authorization and authorization.startswith("Bearer ") else request.cookies.get("wardrobe_session")
    if not token:
        raise HTTPException(401, "Sign in to continue")
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with db() as c:
        row = c.execute("SELECT id,email,name FROM users WHERE id=(SELECT user_id FROM sessions WHERE token_hash=?)", (token_hash,)).fetchone()
    if not row:
        raise HTTPException(401, "Session expired. Sign in again.")
    return dict(row)


def item_dict(row):
    d = dict(row)
    d["favorite"] = bool(d["favorite"])
    d["image_url"] = f"/uploads/{d['image_path']}" if d.get("image_path") else None
    d["ai_attributes"] = json.loads(d["ai_attributes"]) if d.get("ai_attributes") else None
    return d


def owned_item(c, item_id, user_id):
    row = c.execute("SELECT * FROM clothing WHERE id=? AND user_id=?", (item_id, user_id)).fetchone()
    if not row:
        raise HTTPException(404, "Clothing item not found")
    return row


class AuthInput(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=80)


class ItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    category: str | None = None
    color: str | None = None
    pattern: str | None = None
    material: str | None = None
    season: str | None = None
    occasion: str | None = None
    style: str | None = None
    formality: str | None = None
    favorite: bool | None = None


class OutfitInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    occasion: str | None = None
    description: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=1000)
    style: str | None = Field(default=None, max_length=80)
    season: str | None = Field(default=None, max_length=40)
    favorite: bool = False
    provenance: str = Field(default="manual", pattern="^(manual|recommendation)$")
    item_ids: list[str] = Field(min_length=1, max_length=12)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Outfit name cannot be empty")
        return value


class FeedbackInput(BaseModel):
    outfit_id: str | None = None
    item_ids: list[str] | None = Field(default=None, max_length=12)
    rating: int = Field(ge=1, le=5)
    note: str | None = Field(default=None, max_length=500)


class WearEventInput(BaseModel):
    worn_on: date
    outfit_id: str | None = None
    item_ids: list[str] | None = Field(default=None, max_length=12)
    occasion: str | None = Field(default=None, max_length=80)
    notes: str | None = Field(default=None, max_length=1000)
    request_id: str | None = Field(default=None, max_length=80)

    @field_validator("worn_on")
    @classmethod
    def not_future(cls, value):
        if value > date.today():
            raise ValueError("Date worn cannot be in the future")
        return value


class PreferencesInput(BaseModel):
    styles: list[str] = []
    colors: list[str] = []
    occasions: list[str] = []
    avoid_colors: list[str] = []
    neutral_colors: list[str] = []
    accent_colors: list[str] = []
    fit: str = Field(default="", max_length=30)
    layering: bool = False
    comfort_formality: int = Field(default=50, ge=0, le=100)
    seasons: list[str] = []
    warm_weather: bool = False
    cold_layering: bool = False
    rain_conscious: bool = False
    variety: int = Field(default=50, ge=0, le=100)
    avoid_recent: bool = False
    exclude_disliked: bool = False

    @field_validator("styles")
    @classmethod
    def supported_styles(cls, values):
        allowed = {"casual", "minimal", "classic", "streetwear", "smart casual", "formal", "sporty", "preppy", "vintage", "elegant", "romantic", "bohemian", "experimental", "relaxed", "minimalist"}
        if any(value.lower() not in allowed for value in values):
            raise ValueError("Choose a supported style")
        return list(dict.fromkeys(value.strip() for value in values))[:20]

    @field_validator("colors", "avoid_colors", "neutral_colors", "accent_colors")
    @classmethod
    def supported_colors(cls, values):
        allowed = {"black", "white", "gray", "grey", "navy", "blue", "green", "olive", "red", "pink", "purple", "yellow", "orange", "brown", "tan", "cream", "beige", "neutrals", "earth tones", "pastels", "bright colors"}
        if any(value.lower() not in allowed for value in values):
            raise ValueError("Choose a supported color preference")
        return list(dict.fromkeys(value.strip() for value in values))[:20]

    @field_validator("occasions")
    @classmethod
    def supported_occasions(cls, values):
        allowed = {"college", "everyday", "work", "formal events", "parties", "travel", "activewear", "family events", "date night", "weekend", "special occasion"}
        if any(value.lower() not in allowed for value in values):
            raise ValueError("Choose a supported occasion")
        return list(dict.fromkeys(value.strip() for value in values))[:20]

    @field_validator("seasons")
    @classmethod
    def supported_seasons(cls, values):
        allowed = {"spring", "summer", "autumn", "winter"}
        if any(value.lower() not in allowed for value in values):
            raise ValueError("Choose a supported season")
        return list(dict.fromkeys(value.strip() for value in values))[:4]

    @field_validator("fit")
    @classmethod
    def supported_fit(cls, value):
        if value and value.lower() not in {"relaxed", "regular", "slim", "oversized"}:
            raise ValueError("Choose a supported fit preference")
        return value


@app.get("/")
def root():
    return {"message": "Ai-Wardrobe API is running", "docs": "/docs"}


@app.get("/health")
def health():
    with db() as c:
        c.execute("SELECT 1")
    return {"status": "healthy", "database": "connected", "ai": os.getenv("OLLAMA_MODEL", "") or None}


@app.post("/auth/register")
def register(body: AuthInput, response: Response):
    email = body.email.strip().lower()
    if "@" not in email or len(email) > 254:
        raise HTTPException(422, "Enter a valid email address")
    salt = secrets.token_bytes(16)
    uid = str(uuid4())
    try:
        with db() as c:
            c.execute("INSERT INTO users VALUES(?,?,?,?,?,?)", (uid, email, (body.name or email.split("@")[0]).strip(), password_hash(body.password, salt), salt.hex(), now()))
            c.execute("INSERT INTO preferences(user_id) VALUES(?)", (uid,))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "An account with this email already exists")
    result = issue_session(uid)
    response.set_cookie("wardrobe_session", result["token"], httponly=True, secure=os.getenv("APP_ENV") == "production", samesite="lax", max_age=60 * 60 * 24 * 30, path="/")
    return result


@app.post("/auth/login")
def login(body: AuthInput, response: Response):
    with db() as c:
        row = c.execute("SELECT * FROM users WHERE email=?", (body.email.strip().lower(),)).fetchone()
    if not row or not hmac.compare_digest(password_hash(body.password, bytes.fromhex(row["salt"])), row["password_hash"]):
        raise HTTPException(401, "Email or password is incorrect")
    result = issue_session(row["id"])
    response.set_cookie("wardrobe_session", result["token"], httponly=True, secure=os.getenv("APP_ENV") == "production", samesite="lax", max_age=60 * 60 * 24 * 30, path="/")
    return result


def issue_session(uid):
    token = secrets.token_urlsafe(36)
    with db() as c:
        c.execute("INSERT INTO sessions VALUES(?,?,?)", (hashlib.sha256(token.encode()).hexdigest(), uid, now()))
        user = dict(c.execute("SELECT id,email,name FROM users WHERE id=?", (uid,)).fetchone())
    return {"token": token, "user": user}


@app.post("/auth/logout")
def logout(request: Request, response: Response, user=Depends(current_user), authorization: str | None = Header(default=None)):
    token = authorization[7:] if authorization and authorization.startswith("Bearer ") else request.cookies.get("wardrobe_session", "")
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with db() as c:
        c.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))
    response.delete_cookie("wardrobe_session", path="/")
    return {"ok": True}


@app.get("/auth/me")
def me(user=Depends(current_user)):
    return user


@app.delete("/auth/account")
def delete_account(user=Depends(current_user)):
    with db() as c:
        paths = c.execute("SELECT image_path FROM clothing WHERE user_id=?", (user["id"],)).fetchall()
        c.execute("DELETE FROM users WHERE id=?", (user["id"],))
    for row in paths:
        if row["image_path"]:
            (UPLOAD_DIR / row["image_path"]).unlink(missing_ok=True)
    return {"ok": True}


@app.get("/wardrobe")
def get_wardrobe(search: str = "", category: str = "", color: str = "", season: str = "", favorite: bool | None = None, user=Depends(current_user)):
    sql = "SELECT * FROM clothing WHERE user_id=?"
    args: list = [user["id"]]
    for field, value in (("name", f"%{search.strip()}%" if search.strip() else ""), ("category", category), ("color", color), ("season", season)):
        if value:
            sql += f" AND {field} LIKE ?"
            args.append(value)
    if favorite is not None:
        sql += " AND favorite=?"
        args.append(int(favorite))
    sql += " ORDER BY created_at DESC LIMIT 200"
    with db() as c:
        rows = c.execute(sql, args).fetchall()
    return [item_dict(r) for r in rows]


async def save_image(file: UploadFile):
    if file.content_type not in ALLOWED:
        raise HTTPException(415, "Choose a JPG, PNG, or WebP image")
    data = await file.read(MAX_UPLOAD + 1)
    if not data or len(data) > MAX_UPLOAD:
        raise HTTPException(413, "Image must be between 1 byte and 8 MB")
    signatures = {"image/jpeg": data.startswith(b"\xff\xd8\xff"), "image/png": data.startswith(b"\x89PNG\r\n\x1a\n"), "image/webp": data.startswith(b"RIFF") and data[8:12] == b"WEBP"}
    if not signatures[file.content_type]:
        raise HTTPException(415, "Image contents do not match the selected file type")
    filename = f"{uuid4().hex}{ALLOWED[file.content_type]}"
    (UPLOAD_DIR / filename).write_bytes(data)
    return filename, data


def analyze_image(data: bytes, content_type: str):
    model = os.getenv("OLLAMA_MODEL", "").strip()
    if not model:
        return None
    endpoint = os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/") + "/api/generate"
    prompt = "Analyze this single clothing product photo. Reply only as JSON with keys name, category, color, pattern, material, season, occasion, style, formality. Use concise values; use Unknown where not visually inferable. Do not infer brand or personal traits."
    payload = json.dumps({"model": model, "prompt": prompt, "images": [base64.b64encode(data).decode()], "stream": False, "format": "json"}).encode()
    try:
        request = urllib.request.Request(endpoint, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=90) as response:
            result = json.loads(response.read())
        attrs = json.loads(result.get("response", "{}"))
        allowed = {"name", "category", "color", "pattern", "material", "season", "occasion", "style", "formality"}
        return {k: str(v)[:100] for k, v in attrs.items() if k in allowed and isinstance(v, (str, int, float))}, model
    except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(503, f"AI analysis unavailable ({type(exc).__name__}). You can retry without AI by setting OLLAMA_MODEL empty.")


@app.post("/wardrobe", status_code=201)
async def create_item(name: str = Form(""), category: str = Form("Unknown"), color: str = Form("Unknown"), analyze: bool = Form(False), file: UploadFile = File(...), user=Depends(current_user)):
    filename, raw = await save_image(file)
    analysis_warning = None
    try:
        ai = analyze_image(raw, file.content_type) if analyze and os.getenv("OLLAMA_MODEL", "").strip() else None
    except HTTPException as exc:
        if exc.status_code < 500:
            (UPLOAD_DIR / filename).unlink(missing_ok=True)
            raise
        logger.warning("Optional clothing analysis unavailable (status=%s)", exc.status_code)
        analysis_warning = "AI analysis was unavailable; the item was saved with your manual details."
        ai = None
    except Exception as exc:
        logger.warning("Optional clothing analysis failed (type=%s)", type(exc).__name__)
        analysis_warning = "AI analysis could not finish; the item was saved with your manual details."
        ai = None
    attrs, provider = ai if ai else ({}, None)
    values = {"name": name.strip() or attrs.get("name") or "New clothing item", "category": category if category != "Unknown" else attrs.get("category", "Unknown"), "color": color if color != "Unknown" else attrs.get("color", "Unknown")}
    uid, timestamp = str(uuid4()), now()
    try:
        with db() as c:
            c.execute("INSERT INTO clothing(id,user_id,name,category,color,pattern,material,season,occasion,style,formality,image_path,created_at,updated_at,ai_attributes,ai_provider) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
              (uid, user["id"], values["name"], values["category"], values["color"], attrs.get("pattern"), attrs.get("material"), attrs.get("season"), attrs.get("occasion"), attrs.get("style"), attrs.get("formality"), filename, timestamp, timestamp, json.dumps(attrs) if attrs else None, provider))
            row = c.execute("SELECT * FROM clothing WHERE id=?", (uid,)).fetchone()
    except Exception:
        (UPLOAD_DIR / filename).unlink(missing_ok=True)
        raise
    result = item_dict(row)
    if analysis_warning:
        result["analysis_warning"] = analysis_warning
    return result


@app.get("/wardrobe/{item_id}")
def get_item(item_id: str, user=Depends(current_user)):
    with db() as c:
        return item_dict(owned_item(c, item_id, user["id"]))


@app.get("/uploads/{filename}")
def get_image(filename: str, user=Depends(current_user)):
    with db() as c:
        exists = c.execute("SELECT 1 FROM clothing WHERE image_path=? AND user_id=?", (filename, user["id"])).fetchone()
    if not exists:
        raise HTTPException(404, "Image not found")
    path = (UPLOAD_DIR / filename).resolve()
    if path.parent != UPLOAD_DIR.resolve() or not path.is_file():
        raise HTTPException(404, "Image not found")
    return FileResponse(path, headers={"Cache-Control": "private, max-age=300"})


@app.patch("/wardrobe/{item_id}")
def update_item(item_id: str, body: ItemUpdate, user=Depends(current_user)):
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes and not changes["name"].strip():
        raise HTTPException(422, "Name cannot be empty")
    if not changes:
        raise HTTPException(422, "Provide at least one field to update")
    changes["updated_at"] = now()
    with db() as c:
        owned_item(c, item_id, user["id"])
        c.execute(f"UPDATE clothing SET {','.join(f'{k}=?' for k in changes)} WHERE id=? AND user_id=?", [*changes.values(), item_id, user["id"]])
        return item_dict(owned_item(c, item_id, user["id"]))


@app.put("/wardrobe/{item_id}/image")
async def replace_image(item_id: str, file: UploadFile = File(...), user=Depends(current_user)):
    with db() as c:
        old = owned_item(c, item_id, user["id"])["image_path"]
    filename, _ = await save_image(file)
    try:
        with db() as c:
            c.execute("UPDATE clothing SET image_path=?,updated_at=? WHERE id=? AND user_id=?", (filename, now(), item_id, user["id"]))
    except Exception:
        (UPLOAD_DIR / filename).unlink(missing_ok=True)
        raise
    if old:
        (UPLOAD_DIR / old).unlink(missing_ok=True)
    return {"image_url": f"/uploads/{filename}"}


@app.delete("/wardrobe/{item_id}")
def delete_item(item_id: str, user=Depends(current_user)):
    with db() as c:
        row = owned_item(c, item_id, user["id"])
        image = row["image_path"]
        c.execute("DELETE FROM clothing WHERE id=? AND user_id=?", (item_id, user["id"]))
    if image:
        (UPLOAD_DIR / image).unlink(missing_ok=True)
    return {"ok": True}


@app.get("/preferences")
def get_preferences(user=Depends(current_user)):
    with db() as c:
        row = c.execute("SELECT * FROM preferences WHERE user_id=?", (user["id"],)).fetchone()
    return {k: (json.loads(row[k]) if k in ("styles", "colors", "occasions", "avoid_colors", "neutral_colors", "accent_colors", "seasons") else row[k]) for k in row.keys() if k != "user_id"}


@app.put("/preferences")
def update_preferences(body: PreferencesInput, user=Depends(current_user)):
    values = body.model_dump()
    json_fields = {"styles", "colors", "occasions", "avoid_colors", "neutral_colors", "accent_colors", "seasons"}
    for key in json_fields:
        values[key] = json.dumps(values[key][:20])
    fields = list(values)
    with db() as c:
        c.execute(f"UPDATE preferences SET {','.join(f'{key}=?' for key in fields)} WHERE user_id=?", [*(values[key] for key in fields), user["id"]])
    return body.model_dump()


def score_outfit(items, occasion, prefs, feedback, disliked=False):
    score, reasons = 55, []
    cats = {x["category"].lower() for x in items}
    if len(items) >= 2 and len(cats) > 1:
        score += 15; reasons.append("Balances different wardrobe categories")
    colors = [x["color"].lower() for x in items if x["color"] and x["color"] != "Unknown"]
    if len(set(colors)) <= 2:
        score += 10; reasons.append("Keeps the palette cohesive")
    if occasion and any(occasion.lower() in (x.get("occasion") or "").lower() for x in items):
        score += 12; reasons.append(f"Fits your {occasion.lower()} occasion")
    pref_styles = {s.lower() for s in prefs.get("styles", [])}
    if pref_styles.intersection({(x.get("style") or "").lower() for x in items}):
        score += 15; reasons.append("Matches a style you like")
    item_colors = {(x.get("color") or "").strip().lower() for x in items}
    def matches_color(preference, color):
        aliases = {"neutrals": {"black", "white", "gray", "grey", "navy", "brown", "tan", "cream", "beige"}, "earth tones": {"brown", "tan", "cream", "beige", "olive", "green"}, "pastels": {"pink", "purple", "yellow", "blue"}}
        return color == preference or color in aliases.get(preference, set())
    liked_colors = {value.lower() for value in prefs.get("colors", []) + prefs.get("accent_colors", []) + prefs.get("neutral_colors", [])}
    avoided_colors = {value.lower() for value in prefs.get("avoid_colors", [])}
    if any(matches_color(preference, color) for preference in liked_colors for color in item_colors):
        score += 12; reasons.append("Includes one of your preferred colors")
    avoided_items = {color for color in item_colors if any(matches_color(preference, color) for preference in avoided_colors)}
    if avoided_items:
        score -= 25 * len(avoided_items); reasons.append("Includes a color you prefer to avoid")
    if prefs.get("occasions") and occasion and occasion.lower() in {value.lower() for value in prefs["occasions"]}:
        score += 8; reasons.append("Fits an occasion you often dress for")
    if prefs.get("seasons") and any((item.get("season") or "").lower() in {s.lower() for s in prefs["seasons"]} for item in items):
        score += 5; reasons.append("Works for one of your preferred seasons")
    formality = {"casual": 20, "relaxed": 20, "sporty": 20, "smart casual": 50, "business casual": 60, "formal": 85, "dressy": 80, "elegant": 80}
    known_formality = [formality.get((item.get("formality") or "").lower()) for item in items]
    known_formality = [value for value in known_formality if value is not None]
    if known_formality and abs(sum(known_formality) / len(known_formality) - prefs.get("comfort_formality", 50)) <= 25:
        score += 5; reasons.append("Fits your comfort and formality balance")
    if prefs.get("avoid_recent"):
        recently_worn = 0
        for item in items:
            if not item.get("last_worn"):
                continue
            try:
                age = datetime.now(timezone.utc) - datetime.fromisoformat(item["last_worn"])
                recently_worn += age.days < 7
            except ValueError:
                continue
        if recently_worn:
            score -= recently_worn * 15; reasons.append("Leaves room for pieces you have not worn recently")
    if disliked:
        score -= 35; reasons.append("Similar to a look you rated poorly")
    score += max(-10, min(10, feedback * 2))
    if not reasons: reasons.append("A starting point from pieces in your wardrobe")
    return min(99, score), reasons


@app.get("/recommendations")
def recommendations(occasion: str = "", user=Depends(current_user)):
    with db() as c:
        items = [item_dict(r) for r in c.execute("SELECT * FROM clothing WHERE user_id=? ORDER BY favorite DESC,wear_count ASC", (user["id"],)).fetchall()]
        pref_row = c.execute("SELECT * FROM preferences WHERE user_id=?", (user["id"],)).fetchone()
        avg = c.execute("SELECT COALESCE(AVG(rating)-3,0) FROM feedback WHERE user_id=?", (user["id"],)).fetchone()[0]
        disliked_rows = c.execute("SELECT oi.outfit_id, oi.clothing_id FROM outfit_items oi JOIN outfits o ON o.id=oi.outfit_id JOIN feedback f ON f.outfit_id=o.id WHERE f.user_id=? AND f.rating<=2", (user["id"],)).fetchall()
        disliked_signatures = c.execute("SELECT item_signature FROM feedback WHERE user_id=? AND rating<=2 AND item_signature IS NOT NULL", (user["id"],)).fetchall()
    if len(items) < 2:
        return {"recommendations": [], "message": "Add at least two pieces to get outfit ideas."}
    prefs = {k: (json.loads(pref_row[k]) if k in ("styles", "colors", "occasions", "avoid_colors", "neutral_colors", "accent_colors", "seasons") else pref_row[k]) for k in pref_row.keys() if k != "user_id"}
    disliked = {frozenset(row["clothing_id"] for row in disliked_rows if row["outfit_id"] == outfit_id) for outfit_id in {row["outfit_id"] for row in disliked_rows}}
    disliked.update(frozenset(json.loads(row["item_signature"])) for row in disliked_signatures)
    tops = [i for i in items if any(x in i["category"].lower() for x in ("shirt", "top", "blouse", "sweater", "jacket", "dress"))]
    bottoms = [i for i in items if any(x in i["category"].lower() for x in ("pant", "jean", "skirt", "short"))]
    pool = tops + bottoms if tops and bottoms else items
    combos = []
    for first in range(len(pool)):
        for second in range(first + 1, len(pool)):
            a, b = pool[first], pool[second]
            if a["category"] == b["category"] and a["category"].lower() not in ("unknown", "other"): continue
            pair = frozenset((a["id"], b["id"]))
            if prefs.get("exclude_disliked") and pair in disliked: continue
            score, why = score_outfit([a,b], occasion, prefs, avg, pair in disliked)
            combos.append({"items": [a,b], "score": score, "reasons": why, "occasion": occasion or None})
    combos.sort(key=lambda x: (-x["score"], sum(i["wear_count"] for i in x["items"]) * (0.5 + prefs.get("variety", 50) / 50)))
    return {"recommendations": combos[:6], "message": None}


@app.post("/outfits", status_code=201)
def save_outfit(body: OutfitInput, user=Depends(current_user)):
    ids = list(dict.fromkeys(body.item_ids))
    with db() as c:
        marks = ",".join("?" for _ in ids)
        found = c.execute(f"SELECT id FROM clothing WHERE user_id=? AND id IN ({marks})", [user["id"], *ids]).fetchall()
        if len(found) != len(ids): raise HTTPException(422, "Outfits can only include your own wardrobe items")
        uid = str(uuid4())
        timestamp = now()
        c.execute("INSERT INTO outfits(id,user_id,name,occasion,explanation,created_at,description,notes,style,season,favorite,updated_at,provenance) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                  (uid, user["id"], body.name, body.occasion, "Saved from your wardrobe", timestamp, body.description, body.notes, body.style, body.season, int(body.favorite), timestamp, body.provenance))
        c.executemany("INSERT INTO outfit_items VALUES(?,?)", [(uid, i) for i in ids])
    return {"id": uid, "name": body.name, "occasion": body.occasion, "description": body.description, "notes": body.notes, "style": body.style, "season": body.season, "favorite": body.favorite, "provenance": body.provenance, "item_ids": ids}


def outfit_dict(c, row):
    result = dict(row)
    result["favorite"] = bool(result["favorite"])
    result["updated_at"] = result["updated_at"] or result["created_at"]
    result["items"] = [item_dict(item) for item in c.execute("SELECT c.* FROM clothing c JOIN outfit_items oi ON oi.clothing_id=c.id WHERE oi.outfit_id=? ORDER BY c.created_at", (result["id"],)).fetchall()]
    result["item_ids"] = [item["id"] for item in result["items"]]
    return result


@app.get("/outfits")
def list_outfits(user=Depends(current_user)):
    with db() as c:
        rows = c.execute("SELECT * FROM outfits WHERE user_id=? ORDER BY created_at DESC", (user["id"],)).fetchall()
        return [outfit_dict(c, row) for row in rows]


@app.get("/outfits/{outfit_id}")
def get_outfit(outfit_id: str, user=Depends(current_user)):
    with db() as c:
        row = c.execute("SELECT * FROM outfits WHERE id=? AND user_id=?", (outfit_id, user["id"])).fetchone()
        if not row: raise HTTPException(404, "Outfit not found")
        return outfit_dict(c, row)


@app.put("/outfits/{outfit_id}")
def update_outfit(outfit_id: str, body: OutfitInput, user=Depends(current_user)):
    ids = list(dict.fromkeys(body.item_ids))
    with db() as c:
        if not c.execute("SELECT 1 FROM outfits WHERE id=? AND user_id=?", (outfit_id, user["id"])).fetchone():
            raise HTTPException(404, "Outfit not found")
        marks = ",".join("?" for _ in ids)
        found = c.execute(f"SELECT id FROM clothing WHERE user_id=? AND id IN ({marks})", [user["id"], *ids]).fetchall()
        if len(found) != len(ids): raise HTTPException(422, "Outfits can only include your own wardrobe items")
        c.execute("UPDATE outfits SET name=?,occasion=?,description=?,notes=?,style=?,season=?,favorite=?,updated_at=?,provenance=? WHERE id=? AND user_id=?",
                  (body.name, body.occasion, body.description, body.notes, body.style, body.season, int(body.favorite), now(), body.provenance, outfit_id, user["id"]))
        c.execute("DELETE FROM outfit_items WHERE outfit_id=?", (outfit_id,))
        c.executemany("INSERT INTO outfit_items VALUES(?,?)", [(outfit_id, item_id) for item_id in ids])
        row = c.execute("SELECT * FROM outfits WHERE id=?", (outfit_id,)).fetchone()
        return outfit_dict(c, row)


@app.delete("/outfits/{outfit_id}")
def delete_outfit(outfit_id: str, user=Depends(current_user)):
    with db() as c:
        cur=c.execute("DELETE FROM outfits WHERE id=? AND user_id=?", (outfit_id,user["id"]))
        if not cur.rowcount: raise HTTPException(404,"Outfit not found")
    return {"ok":True}


@app.post("/feedback", status_code=201)
def submit_feedback(body: FeedbackInput, user=Depends(current_user)):
    signature = None
    with db() as c:
        if body.outfit_id and not c.execute("SELECT 1 FROM outfits WHERE id=? AND user_id=?", (body.outfit_id,user["id"])).fetchone():
            raise HTTPException(404,"Outfit not found")
        if body.item_ids is not None:
            ids = list(dict.fromkeys(body.item_ids))
            if not ids: raise HTTPException(422, "Choose at least one wardrobe item to rate")
            marks = ",".join("?" for _ in ids)
            if c.execute(f"SELECT COUNT(*) FROM clothing WHERE user_id=? AND id IN ({marks})", [user["id"], *ids]).fetchone()[0] != len(ids):
                raise HTTPException(422, "Feedback can only include your own wardrobe items")
            signature = json.dumps(sorted(ids))
        c.execute("INSERT INTO feedback(id,user_id,outfit_id,rating,note,created_at,item_signature) VALUES(?,?,?,?,?,?,?)", (str(uuid4()),user["id"],body.outfit_id,body.rating,body.note,now(),signature))
    return {"ok":True}


@app.get("/history")
def history(user=Depends(current_user)):
    with db() as c:
        return [dict(r) for r in c.execute("SELECT * FROM outfits WHERE user_id=? ORDER BY created_at DESC LIMIT 100", (user["id"],)).fetchall()]


@app.post("/wardrobe/{item_id}/wear")
def wear_item(item_id: str, user=Depends(current_user)):
    with db() as c:
        owned_item(c,item_id,user["id"])
        c.execute("UPDATE clothing SET wear_count=wear_count+1,last_worn=?,updated_at=? WHERE id=?",(now(),now(),item_id))
    return {"ok":True}


@app.get("/export")
def export_data(user=Depends(current_user)):
    with db() as c:
        items=[item_dict(r) for r in c.execute("SELECT * FROM clothing WHERE user_id=?",(user["id"],)).fetchall()]
        outfits=list(map(dict,c.execute("SELECT * FROM outfits WHERE user_id=?",(user["id"],)).fetchall()))
        prefs=get_preferences(user)
    return {"user":user,"wardrobe":items,"outfits":outfits,"preferences":prefs,"exported_at":now()}
