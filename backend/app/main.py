"""Attention Monitor API — auth, classes, telemetry, analytics."""
import asyncio
import csv
import io
import logging
import os
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from collections import deque
from typing import Deque, List, Optional, Dict


from bson import ObjectId
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from pathlib import Path

from backend.app.auth import (
    create_token,
    hash_password,
    rate_limit,
    rate_limit_ip,
    verify_password,
    verify_token,
)
from backend.app.config import ROOT_DIR, get_settings
from backend.app.analytics_service import (
    attention_session_csv_rows,
    attendance_csv_rows,
    build_attention_session_analytics,
    build_attendance_analytics,
    build_overview,
    build_student_analytics,
    compare_sessions,
    fetch_sessions,
    generate_excel_workbook,
    generate_pdf_report,
    parse_date_range,
    summarize_session,
)
from backend.app.database import (
    classes_collection,
    close_db,
    is_db_ready,
    sessions_collection,
    student_actions_collection,
    students_collection,
    teachers_collection,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s")
logger = logging.getLogger(__name__)
settings = get_settings()
app = FastAPI(
    title="Attention Monitor API",
    description="Auth, classes, telemetry, analytics.",
    version="0.0.0",
)

from backend.app.socratic_service import router as socratic_router
app.include_router(socratic_router)


def student_key(class_code: str, roll_number: str) -> str:
    return f"{class_code.strip().upper()}:{roll_number.strip().upper()}"


# In-memory live state: key -> student dict
students: Dict[str, dict] = {}
# Per-class live session timing: class_code -> {start_time, last_alert_time, session_epoch, sustained_low_attention}
class_live_state: Dict[str, dict] = {}
# In-memory attention buffers per student: student_key -> deque of (timestamp, attention)
attention_buffers: Dict[str, Deque[tuple[float, int]]] = {}
# In-memory alert episode tracking: student_key -> {episode_start_time, last_alert_fired_time}
alert_episodes: Dict[str, dict] = {}
# In-memory cache for class attention thresholds
_threshold_cache: Dict[str, int] = {}
_sustained_duration_cache: Dict[str, int] = {}
_class_avg_threshold_cache: Dict[str, int] = {}

# In-memory rolling class average buffers: class_code -> deque of (timestamp, instantaneous_avg)
class_avg_buffers: Dict[str, Deque[tuple[float, float]]] = {}
# In-memory episode tracking for class-level intervention triggers: class_code -> {low_attention_start_time, last_notified}
class_intervention_episodes: Dict[str, dict] = {}

# WebSocket subscribers: {ws, username, class_code (optional filter)}
teacher_sockets: List[dict] = []
student_sockets: List[dict] = []

def _session_summary(doc: dict) -> dict:
    return summarize_session(doc)


def _close_session_record(
    class_code: str,
    roll_number: str,
    end_time: float,
    *,
    teacher_username: Optional[str] = None,
) -> None:
    """Mark an active session offline and finalize session state."""
    if sessions_collection is None:
        return
    query: dict = {
        "class_code": class_code.strip().upper(),
        "roll_number": roll_number.strip().upper(),
        "status": "active",
    }
    if teacher_username:
        query["teacher_username"] = teacher_username
    doc = sessions_collection.find_one(query)
    if not doc:
        return
    sessions_collection.update_one(
        {"_id": doc["_id"]},
        {
            "$set": {
                "status": "offline",
                "end_time": end_time,
                "leave_time": end_time,
            }
        },
    )


def _upsert_roster_row(class_code: str, roll: str, name: str) -> bool:
    """Insert or update one roster student. Returns True if processed."""
    if not roll or not name:
        return False
    existing = students_collection.find_one({"class_code": class_code, "roll_number": roll})
    if existing:
        students_collection.update_one({"_id": existing["_id"]}, {"$set": {"name": name}})
    else:
        students_collection.insert_one(
            {"class_code": class_code, "roll_number": roll, "name": name, "created_at": time.time()}
        )
    return True


def _parse_roster_csv(text: str) -> list[tuple[str, str]]:
    """Parse CSV text into (roll_number, name) pairs."""
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return []
    fields = {f.strip().lower(): f for f in reader.fieldnames if f}

    def pick(*candidates):
        for c in candidates:
            if c in fields:
                return fields[c]
        return None

    roll_col = pick("roll_number", "roll", "roll no", "roll_no", "id")
    name_col = pick("name", "student_name", "student")
    if not roll_col or not name_col:
        raise HTTPException(
            status_code=400,
            detail="CSV must include roll_number (or roll) and name columns",
        )

    rows = []
    for line in reader:
        roll = (line.get(roll_col) or "").strip().upper()
        name = (line.get(name_col) or "").strip()
        if roll and name:
            rows.append((roll, name))
    return rows


def _get_class_or_404(class_code: str, teacher_username: Optional[str] = None) -> dict:
    if classes_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")
    code = class_code.strip().upper()
    query: dict = {"class_code": code}
    if teacher_username:
        query["teacher_username"] = teacher_username
    doc = classes_collection.find_one(query)
    if not doc:
        raise HTTPException(status_code=404, detail="Class not found")
    return doc


async def get_current_teacher(authorization: str = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    username = verify_token(authorization.split(" ", 1)[1])
    if not username:
        raise HTTPException(status_code=401, detail="Session expired or invalid token")
    return username


def _get_attention_threshold(class_code: str) -> int:
    code = class_code.strip().upper()
    if code in _threshold_cache:
        return _threshold_cache[code]
    if classes_collection is None:
        return settings.attention_threshold
    doc = classes_collection.find_one({"class_code": code})
    threshold = int(doc.get("attention_threshold", settings.attention_threshold)) if doc else settings.attention_threshold
    _threshold_cache[code] = threshold
    return threshold


def _get_sustained_duration_sec(class_code: str) -> int:
    code = class_code.strip().upper()
    if code in _sustained_duration_cache:
        return _sustained_duration_cache[code]
    if classes_collection is None:
        return int(settings.sustained_low_attention_sec)
    doc = classes_collection.find_one({"class_code": code})
    val = int(doc.get("sustained_low_attention_sec", settings.sustained_low_attention_sec)) if doc else int(settings.sustained_low_attention_sec)
    _sustained_duration_cache[code] = val
    return val


def _get_class_average_threshold(class_code: str) -> int:
    code = class_code.strip().upper()
    if code in _class_avg_threshold_cache:
        return _class_avg_threshold_cache[code]
    if classes_collection is None:
        return int(settings.class_average_threshold)
    doc = classes_collection.find_one({"class_code": code})
    val = int(doc.get("class_average_threshold", settings.class_average_threshold)) if doc else int(settings.class_average_threshold)
    _class_avg_threshold_cache[code] = val
    return val


def _ensure_class_live_state(class_code: str) -> dict:
    """Ensure the class entry exists in class_live_state, but do NOT auto-start the session."""
    code = class_code.strip().upper()
    if code not in class_live_state:
        class_live_state[code] = {
            "start_time": None,
            "last_alert_time": None,
            "session_epoch": 0,
            "sustained_low_attention": False,
            "intervention_eligible": False,
            "intervention_reason": "",
            "class_average_smoothed": None,
        }
    return class_live_state[code]


def _ensure_class_live_session(class_code: str, now: float) -> dict:
    """Legacy alias used by telemetry — only updates alert timing if session is already active."""
    code = class_code.strip().upper()
    if code not in class_live_state:
        class_live_state[code] = {"start_time": None, "last_alert_time": None, "session_epoch": 0}
    return class_live_state[code]


def _public_student(s: dict, now: float) -> dict:
    out = {k: v for k, v in s.items() if not k.startswith("_")}
    start = s.get("session_start")
    if start and s.get("status") == "active":
        out["session_duration_sec"] = max(0, int(now - start))
    else:
        out["session_duration_sec"] = 0
    last_alert = s.get("last_alert_time")
    if last_alert:
        out["last_alert_time"] = last_alert
        if s.get("alert"):
            out["seconds_since_last_alert"] = max(0, int(now - last_alert))
        else:
            out["seconds_since_last_alert"] = None
    else:
        out["seconds_since_last_alert"] = None
    return out


def _build_ws_payload(class_code: Optional[str], teacher_username: Optional[str], now: float) -> dict:
    filtered = []
    for s in students.values():
        if class_code and s.get("class_code") != class_code:
            continue
        if teacher_username and s.get("teacher_username") != teacher_username:
            continue
        filtered.append(_public_student(s, now))

    class_session = None
    if class_code:
        code = class_code.strip().upper()
        meta = class_live_state.get(code, {})
        class_session = {
            "class_code": code,
            "start_time": meta.get("start_time"),
            "last_alert_time": meta.get("last_alert_time"),
            "attention_threshold": _get_attention_threshold(code),
            "sustained_low_attention_sec": _get_sustained_duration_sec(code),
            "class_average_threshold": _get_class_average_threshold(code),
            "sustained_low_attention": meta.get("sustained_low_attention", False),
            "intervention_eligible": meta.get("intervention_eligible", False),
            "intervention_reason": meta.get("intervention_reason", ""),
            "class_average_smoothed": meta.get("class_average_smoothed"),
        }

    return {
        "students": filtered,
        "timestamp": now,
        "class_session": class_session,
    }


async def broadcast_to_teachers():
    now = time.time()
    stale_sec = settings.student_stale_sec

    # Mark stale students as offline
    for key in list(students.keys()):
        s = students[key]
        if now - s["last_update"] > stale_sec and s["status"] == "active":
            s["status"] = "offline"
            s["alert"] = "DISCONNECTED"
            if sessions_collection is not None:
                try:
                    _close_session_record(s["class_code"], s["roll_number"], now)
                except Exception as exc:
                    logger.error("Stale session update failed: %s", exc)

    # ── Temporal Smoothing & Class Average Sustained Evaluation ─────────────────
    active_by_class: Dict[str, List[dict]] = {}
    for s in students.values():
        if s.get("status") == "active" and s.get("class_code"):
            active_by_class.setdefault(s["class_code"], []).append(s)

    # Evaluate all classes with live state or active students
    evaluated_classes = set(class_live_state.keys()) | set(active_by_class.keys())
    for code in evaluated_classes:
        meta = _ensure_class_live_state(code)
        active_list = active_by_class.get(code, [])
        class_avg_thr = _get_class_average_threshold(code)
        sustained_needed = _get_sustained_duration_sec(code)
        ep = class_intervention_episodes.setdefault(code, {"start_time": None, "last_notified": None, "soft_alert_fired": False})

        if active_list:
            inst_avg = sum(s.get("attention", 0) for s in active_list) / len(active_list)
            buf = class_avg_buffers.setdefault(code, deque())
            buf.append((now, inst_avg))
            # 20-second moving average window to filter brief individual fluctuations
            while buf and now - buf[0][0] > 20.0:
                buf.popleft()

            smoothed_avg = sum(v for _, v in buf) / len(buf)
            meta["class_average_smoothed"] = round(smoothed_avg, 1)

            if smoothed_avg < class_avg_thr:
                if ep["start_time"] is None:
                    ep["start_time"] = now
                dur = now - ep["start_time"]
                meta["sustained_low_attention"] = True
                if dur >= 15.0 and not ep.get("soft_alert_fired"):
                    ep["soft_alert_fired"] = True
                    soft_notif_event = {
                        "event": "pedagogical_intervention_soft_alert",
                        "class_code": code,
                        "class_avg": round(smoothed_avg),
                        "sustained_sec": round(dur),
                        "timestamp": now,
                    }
                    for entry in teacher_sockets:
                        if entry.get("class_code") in (None, code):
                            try:
                                asyncio.create_task(entry["ws"].send_json(soft_notif_event))
                            except Exception:
                                pass

                if dur >= sustained_needed:
                    meta["intervention_eligible"] = True
                    meta["intervention_reason"] = (
                        f"Class average attention ({round(smoothed_avg)}%) sustained below {class_avg_thr}% for {int(dur)}s."
                    )
                    # Notify teacher with 60s cooldown
                    if ep["last_notified"] is None or (now - ep["last_notified"]) >= 60.0:
                        ep["last_notified"] = now
                        notif_event = {
                            "event": "pedagogical_intervention_recommended",
                            "class_code": code,
                            "class_avg": round(smoothed_avg),
                            "threshold": class_avg_thr,
                            "sustained_sec": round(dur),
                            "active_students": len(active_list),
                            "timestamp": now,
                            "reason": meta["intervention_reason"],
                        }
                        for entry in teacher_sockets:
                            if entry.get("class_code") in (None, code):
                                try:
                                    asyncio.create_task(entry["ws"].send_json(notif_event))
                                except Exception:
                                    pass
            else:
                # Attention recovered above threshold: clear episode
                ep["start_time"] = None
                ep["soft_alert_fired"] = False
                meta["intervention_eligible"] = False
                meta["sustained_low_attention"] = False
                meta["intervention_reason"] = ""
        else:
            meta["class_average_smoothed"] = None
            meta["intervention_eligible"] = False
            meta["sustained_low_attention"] = False
            ep["start_time"] = None
            ep["soft_alert_fired"] = False

    disconnected = []
    for entry in teacher_sockets:
        ws = entry["ws"]
        try:
            payload = _build_ws_payload(entry.get("class_code"), entry.get("username"), now)
            await ws.send_json(payload)
        except Exception:
            disconnected.append(entry)

    for entry in disconnected:
        if entry in teacher_sockets:
            teacher_sockets.remove(entry)


async def cleanup_task():
    try:
        while True:
            await asyncio.sleep(2)
            await broadcast_to_teachers()
    except asyncio.CancelledError:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    bg_task = asyncio.create_task(cleanup_task())
    yield
    bg_task.cancel()
    try:
        await bg_task
    except asyncio.CancelledError:
        pass
    close_db()


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex)
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


# ── Models ───────────────────────────────────────────────────────────────────

class TeacherAuth(BaseModel):
    username: str
    password: str = Field(min_length=6)


class ClassCreate(BaseModel):
    class_code: str = Field(min_length=2, max_length=32)
    display_name: str = Field(min_length=1, max_length=120)


class RosterStudent(BaseModel):
    roll_number: str
    name: str


class RosterImport(BaseModel):
    students: List[RosterStudent]


class StudentUpdate(BaseModel):
    name: str
    roll_number: str
    class_code: str
    join_code: str = ""
    attention: int = Field(ge=0, le=100)
    attention_state: Optional[str] = "Optimal Focus"
    model_prob_smoothed: float = 0.0
    model_prob_raw: float = 0.0
    model_pred_stable: int = -1
    phone_detected: bool = False
    hands_count: int = 0
    blinks: int = 0
    blinks_per_min: float = 0.0
    gaze: str = "Center"
    pose_pitch: float = 0.0
    pose_yaw: float = 0.0
    pose_roll: float = 0.0
    contributing_factors: List[str] = Field(default_factory=list)
    alert: str = ""
    is_paused: bool = False



class StudentEnd(BaseModel):
    roll_number: str
    class_code: str


class StudentJoinVerify(BaseModel):
    class_code: str = Field(min_length=2, max_length=32)
    join_code: str = Field(min_length=1, max_length=32)
    roll_number: str = ""
    name: str = ""


class SeatPosition(BaseModel):
    roll_number: str
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)


class ClassSettingsUpdate(BaseModel):
    attention_threshold: Optional[int] = Field(None, ge=0, le=100)
    sustained_low_attention_sec: Optional[int] = Field(None, ge=10, le=300)
    class_average_threshold: Optional[int] = Field(None, ge=0, le=100)
    seat_layout: Optional[List[SeatPosition]] = None
    auto_socratic: Optional[bool] = None
    socratic_timeout: Optional[int] = Field(None, ge=10, le=300)


class StudentActionRequest(BaseModel):
    action: str = Field(
        ...,
        pattern="^(send_warning|mark_excused|unexcused|suppress_alerts|unsuppress_alerts)$",
    )
    note: str = ""


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "environment": settings.environment}


@app.get("/api/ready")
async def ready():
    if not is_db_ready():
        raise HTTPException(status_code=503, detail="Database not ready")
    return {"status": "ready", "database": settings.mongodb_db}


# ── Auth ───────────────────────────────────────────────────────────────────────

@app.post("/api/auth/register")
async def register_teacher(auth: TeacherAuth, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    rate_limit_ip(client_ip, auth.username, settings.auth_rate_limit, settings.auth_rate_window_sec)
    if teachers_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    username = auth.username.strip().lower()
    if teachers_collection.find_one({"username": username}):
        raise HTTPException(status_code=400, detail="Username is already registered")

    teachers_collection.insert_one(
        {"username": username, "password_hash": hash_password(auth.password), "registered_at": time.time()}
    )
    return {"status": "success", "message": "Teacher registered successfully"}


@app.post("/api/auth/login")
async def login_teacher(auth: TeacherAuth, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    rate_limit_ip(client_ip, auth.username, settings.auth_rate_limit, settings.auth_rate_window_sec)
    if teachers_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    username = auth.username.strip().lower()
    teacher = teachers_collection.find_one({"username": username})
    if not teacher or not verify_password(auth.password, teacher["password_hash"]):
        raise HTTPException(status_code=400, detail="Invalid username or password")

    return {"status": "success", "access_token": create_token(username), "username": username}


@app.get("/api/auth/me")
async def get_me(username: str = Depends(get_current_teacher)):
    return {"username": username}


# ── Classes & roster ───────────────────────────────────────────────────────────

@app.post("/api/classes")
async def create_class(body: ClassCreate, username: str = Depends(get_current_teacher)):
    if classes_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    code = body.class_code.strip().upper().replace(" ", "_")
    if classes_collection.find_one({"class_code": code}):
        raise HTTPException(status_code=400, detail="Class code already exists")

    join_code = secrets.token_hex(3).upper()
    doc = {
        "class_code": code,
        "display_name": body.display_name.strip(),
        "teacher_username": username,
        "join_code": join_code,
        "created_at": time.time(),
        "attention_threshold": settings.attention_threshold,
        "seat_layout": [],
    }
    classes_collection.insert_one(doc)
    return {
        "status": "success",
        "class_code": code,
        "display_name": doc["display_name"],
        "join_code": join_code,
    }


@app.get("/api/ready")
async def health_check():
    return {"status": "ok", "db": is_db_ready(), "timestamp": time.time()}


@app.get("/api/classes")
async def list_classes(username: str = Depends(get_current_teacher)):
    if classes_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    cursor = classes_collection.find({"teacher_username": username}).sort("created_at", -1)
    return [
        {
            "class_code": c["class_code"],
            "display_name": c["display_name"],
            "join_code": c["join_code"],
            "created_at": c["created_at"],
        }
        for c in cursor
    ]


@app.get("/api/classes/{class_code}/roster")
async def get_roster(class_code: str, username: str = Depends(get_current_teacher)):
    _get_class_or_404(class_code, username)
    if students_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    code = class_code.strip().upper()
    cursor = students_collection.find({"class_code": code}).sort("roll_number", 1)
    return [{"roll_number": s["roll_number"], "name": s["name"]} for s in cursor]


@app.post("/api/classes/{class_code}/roster")
async def add_roster_student(
    class_code: str, body: RosterStudent, username: str = Depends(get_current_teacher)
):
    _get_class_or_404(class_code, username)
    if students_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    code = class_code.strip().upper()
    roll = body.roll_number.strip().upper()
    name = body.name.strip()
    if not roll or not name:
        raise HTTPException(status_code=400, detail="Roll number and name required")

    _upsert_roster_row(code, roll, name)
    return {"status": "success"}


@app.delete("/api/classes/{class_code}/roster/{roll_number}")
async def delete_roster_student(
    class_code: str, roll_number: str, username: str = Depends(get_current_teacher)
):
    _get_class_or_404(class_code, username)
    if students_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    code = class_code.strip().upper()
    roll = roll_number.strip().upper()
    result = students_collection.delete_one({"class_code": code, "roll_number": roll})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Student not on roster")
    key = student_key(code, roll)
    if key in students:
        del students[key]
    return {"status": "deleted", "roll_number": roll}


@app.post("/api/classes/{class_code}/roster/import")
async def import_roster(
    class_code: str, body: RosterImport, username: str = Depends(get_current_teacher)
):
    _get_class_or_404(class_code, username)
    if students_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    code = class_code.strip().upper()
    added = sum(
        1 for row in body.students if _upsert_roster_row(code, row.roll_number.strip().upper(), row.name.strip())
    )
    return {"status": "success", "imported": added}


@app.post("/api/classes/{class_code}/roster/import-csv")
async def import_roster_csv(
    class_code: str,
    file: UploadFile = File(...),
    username: str = Depends(get_current_teacher),
):
    _get_class_or_404(class_code, username)
    if students_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 CSV")

    rows = _parse_roster_csv(text)
    if not rows:
        raise HTTPException(status_code=400, detail="No valid rows found in CSV")

    code = class_code.strip().upper()
    imported = sum(1 for roll, name in rows if _upsert_roster_row(code, roll, name))
    return {"status": "success", "imported": imported, "filename": file.filename}


@app.get("/api/classes/{class_code}/settings")
async def get_class_settings(class_code: str, username: str = Depends(get_current_teacher)):
    doc = _get_class_or_404(class_code, username)
    layout = doc.get("seat_layout", [])
    return {
        "class_code": doc["class_code"],
        "attention_threshold": int(doc.get("attention_threshold", settings.attention_threshold)),
        "sustained_low_attention_sec": int(doc.get("sustained_low_attention_sec", settings.sustained_low_attention_sec)),
        "class_average_threshold": int(doc.get("class_average_threshold", settings.class_average_threshold)),
        "auto_socratic": bool(doc.get("auto_socratic", False)),
        "socratic_timeout": int(doc.get("socratic_timeout", 60)),
        "seat_layout": layout,
    }


@app.patch("/api/classes/{class_code}/settings")
async def update_class_settings(
    class_code: str, body: ClassSettingsUpdate, username: str = Depends(get_current_teacher)
):
    _get_class_or_404(class_code, username)
    if classes_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    code = class_code.strip().upper()
    update: dict = {}
    if body.attention_threshold is not None:
        update["attention_threshold"] = body.attention_threshold
        _threshold_cache[code] = body.attention_threshold
    if body.sustained_low_attention_sec is not None:
        update["sustained_low_attention_sec"] = body.sustained_low_attention_sec
        _sustained_duration_cache[code] = body.sustained_low_attention_sec
    if body.class_average_threshold is not None:
        update["class_average_threshold"] = body.class_average_threshold
        _class_avg_threshold_cache[code] = body.class_average_threshold
    if body.auto_socratic is not None:
        update["auto_socratic"] = body.auto_socratic
    if body.socratic_timeout is not None:
        update["socratic_timeout"] = body.socratic_timeout
    if body.seat_layout is not None:
        update["seat_layout"] = [
            {"roll_number": s.roll_number.strip().upper(), "x": s.x, "y": s.y}
            for s in body.seat_layout
        ]

    if not update:
        raise HTTPException(status_code=400, detail="No settings to update")

    classes_collection.update_one({"class_code": code}, {"$set": update})
    doc = classes_collection.find_one({"class_code": code})
    return {
        "status": "success",
        "attention_threshold": int(doc.get("attention_threshold", settings.attention_threshold)),
        "sustained_low_attention_sec": int(doc.get("sustained_low_attention_sec", settings.sustained_low_attention_sec)),
        "class_average_threshold": int(doc.get("class_average_threshold", settings.class_average_threshold)),
        "auto_socratic": bool(doc.get("auto_socratic", False)),
        "socratic_timeout": int(doc.get("socratic_timeout", 60)),
        "seat_layout": doc.get("seat_layout", []),
    }


def _student_action_doc(code: str, roll: str, username: str) -> dict:
    if student_actions_collection is None:
        return {
            "class_code": code,
            "roll_number": roll,
            "excused": False,
            "suppress_alerts": False,
            "action_log": [],
        }
    doc = student_actions_collection.find_one({"class_code": code, "roll_number": roll})
    if doc:
        return doc
    return {
        "class_code": code,
        "roll_number": roll,
        "teacher_username": username,
        "excused": False,
        "suppress_alerts": False,
        "action_log": [],
    }


@app.get("/api/classes/{class_code}/student-actions")
async def list_student_actions(class_code: str, username: str = Depends(get_current_teacher)):
    _get_class_or_404(class_code, username)
    if student_actions_collection is None:
        return []
    code = class_code.strip().upper()
    cursor = student_actions_collection.find(
        {"class_code": code, "teacher_username": username}
    )
    return [
        {
            "roll_number": d["roll_number"],
            "excused": d.get("excused", False),
            "suppress_alerts": d.get("suppress_alerts", False),
            "action_log": d.get("action_log", [])[-20:],
        }
        for d in cursor
    ]


@app.post("/api/classes/{class_code}/students/{roll_number}/actions")
async def post_student_action(
    class_code: str,
    roll_number: str,
    body: StudentActionRequest,
    username: str = Depends(get_current_teacher),
):
    _get_class_or_404(class_code, username)
    if student_actions_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    code = class_code.strip().upper()
    roll = roll_number.strip().upper()
    now = time.time()
    doc = _student_action_doc(code, roll, username)

    excused = doc.get("excused", False)
    suppress = doc.get("suppress_alerts", False)

    if body.action == "mark_excused":
        excused = True
    elif body.action == "unexcused":
        excused = False
    elif body.action == "suppress_alerts":
        suppress = True
    elif body.action == "unsuppress_alerts":
        suppress = False

    log_entry = {
        "action": body.action,
        "timestamp": now,
        "teacher": username,
        "note": body.note.strip(),
    }
    action_log = (doc.get("action_log") or []) + [log_entry]
    if len(action_log) > 100:
        action_log = action_log[-100:]

    student_actions_collection.update_one(
        {"class_code": code, "roll_number": roll},
        {
            "$set": {
                "class_code": code,
                "roll_number": roll,
                "teacher_username": username,
                "excused": excused,
                "suppress_alerts": suppress,
                "action_log": action_log,
                "updated_at": now,
            }
        },
        upsert=True,
    )

    return {
        "status": "success",
        "roll_number": roll,
        "excused": excused,
        "suppress_alerts": suppress,
        "action_log": action_log[-5:],
    }


@app.get("/api/live/student/detail")
async def get_live_student_detail(
    class_code: str = Query(...),
    roll_number: str = Query(...),
    username: str = Depends(get_current_teacher),
):
    _get_class_or_404(class_code, username)
    code = class_code.strip().upper()
    roll = roll_number.strip().upper()
    key = student_key(code, roll)
    now = time.time()

    live = students.get(key)
    live_public = _public_student(live, now) if live else None

    historical_avg = None
    session_logs: list = []
    if sessions_collection is not None:
        past = list(
            sessions_collection.find(
                {"class_code": code, "roll_number": roll, "teacher_username": username, "status": "offline"}
            )
            .sort("start_time", -1)
            .limit(30)
        )
        if past:
            avgs = []
            for doc in past:
                logs = doc.get("logs", [])
                if logs:
                    avgs.append(round(sum(l["attention"] for l in logs) / len(logs)))
            if avgs:
                historical_avg = round(sum(avgs) / len(avgs))

        active = sessions_collection.find_one(
            {"class_code": code, "roll_number": roll, "status": "active"}
        )
        if active:
            session_logs = active.get("logs", [])

    return {
        "live": live_public,
        "historical_avg_attention": historical_avg,
        "current_session_logs": session_logs,
        "attention_threshold": _get_attention_threshold(code),
    }


# ── Student telemetry (public) ───────────────────────────────────────────────


def _validate_join_code(class_doc: dict, join_code: str) -> None:
    submitted = (join_code or "").strip().upper()
    expected = (class_doc.get("join_code") or "").strip().upper()
    if settings.require_join_code and not submitted:
        raise HTTPException(status_code=403, detail="Join code is required for this class")
    if expected and submitted and submitted != expected:
        raise HTTPException(status_code=403, detail="Invalid class join code")


@app.get("/api/classes/{class_code}/public-info")
async def get_class_public_info(class_code: str):
    """Public class metadata endpoint for student clients."""
    code = class_code.strip().upper()
    doc = _get_class_or_404(code)
    return {
        "class_code": code,
        "display_name": doc.get("display_name", code),
        "join_code": doc.get("join_code", ""),
    }


@app.post("/api/student/verify")
async def verify_student_join(body: StudentJoinVerify):
    """Pre-flight check before the student client opens the webcam."""
    class_code = body.class_code.strip().upper()
    try:
        class_doc = _get_class_or_404(class_code)
        _validate_join_code(class_doc, body.join_code)
    except HTTPException as exc:
        raise HTTPException(
            status_code=exc.status_code if hasattr(exc, "status_code") else 403,
            detail=getattr(exc, "detail", "Invalid class code or join code"),
        )

    roll = body.roll_number.strip().upper()
    name = body.name.strip()
    if not roll or not name:
        raise HTTPException(status_code=400, detail="Roll number and student name are required")

    if students_collection is not None:
        roster = students_collection.find_one({"class_code": class_code, "roll_number": roll})
        if not roster:
            raise HTTPException(
                status_code=403,
                detail=f"Student '{roll}' is not on the class roster for {class_code}. Your teacher must add you before you can join.",
            )
        if roster.get("name", "").strip().lower() != name.lower():
            raise HTTPException(
                status_code=400,
                detail=f"Roll number '{roll}' is registered to '{roster.get('name')}' in this class.",
            )

    return {
        "status": "ok",
        "class_code": class_code,
        "display_name": class_doc.get("display_name", class_code),
        "join_code": class_doc.get("join_code", ""),
    }


def _derive_contributing_factors(update: StudentUpdate) -> list[str]:
    if update.contributing_factors:
        return update.contributing_factors[:3]
    
    factors = []
    if update.gaze == "No Face" or update.alert == "NO FACE":
        factors.append("Face detection unmaintained")
    else:
        if update.phone_detected or update.alert == "PHONE DETECTED":
            factors.append("Mobile device presence observed in frame")
        
        if update.gaze in ("Left", "Right", "Away"):
            factors.append("Prolonged horizontal gaze deviation")
        elif update.gaze == "Down":
            factors.append("Downward gaze vector toward secondary desk area")

        if update.pose_pitch > 15 or update.pose_pitch < -15:
            factors.append("Downward or angled head posture")
        if abs(update.pose_yaw) > 20:
            factors.append("Sideways head orientation")

        if update.blinks_per_min > 25:
            factors.append("Elevated blink frequency")

        if update.hands_count >= 2:
            factors.append("Increased hand activity near face/keyboard")

    if update.attention >= 70 and not factors:
        if update.gaze == "Center":
            factors.append("Centered gaze vector toward primary screen")
        if abs(update.pose_pitch) <= 15 and abs(update.pose_yaw) <= 15:
            factors.append("Stable forward-facing posture")
        if not update.phone_detected:
            factors.append("Clear learning workspace without device interference")

    return factors[:3]


@app.post("/api/student/update")
async def update_student(update: StudentUpdate):
    rate_limit(
        f"telemetry:{update.class_code}:{update.roll_number}",
        settings.telemetry_rate_limit,
        settings.telemetry_rate_window_sec,
    )

    name = update.name.strip()
    roll_number = update.roll_number.strip().upper()
    class_code = update.class_code.strip().upper()
    now = time.time()
    key = student_key(class_code, roll_number)

    if not name or not roll_number or not class_code:
        raise HTTPException(status_code=400, detail="Name, roll number, and class code are required")

    class_doc = _get_class_or_404(class_code)
    teacher_username = class_doc["teacher_username"]

    _validate_join_code(class_doc, update.join_code)

    roster = None
    if students_collection is not None:
        roster = students_collection.find_one({"class_code": class_code, "roll_number": roll_number})
        if not roster:
            raise HTTPException(
                status_code=403,
                detail=f"Student '{roll_number}' is not on the class roster for {class_code}. Please ask your teacher to add you.",
            )
        if roster.get("name", "").strip().lower() != name.lower():
            raise HTTPException(
                status_code=400,
                detail=f"Roll number '{roll_number}' is registered to '{roster.get('name')}' in this class.",
            )

    if key in students:
        active = students[key]
        if active.get("status") == "active" and active.get("name", "").strip().lower() != name.lower():
            raise HTTPException(
                status_code=400,
                detail="This roll number is currently active under another name",
            )

    prev = students.get(key, {})
    last_db_log = prev.get("last_db_log", 0)

    class_meta = _ensure_class_live_state(class_code)

    # Block telemetry if teacher has not started the session yet
    # if not class_meta.get("start_time"):
    #     raise HTTPException(
    #         status_code=409,
    #         detail="Session has not been started by the teacher yet. Please wait.",
    #     )

    current_epoch = class_meta.get("session_epoch", 0)
    if prev.get("session_epoch") != current_epoch:
        # Teacher restarted/reset session — re-sync student session epoch seamlessly
        prev["session_start"] = now
        prev["session_epoch"] = current_epoch
        prev["last_db_log"] = 0
        attention_buffers[key] = deque()

    if prev.get("status") != "active":
        session_start = now
    else:
        session_start = prev.get("session_start", now)

    last_alert_time = prev.get("last_alert_time")
    
    # ── Rolling Window & Episode Alert Evaluation ──────────────────────────────
    class_thr = _get_attention_threshold(class_code)

    # Maintain rolling window buffer (window_size_sec, default 30.0s)
    buf = attention_buffers.get(key)
    if buf is None:
        buf = deque()
        attention_buffers[key] = buf
    buf.append((now, update.attention))
    while buf and now - buf[0][0] > settings.alert_window_size_sec:
        buf.popleft()

    if buf:
        avg_att = sum(att for _, att in buf) / len(buf)
    else:
        avg_att = update.attention

    # Episode tracking & sustained low-attention evaluation
    ep = alert_episodes.get(key)
    if ep is None:
        ep = {
            "episode_start_time": None,
            "last_alert_fired_time": None,
        }
        alert_episodes[key] = ep

    alert_event_meta = None
    final_alert = (update.alert or "").strip()
    if final_alert == "SUSTAINED DISTRACTION":
        final_alert = "SUSTAINED ATTENTION DRIFT"

    if update.attention < class_thr:
        if ep["episode_start_time"] is None:
            ep["episode_start_time"] = now
        
        sustained_duration = now - ep["episode_start_time"]
        sustained_needed = _get_sustained_duration_sec(update.class_code)
        if sustained_duration >= sustained_needed:
            last_fired = ep.get("last_alert_fired_time")
            if last_fired is None or (now - last_fired) >= settings.alert_cooldown_sec:
                final_alert = "SUSTAINED ATTENTION DRIFT"
                ep["last_alert_fired_time"] = now
                alert_event_meta = {
                    "event": "sustained_attention_drift",
                    "timestamp": now,
                    "episode_start_time": ep["episode_start_time"],
                    "sustained_duration_sec": round(sustained_duration, 1),
                    "sustained_threshold_sec": sustained_needed,
                    "attention_score": update.attention,
                    "attention_state": update.attention_state or "Attention Drift",
                    "relevant_signals": {
                        "gaze": update.gaze,
                        "pose": {"pitch": update.pose_pitch, "yaw": update.pose_yaw, "roll": update.pose_roll},
                        "phone_detected": update.phone_detected,
                        "hands_count": update.hands_count,
                        "blinks_per_min": update.blinks_per_min,
                    },
                }
    else:
        # Attention recovered above threshold: clear episode start
        ep["episode_start_time"] = None
        if final_alert in ("SUSTAINED ATTENTION DRIFT", "SUSTAINED DISTRACTION"):
            final_alert = ""

    if final_alert:
        if prev.get("alert") != final_alert:
            last_alert_time = now
            class_meta["last_alert_time"] = now
        elif not last_alert_time:
            last_alert_time = now
    else:
        last_alert_time = None

    class_state = class_live_state.get(class_code, {})
    class_state["sustained_low_attention"] = avg_att < class_thr
    class_live_state[class_code] = class_state
    
    if update.is_paused:
        ep["episode_start_time"] = None
        final_alert = ""
        student_status = "paused"
        attn_state = "Monitoring Paused"
        factors = ["Monitoring paused by student"]
    else:
        student_status = "active"
        attn_state = update.attention_state or "Optimal Focus"
        factors = _derive_contributing_factors(update)

    dur_sec = round(now - ep["episode_start_time"], 1) if ep and ep.get("episode_start_time") else 0.0
    conf_pct = int(round((update.model_prob_smoothed or 0.85) * 100)) if (update.model_prob_smoothed or 0) > 0 else 85

    canonical_name = (roster.get("name") if roster else None) or name
    students[key] = {
        "name": canonical_name,
        "roll_number": roll_number,
        "class_code": class_code,
        "teacher_username": teacher_username,
        "attention": update.attention if not update.is_paused else prev.get("attention", 85),
        "attention_state": attn_state,
        "contributing_factors": factors,
        "sustained_duration_sec": dur_sec,
        "confidence": conf_pct,
        "model_prob_smoothed": update.model_prob_smoothed,
        "model_prob_raw": update.model_prob_raw,
        "model_pred_stable": update.model_pred_stable,
        "phone_detected": update.phone_detected,
        "hands_count": update.hands_count,
        "blinks": update.blinks,
        "blinks_per_min": update.blinks_per_min,
        "gaze": update.gaze,
        "pose_pitch": update.pose_pitch,
        "pose_yaw": update.pose_yaw,
        "pose_roll": update.pose_roll,
        "alert": final_alert,
        "last_update": now,
        "status": student_status,
        "is_paused": update.is_paused,
        "last_db_log": last_db_log,
        "session_start": session_start,
        "last_alert_time": last_alert_time,
        "session_epoch": current_epoch,
    }

    if sessions_collection is not None:
        try:
            active_session = sessions_collection.find_one(
                {"class_code": class_code, "roll_number": roll_number, "status": "active"}
            )
            if not active_session:
                class_meta = class_live_state.get(class_code, {})
                class_session_start = class_meta.get("start_time")
                res = sessions_collection.insert_one(
                    {
                        "name": name,
                        "roll_number": roll_number,
                        "class_code": class_code,
                        "teacher_username": teacher_username,
                        "start_time": now,
                        "end_time": None,
                        "status": "active",
                        "logs": [],
                        "join_time": now,
                        "leave_time": None,
                        "class_session_start": class_session_start,
                    }
                )
                session_id = res.inserted_id
            else:
                session_id = active_session["_id"]

            if now - last_db_log >= settings.session_log_interval_sec or alert_event_meta:
                log_entry = {
                    "attention": update.attention,
                    "attention_state": update.attention_state or "Optimal Focus",
                    "alert": final_alert,
                    "timestamp": now,
                }
                if alert_event_meta:
                    log_entry["alert_metadata"] = alert_event_meta

                sessions_collection.update_one(
                    {"_id": session_id},
                    {
                        "$push": {
                            "logs": {
                                "$each": [log_entry],
                                "$slice": -1440,
                            }
                        },
                        "$set": {"last_active": now, "name": name},
                    },
                )
                students[key]["last_db_log"] = now
        except Exception as exc:
            logger.error("Telemetry write failed: %s", exc)

    asyncio.create_task(broadcast_to_teachers())
    return {"status": "success"}


@app.post("/api/student/end")
async def end_student_session(body: StudentEnd):
    roll_number = body.roll_number.strip().upper()
    class_code = body.class_code.strip().upper()
    key = student_key(class_code, roll_number)
    now = time.time()

    if key in students:
        students[key]["status"] = "offline"
        students[key]["alert"] = "LEFT SESSION"
        students[key]["last_update"] = 0

        if sessions_collection is not None:
            try:
                _close_session_record(class_code, roll_number, now)
            except Exception as exc:
                logger.error("Session end failed: %s", exc)

    asyncio.create_task(broadcast_to_teachers())
    return {"status": "success"}


# ── Teacher analytics ────────────────────────────────────────────────────────────


def _roster_for_class(class_code: str) -> list:
    if students_collection is None:
        return []
    return list(students_collection.find({"class_code": class_code.strip().upper()}))


def _sessions_query(
    username: str,
    class_code: Optional[str],
    from_date: Optional[float],
    to_date: Optional[float],
) -> list:
    if sessions_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")
    code = None
    if class_code:
        _get_class_or_404(class_code, username)
        code = class_code.strip().upper()
    return fetch_sessions(
        sessions_collection, username, code, from_date, to_date, limit=settings.history_limit
    )

def _finalize_active_sessions(code: str, username: str, now: float) -> None:
    """Synchronous helper — run in thread pool to avoid blocking the event loop."""
    if sessions_collection is None:
        return
    for doc in sessions_collection.find(
        {"class_code": code, "teacher_username": username, "status": "active"}
    ):
        sessions_collection.update_one(
            {"_id": doc["_id"]},
            {
                "$set": {
                    "status": "offline",
                    "end_time": now,
                    "leave_time": now,
                    "session_status": "completed",
                }
            },
        )


@app.post("/api/session/start")
async def start_session(
    class_code: str = Query(..., min_length=2),
    username: str = Depends(get_current_teacher),
):
    """Explicitly start a live session for the class. Students can now send telemetry."""
    _get_class_or_404(class_code, username)
    code = class_code.strip().upper()
    now = time.time()

    meta = _ensure_class_live_state(code)
    prev_epoch = meta.get("session_epoch", 0)
    class_live_state[code] = {
        "start_time": now,
        "last_alert_time": None,
        "session_epoch": prev_epoch + 1,
    }

    asyncio.create_task(broadcast_to_teachers())
    return {"status": "session_started", "class_code": code, "start_time": now}


@app.post("/api/session/end")
async def end_session(
    class_code: str = Query(..., min_length=2),
    username: str = Depends(get_current_teacher),
):
    """Explicitly end the live session. Clears students and prevents new telemetry."""
    _get_class_or_404(class_code, username)
    code = class_code.strip().upper()
    now = time.time()

    for key in list(students.keys()):
        if students[key].get("class_code") == code:
            del students[key]

    prev_epoch = class_live_state.get(code, {}).get("session_epoch", 0)
    class_live_state[code] = {
        "start_time": None,
        "last_alert_time": None,
        "session_epoch": prev_epoch,
    }

    await asyncio.to_thread(_finalize_active_sessions, code, username, now)

    asyncio.create_task(broadcast_to_teachers())
    return {"status": "session_ended", "class_code": code}


@app.get("/api/session/reset")
async def reset_session(
    class_code: str = Query(..., min_length=2),
    username: str = Depends(get_current_teacher),
):
    """Legacy endpoint — kept for backward compatibility. Ends the current session."""
    _get_class_or_404(class_code, username)
    code = class_code.strip().upper()
    now = time.time()

    for key in list(students.keys()):
        if students[key].get("class_code") == code:
            del students[key]

    prev_epoch = class_live_state.get(code, {}).get("session_epoch", 0)
    class_live_state[code] = {
        "start_time": None,
        "last_alert_time": None,
        "session_epoch": prev_epoch,
    }

    await asyncio.to_thread(_finalize_active_sessions, code, username, now)

    asyncio.create_task(broadcast_to_teachers())
    return {"status": "reset_successful", "class_code": code}


@app.get("/api/analytics/history")
async def get_history(
    class_code: Optional[str] = Query(None),
    from_date: Optional[float] = Query(None),
    to_date: Optional[float] = Query(None),
    username: str = Depends(get_current_teacher),
):
    docs = _sessions_query(username, class_code, from_date, to_date)
    return [_session_summary(doc) for doc in docs]


@app.get("/api/analytics/overview")
async def get_analytics_overview(
    class_code: str = Query(..., min_length=2),
    from_date: Optional[float] = Query(None),
    to_date: Optional[float] = Query(None),
    username: str = Depends(get_current_teacher),
):
    _get_class_or_404(class_code, username)
    code = class_code.strip().upper()
    docs = _sessions_query(username, code, from_date, to_date)
    roster = _roster_for_class(code)
    return build_overview(docs, len(roster))


@app.get("/api/analytics/compare")
async def compare_two_sessions(
    session_a: str = Query(...),
    session_b: str = Query(...),
    username: str = Depends(get_current_teacher),
):
    if sessions_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")
    try:
        oid_a, oid_b = ObjectId(session_a), ObjectId(session_b)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session id")

    doc_a = sessions_collection.find_one({"_id": oid_a, "teacher_username": username})
    doc_b = sessions_collection.find_one({"_id": oid_b, "teacher_username": username})
    if not doc_a or not doc_b:
        raise HTTPException(status_code=404, detail="One or both sessions not found")

    roster = _roster_for_class(doc_a["class_code"])
    return compare_sessions(doc_a, doc_b, len(roster))


@app.get("/api/analytics/student")
async def get_student_analytics(
    class_code: str = Query(..., min_length=2),
    roll_number: str = Query(..., min_length=1),
    from_date: Optional[float] = Query(None),
    to_date: Optional[float] = Query(None),
    username: str = Depends(get_current_teacher),
):
    _get_class_or_404(class_code, username)
    code = class_code.strip().upper()
    docs = _sessions_query(username, code, from_date, to_date)
    all_class_docs = fetch_sessions(
        sessions_collection, username, code, limit=settings.history_limit
    ) if sessions_collection is not None else docs
    result = build_student_analytics(docs, roll_number, all_class_docs)
    if result.get("session_count", 0) == 0:
        raise HTTPException(status_code=404, detail="No sessions found for this student")
    return result


@app.get("/api/analytics/attention-summary")
@app.get("/api/analytics/attendance")
async def get_attendance_analytics(
    class_code: str = Query(..., min_length=2),
    from_date: Optional[float] = Query(None),
    to_date: Optional[float] = Query(None),
    username: str = Depends(get_current_teacher),
):
    _get_class_or_404(class_code, username)
    code = class_code.strip().upper()
    start, end = parse_date_range(from_date, to_date)
    docs = _sessions_query(username, code, start, end)
    roster = _roster_for_class(code)
    return build_attention_session_analytics(docs, roster, start, end)


@app.get("/api/analytics/session/{session_id}")
async def get_session_detail(session_id: str, username: str = Depends(get_current_teacher)):
    if sessions_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    try:
        oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session id")

    doc = sessions_collection.find_one({"_id": oid, "teacher_username": username})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    summary = _session_summary(doc)
    summary["logs"] = doc.get("logs", [])
    return summary


@app.delete("/api/analytics/session/{session_id}")
async def delete_session(session_id: str, username: str = Depends(get_current_teacher)):
    if sessions_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    try:
        oid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session id")

    result = sessions_collection.delete_one({"_id": oid, "teacher_username": username})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "deleted", "id": session_id}


@app.get("/api/analytics/history/export")
async def export_history_csv(
    class_code: Optional[str] = Query(None),
    from_date: Optional[float] = Query(None),
    to_date: Optional[float] = Query(None),
    username: str = Depends(get_current_teacher),
):
    docs = _sessions_query(username, class_code, from_date, to_date)
    rows = [_session_summary(doc) for doc in docs]

    output = io.StringIO()
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "id",
            "name",
            "roll_number",
            "class_code",
            "start_time",
            "end_time",
            "status",
            "avg_attention",
            "alerts_count",
            "log_count",
            "duration_sec",
        ],
    )
    writer.writeheader()
    for row in rows:
        writer.writerow({k: row.get(k) for k in writer.fieldnames if k in row})

    output.seek(0)
    filename = f"attention_history_{class_code or 'all'}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/analytics/reports/excel")
async def export_excel_report(
    class_code: str = Query(..., min_length=2),
    from_date: Optional[float] = Query(None),
    to_date: Optional[float] = Query(None),
    username: str = Depends(get_current_teacher),
):
    _get_class_or_404(class_code, username)
    code = class_code.strip().upper()
    start, end = parse_date_range(from_date, to_date)
    docs = _sessions_query(username, code, start, end)
    roster = _roster_for_class(code)
    overview = build_overview(docs, len(roster))

    rolls = {d["roll_number"] for d in docs}
    student_rows = []
    for roll in rolls:
        try:
            student_rows.append(build_student_analytics(docs, roll, docs))
        except Exception:
            pass

    attendance = build_attention_session_analytics(docs, roster, start, end)
    data = generate_excel_workbook(code, overview, student_rows, attendance, start, end)
    filename = f"attention_session_report_{code}.xlsx"
    return StreamingResponse(
        iter([data]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/analytics/reports/pdf")
async def export_pdf_report(
    class_code: str = Query(..., min_length=2),
    from_date: Optional[float] = Query(None),
    to_date: Optional[float] = Query(None),
    report_type: str = Query("class_summary"),
    roll_number: Optional[str] = Query(None),
    username: str = Depends(get_current_teacher),
):
    _get_class_or_404(class_code, username)
    code = class_code.strip().upper()
    start, end = parse_date_range(from_date, to_date)
    docs = _sessions_query(username, code, start, end)
    roster = _roster_for_class(code)
    overview = build_overview(docs, len(roster))
    attendance = build_attention_session_analytics(docs, roster, start, end)

    student_row = None
    title = f"Class Attention Summary — {code}"
    if report_type == "student" and roll_number:
        student_row = build_student_analytics(docs, roll_number, docs)
        title = f"Student Attention Report — {student_row.get('name', roll_number)}"

    data = generate_pdf_report(title, code, overview, student_row, attendance, start, end)
    filename = f"attention_session_report_{code}.pdf"
    return StreamingResponse(
        iter([data]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/analytics/attention/export")
@app.get("/api/analytics/attendance/export")
async def export_attendance(
    class_code: str = Query(..., min_length=2),
    from_date: Optional[float] = Query(None),
    to_date: Optional[float] = Query(None),
    format: str = Query("csv"),
    username: str = Depends(get_current_teacher),
):
    _get_class_or_404(class_code, username)
    code = class_code.strip().upper()
    start, end = parse_date_range(from_date, to_date)
    docs = _sessions_query(username, code, start, end)
    roster = _roster_for_class(code)
    attendance = build_attention_session_analytics(docs, roster, start, end)

    if format == "xlsx":
        overview = build_overview(docs, len(roster))
        rolls = {d["roll_number"] for d in docs}
        student_rows = [
            build_student_analytics(docs, roll, docs) for roll in rolls
        ]
        data = generate_excel_workbook(code, overview, student_rows, attendance, start, end)
        return StreamingResponse(
            iter([data]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="attention_session_report_{code}.xlsx"'},
        )

    if format == "pdf":
        overview = build_overview(docs, len(roster))
        data = generate_pdf_report(
            f"Attention Session Report — {code}", code, overview, None, attendance, start, end
        )
        return StreamingResponse(
            iter([data]),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="attention_session_report_{code}.pdf"'},
        )

    csv_data = attention_session_csv_rows(attendance)
    return StreamingResponse(
        iter([csv_data]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="attention_session_report_{code}.csv"'},
    )


@app.websocket("/ws/teacher")
async def websocket_teacher(websocket: WebSocket):
    await websocket.accept()
    token = websocket.query_params.get("token")
    class_code = websocket.query_params.get("class_code", "").strip().upper() or None
    username = verify_token(token) if token else None

    if not username:
        await websocket.close(code=1008)
        return

    if class_code:
        try:
            _get_class_or_404(class_code, username)
        except HTTPException:
            await websocket.close(code=1008)
            return

    entry = {"ws": websocket, "username": username, "class_code": class_code}
    teacher_sockets.append(entry)
    try:
        await websocket.send_json(_build_ws_payload(class_code, username, time.time()))
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if entry in teacher_sockets:
            teacher_sockets.remove(entry)


@app.websocket("/ws/student")
async def websocket_student(websocket: WebSocket):
    await websocket.accept()
    class_code = websocket.query_params.get("class_code", "").strip().upper() or "CS101"
    student_id = websocket.query_params.get("student_id", "").strip().upper() or "STUDENT-01"

    if students_collection is not None:
        roster = students_collection.find_one({"class_code": class_code, "roll_number": student_id})
        if not roster:
            await websocket.send_json({
                "event": "error",
                "message": f"Student '{student_id}' is not on the class roster for {class_code}. Your teacher must add you first."
            })
            await websocket.close(code=1008)
            return

    entry = {"ws": websocket, "class_code": class_code, "student_id": student_id}
    student_sockets.append(entry)
    try:
        await websocket.send_json({
            "event": "student_connected",
            "class_code": class_code,
            "student_id": student_id,
            "timestamp": time.time()
        })
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if entry in student_sockets:
            student_sockets.remove(entry)


# ── Static React bundle ────────────────────────────────────────────────────────


dist_path = ROOT_DIR / "frontend" / "dist"

if dist_path.exists():
    app.mount("/", StaticFiles(directory=str(dist_path), html=True), name="dist")
else:

    @app.get("/")
    async def fallback_route():
        return HTMLResponse(
            "<html><body style='font-family:sans-serif;background:#12141c;color:#5aa0f0;padding:40px'>"
            "<h2>React frontend not built</h2>"
            "<p>Run <code>npm install && npm run build</code> in <b>frontend</b>.</p>"
            "</body></html>"
        )
