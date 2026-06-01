"""Attention Monitor API — auth, classes, telemetry, analytics."""
import asyncio
import csv
import io
import logging
import os
import secrets
import time
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional, Set

from bson import ObjectId
from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from pathlib import Path

from backend.app.auth import (
    create_token,
    hash_password,
    rate_limit,
    verify_password,
    verify_token,
)
from backend.app.config import ROOT_DIR, get_settings
from backend.app.database import (
    classes_collection,
    close_db,
    is_db_ready,
    sessions_collection,
    students_collection,
    teachers_collection,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)
settings = get_settings()


def student_key(class_code: str, roll_number: str) -> str:
    return f"{class_code.strip().upper()}:{roll_number.strip().upper()}"


# In-memory live state: key -> student dict
students: Dict[str, dict] = {}

# WebSocket subscribers: {ws, username, class_code (optional filter)}
teacher_sockets: List[dict] = []


def _session_summary(doc: dict) -> dict:
    logs = doc.get("logs", [])
    avg_attention = round(sum(log["attention"] for log in logs) / len(logs)) if logs else 0
    alerts_count = sum(1 for log in logs if log.get("alert"))
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "roll_number": doc["roll_number"],
        "class_code": doc["class_code"],
        "teacher_username": doc.get("teacher_username"),
        "start_time": doc["start_time"],
        "end_time": doc["end_time"],
        "status": doc["status"],
        "avg_attention": avg_attention,
        "alerts_count": alerts_count,
        "log_count": len(logs),
    }


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


def _filtered_students(class_code: Optional[str], teacher_username: Optional[str]) -> list:
    result = []
    for s in students.values():
        if class_code and s.get("class_code") != class_code:
            continue
        if teacher_username and s.get("teacher_username") != teacher_username:
            continue
        result.append({k: v for k, v in s.items() if not k.startswith("_")})
    return result


async def broadcast_to_teachers():
    now = time.time()
    stale_sec = settings.student_stale_sec

    for key in list(students.keys()):
        s = students[key]
        if now - s["last_update"] > stale_sec and s["status"] == "active":
            s["status"] = "offline"
            s["alert"] = "DISCONNECTED"
            if sessions_collection is not None:
                try:
                    sessions_collection.update_one(
                        {
                            "class_code": s["class_code"],
                            "roll_number": s["roll_number"],
                            "status": "active",
                        },
                        {"$set": {"status": "offline", "end_time": now}},
                    )
                except Exception as exc:
                    logger.error("Stale session update failed: %s", exc)

    disconnected = []
    for entry in teacher_sockets:
        ws = entry["ws"]
        try:
            payload = {
                "students": _filtered_students(entry.get("class_code"), entry.get("username")),
                "timestamp": now,
            }
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


app = FastAPI(
    title="Attention Monitor API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    alert: str = ""


class StudentEnd(BaseModel):
    roll_number: str
    class_code: str


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
async def register_teacher(auth: TeacherAuth):
    rate_limit(f"auth:{auth.username}", settings.auth_rate_limit, settings.auth_rate_window_sec)
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
async def login_teacher(auth: TeacherAuth):
    rate_limit(f"auth:{auth.username}", settings.auth_rate_limit, settings.auth_rate_window_sec)
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

    code = body.class_code.strip().upper()
    if classes_collection.find_one({"class_code": code}):
        raise HTTPException(status_code=400, detail="Class code already exists")

    join_code = secrets.token_hex(3).upper()
    doc = {
        "class_code": code,
        "display_name": body.display_name.strip(),
        "teacher_username": username,
        "join_code": join_code,
        "created_at": time.time(),
    }
    classes_collection.insert_one(doc)
    return {
        "status": "success",
        "class_code": code,
        "display_name": doc["display_name"],
        "join_code": join_code,
    }


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


# ── Student telemetry (public) ───────────────────────────────────────────────

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

    if settings.require_join_code:
        if update.join_code.strip().upper() != class_doc.get("join_code", ""):
            raise HTTPException(status_code=403, detail="Invalid class join code")

    if students_collection is not None:
        roster = students_collection.find_one({"class_code": class_code, "roll_number": roll_number})
        if roster and roster.get("name") != name:
            raise HTTPException(
                status_code=400,
                detail="Roll number is registered to a different student name for this class",
            )

    if key in students:
        active = students[key]
        if active["status"] == "active" and active["name"] != name:
            raise HTTPException(
                status_code=400,
                detail="This roll number is currently active under another name",
            )

    prev = students.get(key, {})
    last_db_log = prev.get("last_db_log", 0)

    students[key] = {
        "name": name,
        "roll_number": roll_number,
        "class_code": class_code,
        "teacher_username": teacher_username,
        "attention": update.attention,
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
        "alert": update.alert,
        "last_update": now,
        "status": "active",
        "last_db_log": last_db_log,
    }

    if sessions_collection is not None:
        try:
            active_session = sessions_collection.find_one(
                {"class_code": class_code, "roll_number": roll_number, "status": "active"}
            )
            if not active_session:
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
                    }
                )
                session_id = res.inserted_id
            else:
                session_id = active_session["_id"]

            if now - last_db_log >= settings.session_log_interval_sec:
                sessions_collection.update_one(
                    {"_id": session_id},
                    {
                        "$push": {
                            "logs": {
                                "attention": update.attention,
                                "alert": update.alert,
                                "timestamp": now,
                            }
                        },
                        "$set": {"last_active": now, "name": name},
                    },
                )
                students[key]["last_db_log"] = now
        except Exception as exc:
            logger.error("Telemetry write failed: %s", exc)

    await broadcast_to_teachers()
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
                sessions_collection.update_one(
                    {"class_code": class_code, "roll_number": roll_number, "status": "active"},
                    {"$set": {"status": "offline", "end_time": now}},
                )
            except Exception as exc:
                logger.error("Session end failed: %s", exc)

        await broadcast_to_teachers()
    return {"status": "success"}


# ── Teacher analytics ────────────────────────────────────────────────────────────

@app.get("/api/session/reset")
async def reset_session(
    class_code: str = Query(..., min_length=2),
    username: str = Depends(get_current_teacher),
):
    _get_class_or_404(class_code, username)
    code = class_code.strip().upper()
    now = time.time()

    for key in list(students.keys()):
        if students[key].get("class_code") == code:
            del students[key]

    if sessions_collection is not None:
        sessions_collection.update_many(
            {"class_code": code, "teacher_username": username, "status": "active"},
            {"$set": {"status": "offline", "end_time": now}},
        )

    await broadcast_to_teachers()
    return {"status": "reset_successful", "class_code": code}


@app.get("/api/analytics/history")
async def get_history(
    class_code: Optional[str] = Query(None),
    username: str = Depends(get_current_teacher),
):
    if sessions_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    query: dict = {"teacher_username": username}
    if class_code:
        _get_class_or_404(class_code, username)
        query["class_code"] = class_code.strip().upper()

    cursor = sessions_collection.find(query).sort("start_time", -1).limit(settings.history_limit)
    return [_session_summary(doc) for doc in cursor]


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
    username: str = Depends(get_current_teacher),
):
    rows = await get_history(class_code=class_code, username=username)

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
        ],
    )
    writer.writeheader()
    for row in rows:
        writer.writerow({k: row.get(k) for k in writer.fieldnames})

    output.seek(0)
    filename = f"attention_history_{class_code or 'all'}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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
        await websocket.send_json(
            {
                "students": _filtered_students(class_code, username),
                "timestamp": time.time(),
            }
        )
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if entry in teacher_sockets:
            teacher_sockets.remove(entry)


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
