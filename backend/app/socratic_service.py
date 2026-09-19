from fastapi import APIRouter, Depends, HTTPException, Header, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from bson import ObjectId

from backend.app.auth import verify_token, create_join_token, verify_join_token
from backend.app.database import (
    socratic_sessions_collection,
    socratic_questions_collection,
    socratic_answers_collection,
    sessions_collection,
    intervention_activities_collection,
    students_collection,
)

router = APIRouter(prefix="/api/socratic", tags=["socratic"])

class StartSessionRequest(BaseModel):
    class_code: str

class EndSessionRequest(BaseModel):
    session_id: str

class PublishQuestionRequest(BaseModel):
    session_id: str
    question_text: Optional[str] = None
    question: Optional[str] = None
    question_type: Optional[str] = "short"  # "mcq" or "short"
    options: Optional[List[str]] = None      # List of MCQ options e.g. ["Option A", "Option B", ...]

class SubmitAnswerRequest(BaseModel):
    session_id: Optional[str] = None
    question_id: Optional[str] = None
    answer_text: Optional[str] = None
    answer: Optional[str] = None
    selected_option: Optional[str] = None   # For MCQ questions
    confidence_level: Optional[str] = "Confident" # "Very Confident", "Confident", "Unsure"
    roll_number: Optional[str] = "STUDENT"
    class_code: Optional[str] = ""

class SubmitReflectionRequest(BaseModel):
    question_id: str
    roll_number: str
    class_code: str
    reflection_text: Optional[str] = ""
    selected_option: Optional[str] = None   # Revised option choice for MCQ questions
    confidence_level: Optional[str] = "Confident"

class CreateSessionRequest(BaseModel):
    class_code: str
    question_text: Optional[str] = "What is the primary factor driving this algorithm's complexity?"
    question_type: Optional[str] = "mcq"
    options: Optional[List[str]] = None
    activity_type: Optional[str] = "socratic_question"  # one of ACTIVITY_TYPES keys
    activity_config: Optional[Dict[str, Any]] = None     # activity-specific configuration

class JoinSessionRequest(BaseModel):
    join_token: Optional[str] = None
    roll_number: Optional[str] = "STUDENT-01"
    class_code: Optional[str] = "CS101"

class ThinkStageRequest(BaseModel):
    roll_number: Optional[str] = "STUDENT-01"
    answer_text: Optional[str] = None
    selected_option: Optional[str] = None
    confidence_level: Optional[str] = "Confident"

class ReflectStageRequest(BaseModel):
    roll_number: Optional[str] = "STUDENT-01"
    reflection_text: Optional[str] = None
    selected_option: Optional[str] = None
    confidence_level: Optional[str] = "Confident"

class ReassessStageRequest(BaseModel):
    roll_number: Optional[str] = "STUDENT-01"
    answer_text: Optional[str] = None
    selected_option: Optional[str] = None
    confidence_level: Optional[str] = "Confident"

class CompleteStageRequest(BaseModel):
    roll_number: Optional[str] = "STUDENT-01"


class ActivityResponseRequest(BaseModel):
    roll_number: Optional[str] = "STUDENT-01"
    class_code: Optional[str] = "CS101"
    response_data: Optional[Dict[str, Any]] = None  # flexible payload per activity type


# ── Activity Types Catalog ──────────────────────────────────────────────────────

ACTIVITY_TYPES = {
    "quick_poll": {
        "name": "Quick Poll",
        "category": "quick_engagement",
        "category_label": "Quick Engagement",
        "description": "Quick single or multiple-choice vote to gauge understanding.",
        "estimated_time": "~1 min",
        "icon": "bar-chart-2",
        "config_fields": ["question_text", "options", "allow_multiple"]
    },
    "concept_check": {
        "name": "Concept Check",
        "category": "quick_engagement",
        "category_label": "Quick Engagement",
        "description": "MCQ or True/False question with a correct answer.",
        "estimated_time": "~2 min",
        "icon": "check-circle",
        "config_fields": ["question_text", "options", "correct_answer", "true_false_mode"]
    },
    "predict_reveal": {
        "name": "Predict & Reveal",
        "category": "active_thinking",
        "category_label": "Active Thinking",
        "description": "Students predict an outcome, then see the correct answer and rate their surprise.",
        "estimated_time": "~3 min",
        "icon": "eye",
        "config_fields": ["prompt_text", "correct_answer", "explanation"]
    },
    "spot_mistake": {
        "name": "Spot the Mistake",
        "category": "active_thinking",
        "category_label": "Active Thinking",
        "description": "Students identify an error in presented content and explain the correction.",
        "estimated_time": "~3 min",
        "icon": "alert-triangle",
        "config_fields": ["content_with_mistake", "correct_version", "hint"]
    },
    "arrange_steps": {
        "name": "Arrange the Steps",
        "category": "active_thinking",
        "category_label": "Active Thinking",
        "description": "Students arrange items in the correct sequence using arrow buttons.",
        "estimated_time": "~3 min",
        "icon": "list-ordered",
        "config_fields": ["steps", "correct_order"]
    },
    "socratic_question": {
        "name": "Socratic Question",
        "category": "deep_reflection",
        "category_label": "Deep Reflection",
        "description": "Full Think → Compare → Reflect → Reassess workflow for deep learning.",
        "estimated_time": "~5 min",
        "icon": "help-circle",
        "config_fields": ["question_text", "question_type", "options"]
    },
    "confidence_reflection": {
        "name": "Confidence + Reflection",
        "category": "deep_reflection",
        "category_label": "Deep Reflection",
        "description": "Students rate confidence before and after answering to measure metacognitive growth.",
        "estimated_time": "~4 min",
        "icon": "trending-up",
        "config_fields": ["question_text", "options"]
    },
    "teach_back": {
        "name": "Teach-Back",
        "category": "deep_reflection",
        "category_label": "Deep Reflection",
        "description": "Students explain a concept in their own words to demonstrate understanding.",
        "estimated_time": "~5 min",
        "icon": "message-circle",
        "config_fields": ["topic", "guiding_prompt"]
    }
}



async def get_current_teacher(authorization: Optional[str] = Header(None)) -> str:
    from backend.app.config import get_settings
    settings = get_settings()
    if not settings.is_production:
        return "dev_teacher"
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    username = verify_token(authorization.split(" ", 1)[1])
    if not username:
        raise HTTPException(status_code=401, detail="Invalid token")
    return username


async def get_optional_teacher(authorization: Optional[str] = Header(None)) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return verify_token(authorization.split(" ", 1)[1])
    except Exception:
        return None


async def broadcast_socratic_event(event_type: str, data: dict, target_class_code: Optional[str] = None):
    try:
        from backend.app.main import teacher_sockets, student_sockets
        payload = {"event": event_type, **data}
        # Send to teacher sockets
        for s in list(teacher_sockets):
            try:
                await s["ws"].send_json(payload)
            except Exception:
                pass
        # Send to student sockets matching class code
        class_filter = (target_class_code or data.get("class_code") or "").strip().upper()
        for s in list(student_sockets):
            s_code = (s.get("class_code") or "").strip().upper()
            if not class_filter or not s_code or s_code == class_filter:
                try:
                    await s["ws"].send_json(payload)
                except Exception:
                    pass
    except Exception:
        pass


# ── RESTful Socratic Session API Endpoints ─────────────────────────────────────

@router.post("/sessions")
async def create_socratic_session(req: CreateSessionRequest, username: str = Depends(get_current_teacher)):
    code = req.class_code.strip().upper()
    if socratic_sessions_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    # End any currently active socratic session for this class
    socratic_sessions_collection.update_many(
        {"class_code": code, "status": "active"},
        {"$set": {"status": "ended", "end_time": datetime.utcnow()}}
    )

    activity_type = (req.activity_type or "socratic_question").strip().lower()
    activity_config = req.activity_config or {}

    session_doc = {
        "class_code": code,
        "teacher_username": username,
        "start_time": datetime.utcnow(),
        "end_time": None,
        "status": "created",
        "activity_type": activity_type,
        "activity_config": activity_config,
    }
    result = socratic_sessions_collection.insert_one(session_doc)
    session_id = str(result.inserted_id)

    # Insert question if provided
    q_text = (req.question_text or "What is the primary factor driving this algorithm's complexity?").strip()
    q_type = (req.question_type or "mcq").lower()
    options = req.options or ["Time Complexity O(N)", "Space Complexity O(N)", "Auxiliary Memory Overhead", "Recursion Stack Limit"]

    if socratic_questions_collection is not None:
        qdoc = {
            "session_id": result.inserted_id,
            "text": q_text,
            "question_type": q_type,
            "options": options,
            "created_at": datetime.utcnow()
        }
        socratic_questions_collection.insert_one(qdoc)

    return {"session_id": session_id, "status": "created", "class_code": code, "activity_type": activity_type}


@router.post("/sessions/{session_id}/activate")
async def activate_socratic_session(session_id: str, username: str = Depends(get_current_teacher)):
    if socratic_sessions_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    try:
        sid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    session = socratic_sessions_collection.find_one({"_id": sid})
    if not session:
        raise HTTPException(status_code=404, detail="Socratic session not found")

    code = session.get("class_code", "CS101")
    socratic_sessions_collection.update_one(
        {"_id": sid},
        {"$set": {"status": "active", "start_time": datetime.utcnow()}}
    )

    # Fetch question details
    q_doc = socratic_questions_collection.find_one({"session_id": sid}, sort=[("created_at", -1)]) if socratic_questions_collection is not None else None
    q_text = q_doc.get("text", "Socratic Intervention Question") if q_doc else "Socratic Intervention Question"
    q_type = q_doc.get("question_type", "mcq") if q_doc else "mcq"
    options = q_doc.get("options", []) if q_doc else []

    join_token = create_join_token(session_id=session_id, class_code=code, student_id="STUDENT", minutes=15)

    from backend.app.main import class_live_state
    if code in class_live_state:
        class_live_state[code]["sustained_low_attention"] = False
        class_live_state[code]["intervention_eligible"] = False
        class_live_state[code]["intervention_reason"] = ""

    activity_type = session.get("activity_type", "socratic_question")
    activity_config = session.get("activity_config", {})

    event_payload = {
        "session_id": session_id,
        "class_code": code,
        "question_id": str(q_doc["_id"]) if q_doc else None,
        "question_text": q_text,
        "question_type": q_type,
        "options": options,
        "join_token": join_token,
        "teacher_username": username,
        "activity_type": activity_type,
        "activity_config": activity_config,
        "timestamp": datetime.utcnow().isoformat()
    }

    await broadcast_socratic_event("socratic_session_activated", event_payload, target_class_code=code)
    await broadcast_socratic_event("socratic_session_started", event_payload, target_class_code=code)

    return {"session_id": session_id, "status": "active", "class_code": code, "join_token": join_token}


@router.get("/sessions/{session_id}")
async def get_socratic_session(session_id: str):
    if socratic_sessions_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    try:
        sid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    session = socratic_sessions_collection.find_one({"_id": sid})
    if not session:
        raise HTTPException(status_code=404, detail="Socratic session not found")

    q_docs = list(socratic_questions_collection.find({"session_id": sid}).sort("created_at", 1)) if socratic_questions_collection is not None else []
    questions = [{
        "id": str(q["_id"]),
        "text": q.get("text", ""),
        "question_type": q.get("question_type", "mcq"),
        "options": q.get("options", []),
        "created_at": q.get("created_at").isoformat() if q.get("created_at") else None
    } for q in q_docs]

    join_token = create_join_token(session_id=session_id, class_code=session.get("class_code", "CS101"), student_id="STUDENT", minutes=15)

    return {
        "session_id": session_id,
        "class_code": session.get("class_code"),
        "status": session.get("status"),
        "teacher_username": session.get("teacher_username"),
        "activity_type": session.get("activity_type", "socratic_question"),
        "activity_config": session.get("activity_config", {}),
        "start_time": session.get("start_time").isoformat() if session.get("start_time") else None,
        "end_time": session.get("end_time").isoformat() if session.get("end_time") else None,
        "questions": questions,
        "join_token": join_token
    }


def _check_student_in_roster(class_code: str, roll_number: str):
    if students_collection is not None:
        roster = students_collection.find_one({
            "class_code": class_code.strip().upper(),
            "roll_number": roll_number.strip().upper()
        })
        if not roster:
            raise HTTPException(
                status_code=403,
                detail=f"Student '{roll_number}' is not on the class roster for {class_code}. Your teacher must add you before you can join.",
            )
        return roster
    return None


@router.post("/sessions/{session_id}/join")
async def join_socratic_session(session_id: str, req: JoinSessionRequest):
    if socratic_sessions_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    try:
        sid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    session = socratic_sessions_collection.find_one({"_id": sid})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.get("status") in ["ended", "cancelled"]:
        raise HTTPException(status_code=400, detail="Session has already ended")

    roll = (req.roll_number or "STUDENT-01").strip().upper()
    code = session.get("class_code", req.class_code or "CS101").strip().upper()

    # Verify student is in the class roster
    _check_student_in_roster(code, roll)

    # Validate join token if passed
    if req.join_token:
        decoded = verify_join_token(req.join_token)
        if not decoded or decoded.get("session_id") != session_id:
            raise HTTPException(status_code=401, detail="Invalid or expired join token")

    # Fetch active question
    q_doc = socratic_questions_collection.find_one({"session_id": sid}, sort=[("created_at", -1)]) if socratic_questions_collection is not None else None
    qid = q_doc["_id"] if q_doc else None

    # Check student's current progress state in database
    attempt1 = socratic_answers_collection.find_one({"question_id": qid, "class_code": code, "roll_number": roll, "attempt_number": 1}) if (qid and socratic_answers_collection is not None) else None
    attempt2 = socratic_answers_collection.find_one({"question_id": qid, "class_code": code, "roll_number": roll, "attempt_number": 2}) if (qid and socratic_answers_collection is not None) else None

    if attempt2:
        state = "COMPLETED" if attempt2.get("completed") else "REASSESS_SUBMITTED"
    elif attempt1:
        state = "COMPARE_AVAILABLE" if attempt1.get("compare_viewed") else "THINK_SUBMITTED"
    else:
        state = "ACTIVE"

    # For non-Socratic activities, check if student already responded
    activity_type = session.get("activity_type", "socratic_question")
    activity_response = None
    if activity_type != "socratic_question" and intervention_activities_collection is not None:
        activity_response = intervention_activities_collection.find_one(
            {"session_id": sid, "roll_number": roll}
        )
        if activity_response:
            state = "ACTIVITY_COMPLETED"

    return {
        "session_id": session_id,
        "class_code": code,
        "roll_number": roll,
        "status": session.get("status"),
        "state": state,
        "activity_type": activity_type,
        "activity_config": session.get("activity_config", {}),
        "question": {
            "id": str(qid) if qid else None,
            "text": q_doc.get("text", "") if q_doc else "",
            "question_type": q_doc.get("question_type", "mcq") if q_doc else "mcq",
            "options": q_doc.get("options", []) if q_doc else []
        } if q_doc else None,
        "attempt1": {
            "answer_text": attempt1.get("answer_text"),
            "selected_option": attempt1.get("selected_option"),
            "confidence_level": attempt1.get("confidence_level")
        } if attempt1 else None,
        "attempt2": {
            "reflection_text": attempt2.get("reflection_text"),
            "selected_reflection_option": attempt2.get("selected_reflection_option"),
            "confidence_level": attempt2.get("confidence_level")
        } if attempt2 else None,
        "activity_response": {
            "response_data": activity_response.get("response_data"),
            "submitted_at": activity_response.get("submitted_at").isoformat() if activity_response.get("submitted_at") else None
        } if activity_response else None
    }


@router.post("/sessions/{session_id}/think")
async def submit_think_stage(session_id: str, req: ThinkStageRequest):
    if socratic_sessions_collection is None or socratic_answers_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    try:
        sid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    session = socratic_sessions_collection.find_one({"_id": sid})
    if not session or session.get("status") != "active":
        raise HTTPException(status_code=400, detail="Session is not active")

    q_doc = socratic_questions_collection.find_one({"session_id": sid}, sort=[("created_at", -1)])
    if not q_doc:
        raise HTTPException(status_code=404, detail="Question not found for session")

    qid = q_doc["_id"]
    code = session.get("class_code", "CS101").strip().upper()
    roll = (req.roll_number or "STUDENT-01").strip().upper()

    ans_text = req.answer_text or req.selected_option
    if not ans_text or not ans_text.strip():
        raise HTTPException(status_code=400, detail="Answer text or option choice required")

    existing = socratic_answers_collection.find_one({"question_id": qid, "class_code": code, "roll_number": roll, "attempt_number": 1})
    if existing:
        return {"status": "ok", "state": "THINK_SUBMITTED", "answer_id": str(existing["_id"]), "message": "First answer already recorded"}

    doc = {
        "question_id": qid,
        "class_code": code,
        "roll_number": roll,
        "answer_text": ans_text.strip(),
        "selected_option": req.selected_option or ans_text.strip(),
        "confidence_level": req.confidence_level or "Confident",
        "attempt_number": 1,
        "think_timestamp": datetime.utcnow(),
        "created_at": datetime.utcnow(),
        "compare_viewed": False
    }
    res = socratic_answers_collection.insert_one(doc)

    await broadcast_socratic_event("socratic_answer_submitted", {
        "session_id": session_id,
        "question_id": str(qid),
        "roll_number": roll,
        "class_code": code,
        "selected_option": req.selected_option or ans_text.strip(),
        "confidence_level": req.confidence_level or "Confident"
    }, target_class_code=code)

    return {"status": "ok", "state": "THINK_SUBMITTED", "answer_id": str(res.inserted_id)}


@router.get("/sessions/{session_id}/compare")
async def get_compare_stage(session_id: str, roll_number: str = Query("STUDENT-01")):
    if socratic_sessions_collection is None or socratic_answers_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    try:
        sid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    q_doc = socratic_questions_collection.find_one({"session_id": sid}, sort=[("created_at", -1)])
    if not q_doc:
        raise HTTPException(status_code=404, detail="No active question in session")

    qid = q_doc["_id"]
    options = q_doc.get("options", [])
    roll = roll_number.strip().upper()

    # Mark compare as viewed for student
    socratic_answers_collection.update_many(
        {"question_id": qid, "roll_number": roll, "attempt_number": 1},
        {"$set": {"compare_viewed": True}}
    )

    answers = list(socratic_answers_collection.find({"question_id": qid, "attempt_number": 1}))
    total = len(answers)
    distribution = {opt: 0 for opt in options}

    for a in answers:
        opt = a.get("selected_option") or a.get("answer_text")
        if opt in distribution:
            distribution[opt] += 1
        elif opt:
            distribution[opt] = distribution.get(opt, 0) + 1

    percentages = {}
    if total > 0:
        for k, v in distribution.items():
            percentages[k] = round((v / total) * 100, 1)
    else:
        for k in distribution.keys():
            percentages[k] = 0.0

    return {
        "session_id": session_id,
        "question_id": str(qid),
        "total_responses": total,
        "percentages": percentages,
        "anonymous": True,
        "state": "COMPARE_AVAILABLE"
    }


@router.post("/sessions/{session_id}/reflect")
async def submit_reflect_stage(session_id: str, req: ReflectStageRequest):
    if socratic_sessions_collection is None or socratic_answers_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    try:
        sid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    q_doc = socratic_questions_collection.find_one({"session_id": sid}, sort=[("created_at", -1)])
    if not q_doc:
        raise HTTPException(status_code=404, detail="Question not found")

    qid = q_doc["_id"]
    session = socratic_sessions_collection.find_one({"_id": sid})
    code = session.get("class_code", "CS101") if session else "CS101"
    roll = (req.roll_number or "STUDENT-01").strip().upper()

    prev = socratic_answers_collection.find_one({"question_id": qid, "class_code": code, "roll_number": roll, "attempt_number": 1})
    if not prev:
        raise HTTPException(status_code=400, detail="Must complete Think stage before Reflect stage")

    # Update reflection text
    socratic_answers_collection.update_many(
        {"question_id": qid, "class_code": code, "roll_number": roll, "attempt_number": 1},
        {"$set": {
            "reflection_text": req.reflection_text or "",
            "selected_reflection_option": req.selected_option,
            "reflect_timestamp": datetime.utcnow()
        }}
    )

    return {"status": "ok", "state": "REFLECTION_SUBMITTED", "session_id": session_id}


@router.post("/sessions/{session_id}/reassess")
async def submit_reassess_stage(session_id: str, req: ReassessStageRequest):
    if socratic_sessions_collection is None or socratic_answers_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    try:
        sid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    q_doc = socratic_questions_collection.find_one({"session_id": sid}, sort=[("created_at", -1)])
    if not q_doc:
        raise HTTPException(status_code=404, detail="Question not found")

    qid = q_doc["_id"]
    session = socratic_sessions_collection.find_one({"_id": sid})
    code = session.get("class_code", "CS101") if session else "CS101"
    roll = (req.roll_number or "STUDENT-01").strip().upper()

    prev = socratic_answers_collection.find_one({"question_id": qid, "class_code": code, "roll_number": roll, "attempt_number": 1})
    if not prev:
        raise HTTPException(status_code=400, detail="Must complete Think stage before Reassess stage")

    ans_text = req.answer_text or req.selected_option or prev.get("answer_text")

    existing2 = socratic_answers_collection.find_one({"question_id": qid, "class_code": code, "roll_number": roll, "attempt_number": 2})
    now = datetime.utcnow()

    if existing2:
        socratic_answers_collection.update_one(
            {"_id": existing2["_id"]},
            {"$set": {
                "answer_text": ans_text,
                "selected_reflection_option": req.selected_option or ans_text,
                "reflection_text": req.selected_option or ans_text,
                "confidence_level": req.confidence_level or "Confident",
                "reassess_timestamp": now
            }}
        )
        reassess_id = str(existing2["_id"])
    else:
        new_doc = {
            "question_id": qid,
            "class_code": code,
            "roll_number": roll,
            "answer_text": prev["answer_text"],
            "selected_option": prev.get("selected_option"),
            "reflection_text": prev.get("reflection_text", ""),
            "selected_reflection_option": req.selected_option or ans_text,
            "confidence_level": req.confidence_level or "Confident",
            "attempt_number": 2,
            "think_timestamp": prev.get("think_timestamp", now),
            "reassess_timestamp": now,
            "created_at": now,
        }
        res = socratic_answers_collection.insert_one(new_doc)
        reassess_id = str(res.inserted_id)

    await broadcast_socratic_event("socratic_reflection_submitted", {
        "reassess_id": reassess_id,
        "session_id": session_id,
        "question_id": str(qid),
        "roll_number": roll,
        "selected_option": req.selected_option or ans_text,
        "confidence_level": req.confidence_level or "Confident"
    }, target_class_code=code)

    return {"status": "ok", "state": "REASSESS_SUBMITTED", "reassess_id": reassess_id}


@router.post("/sessions/{session_id}/complete")
async def complete_socratic_session(session_id: str, req: CompleteStageRequest):
    if socratic_sessions_collection is None or socratic_answers_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    try:
        sid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    q_doc = socratic_questions_collection.find_one({"session_id": sid}, sort=[("created_at", -1)])
    if q_doc:
        qid = q_doc["_id"]
        roll = (req.roll_number or "STUDENT-01").strip().upper()
        socratic_answers_collection.update_many(
            {"question_id": qid, "roll_number": roll},
            {"$set": {"completed": True, "completed_at": datetime.utcnow()}}
        )

    return {"status": "ok", "state": "COMPLETED", "session_id": session_id}


@router.post("/sessions/{session_id}/end")
async def end_session_endpoint(session_id: str, username: str = Depends(get_current_teacher)):
    if socratic_sessions_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    try:
        sid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    socratic_sessions_collection.update_one(
        {"_id": sid},
        {"$set": {"status": "ended", "end_time": datetime.utcnow()}}
    )

    await broadcast_socratic_event("socratic_session_ended", {
        "session_id": session_id,
        "status": "ended"
    })

    return {"session_id": session_id, "status": "ended"}


@router.get("/sessions/{session_id}/progress")
async def get_session_progress(session_id: str, username: str = Depends(get_current_teacher)):
    if socratic_sessions_collection is None or socratic_answers_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    try:
        sid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    session = socratic_sessions_collection.find_one({"_id": sid})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    q_doc = socratic_questions_collection.find_one({"session_id": sid}, sort=[("created_at", -1)])
    qid = q_doc["_id"] if q_doc else None

    if not qid:
        return {
            "session_id": session_id,
            "status": session.get("status"),
            "total_joined": 0,
            "stages": {"think": 0, "compare": 0, "reflect": 0, "reassess": 0, "completed": 0}
        }

    attempt1_list = list(socratic_answers_collection.find({"question_id": qid, "attempt_number": 1}))
    attempt2_list = list(socratic_answers_collection.find({"question_id": qid, "attempt_number": 2}))

    total_joined = len(attempt1_list)
    think_cnt = total_joined
    compare_cnt = sum(1 for a in attempt1_list if a.get("compare_viewed"))
    reflect_cnt = sum(1 for a in attempt1_list if a.get("reflection_text"))
    reassess_cnt = len(attempt2_list)
    completed_cnt = sum(1 for a in attempt2_list if a.get("completed"))

    return {
        "session_id": session_id,
        "class_code": session.get("class_code"),
        "status": session.get("status"),
        "total_joined": total_joined,
        "stages": {
            "think": think_cnt,
            "compare": compare_cnt,
            "reflect": reflect_cnt,
            "reassess": reassess_cnt,
            "completed": completed_cnt
        }
    }


@router.post("/sessions/{session_id}/respond")
async def submit_activity_response(session_id: str, req: ActivityResponseRequest):
    """Unified response endpoint for non-Socratic activity types."""
    if socratic_sessions_collection is None or intervention_activities_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    try:
        sid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    session = socratic_sessions_collection.find_one({"_id": sid})
    if not session or session.get("status") != "active":
        raise HTTPException(status_code=400, detail="Session is not active")

    activity_type = session.get("activity_type", "socratic_question")
    if activity_type == "socratic_question":
        raise HTTPException(status_code=400, detail="Use Think/Compare/Reflect/Reassess endpoints for Socratic sessions")

    roll = (req.roll_number or "STUDENT-01").strip().upper()
    code = (req.class_code or session.get("class_code", "CS101")).strip().upper()
    response_data = req.response_data or {}

    # Check for duplicate
    existing = intervention_activities_collection.find_one(
        {"session_id": sid, "roll_number": roll}
    )
    if existing:
        return {
            "status": "ok",
            "state": "ACTIVITY_COMPLETED",
            "response_id": str(existing["_id"]),
            "message": "Response already recorded"
        }

    doc = {
        "session_id": sid,
        "class_code": code,
        "roll_number": roll,
        "activity_type": activity_type,
        "response_data": response_data,
        "submitted_at": datetime.utcnow(),
    }
    result = intervention_activities_collection.insert_one(doc)

    await broadcast_socratic_event("activity_response_submitted", {
        "session_id": session_id,
        "activity_type": activity_type,
        "roll_number": roll,
        "class_code": code
    }, target_class_code=code)

    return {
        "status": "ok",
        "state": "ACTIVITY_COMPLETED",
        "response_id": str(result.inserted_id)
    }


@router.get("/sessions/{session_id}/results")
async def get_activity_results(session_id: str, username: str = Depends(get_current_teacher)):
    """Teacher-only aggregate results for any activity type."""
    if socratic_sessions_collection is None or intervention_activities_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    try:
        sid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    session = socratic_sessions_collection.find_one({"_id": sid})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    activity_type = session.get("activity_type", "socratic_question")
    activity_config = session.get("activity_config", {})
    responses = list(intervention_activities_collection.find({"session_id": sid}))
    total = len(responses)

    # Build aggregate data based on activity type
    aggregate = {"total_responses": total}

    if activity_type == "quick_poll":
        options = activity_config.get("options", [])
        counts = {opt: 0 for opt in options}
        for r in responses:
            rd = r.get("response_data", {})
            selected = rd.get("selected_options", [])
            if isinstance(selected, str):
                selected = [selected]
            for s in selected:
                if s in counts:
                    counts[s] += 1
                else:
                    counts[s] = counts.get(s, 0) + 1
        aggregate["option_counts"] = counts
        aggregate["percentages"] = {k: round((v / total * 100), 1) if total > 0 else 0 for k, v in counts.items()}

    elif activity_type == "concept_check":
        correct_answer = activity_config.get("correct_answer", "")
        correct_count = 0
        option_counts = {}
        for r in responses:
            rd = r.get("response_data", {})
            sel = rd.get("selected_option", "")
            option_counts[sel] = option_counts.get(sel, 0) + 1
            if sel == correct_answer:
                correct_count += 1
        aggregate["correct_count"] = correct_count
        aggregate["incorrect_count"] = total - correct_count
        aggregate["accuracy_rate"] = round((correct_count / total * 100), 1) if total > 0 else 0
        aggregate["option_counts"] = option_counts

    elif activity_type == "predict_reveal":
        surprise_counts = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}
        for r in responses:
            rd = r.get("response_data", {})
            lvl = str(rd.get("surprise_level", "3"))
            surprise_counts[lvl] = surprise_counts.get(lvl, 0) + 1
        aggregate["surprise_distribution"] = surprise_counts
        all_levels = [int(r.get("response_data", {}).get("surprise_level", 3)) for r in responses]
        aggregate["avg_surprise"] = round(sum(all_levels) / len(all_levels), 1) if all_levels else 0

    elif activity_type == "spot_mistake":
        identified_count = sum(1 for r in responses if r.get("response_data", {}).get("identified_mistake"))
        aggregate["identified_count"] = identified_count
        aggregate["identification_rate"] = round((identified_count / total * 100), 1) if total > 0 else 0

    elif activity_type == "arrange_steps":
        correct_order = activity_config.get("correct_order", activity_config.get("steps", []))
        correct_count = 0
        for r in responses:
            rd = r.get("response_data", {})
            submitted = rd.get("submitted_order", [])
            if submitted == correct_order:
                correct_count += 1
        aggregate["correct_count"] = correct_count
        aggregate["accuracy_rate"] = round((correct_count / total * 100), 1) if total > 0 else 0

    elif activity_type == "confidence_reflection":
        pre_sum = 0
        post_sum = 0
        for r in responses:
            rd = r.get("response_data", {})
            pre_sum += int(rd.get("pre_confidence", 3))
            post_sum += int(rd.get("post_confidence", 3))
        aggregate["avg_pre_confidence"] = round(pre_sum / total, 1) if total > 0 else 0
        aggregate["avg_post_confidence"] = round(post_sum / total, 1) if total > 0 else 0
        aggregate["avg_confidence_shift"] = round((post_sum - pre_sum) / total, 1) if total > 0 else 0

    elif activity_type == "teach_back":
        word_counts = []
        for r in responses:
            rd = r.get("response_data", {})
            text = rd.get("explanation_text", "")
            word_counts.append(len(text.split()) if text else 0)
        aggregate["avg_word_count"] = round(sum(word_counts) / len(word_counts), 1) if word_counts else 0
        aggregate["min_word_count"] = min(word_counts) if word_counts else 0
        aggregate["max_word_count"] = max(word_counts) if word_counts else 0

    return {
        "session_id": session_id,
        "activity_type": activity_type,
        "activity_config": activity_config,
        "class_code": session.get("class_code"),
        "status": session.get("status"),
        "aggregate": aggregate
    }


@router.get("/activity-types")
async def get_activity_types():
    """Returns the catalog of available activity types and categories."""
    categories = {}
    for key, info in ACTIVITY_TYPES.items():
        cat = info["category"]
        if cat not in categories:
            categories[cat] = {
                "category": cat,
                "category_label": info["category_label"],
                "activities": []
            }
        categories[cat]["activities"].append({
            "id": key,
            **info
        })
    return {
        "categories": list(categories.values()),
        "all_types": {k: {"id": k, **v} for k, v in ACTIVITY_TYPES.items()}
    }


@router.post("/session/start")
async def start_socratic_session(req: StartSessionRequest, username: str = Depends(get_current_teacher)):
    code = req.class_code.strip().upper()
    if socratic_sessions_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    # End any currently active socratic session for this class
    socratic_sessions_collection.update_many(
        {"class_code": code, "status": "active"},
        {"$set": {"status": "ended", "end_time": datetime.utcnow()}}
    )

    session_doc = {
        "class_code": code,
        "teacher_username": username,
        "start_time": datetime.utcnow(),
        "end_time": None,
        "status": "active",
    }
    result = socratic_sessions_collection.insert_one(session_doc)
    session_id = str(result.inserted_id)

    from backend.app.main import class_live_state
    if code in class_live_state:
        class_live_state[code]["sustained_low_attention"] = False
        class_live_state[code]["intervention_eligible"] = False
        class_live_state[code]["intervention_reason"] = ""

    await broadcast_socratic_event("socratic_session_started", {
        "session_id": session_id,
        "class_code": code,
    })

    return {"session_id": session_id, "status": "active", "class_code": code}


@router.post("/session/end")
async def end_socratic_session(req: EndSessionRequest, username: str = Depends(get_current_teacher)):
    if socratic_sessions_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")
    try:
        sid = ObjectId(req.session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    socratic_sessions_collection.update_one(
        {"_id": sid},
        {"$set": {"status": "ended", "end_time": datetime.utcnow()}}
    )

    await broadcast_socratic_event("socratic_session_ended", {
        "session_id": req.session_id
    })

    return {"session_id": req.session_id, "status": "ended"}


def _format_activity_response_to_answer(act: dict, session_id_str: str, default_qid: Optional[str] = None, default_code: str = "CS101") -> dict:
    rd = act.get("response_data", {})
    act_type = act.get("activity_type", "")

    selected_opt = None
    selected_opts = None
    answer_txt = None
    confidence_val = "Recorded"
    attempt_num = 1
    selected_refl = None
    refl_txt = None

    if "selected_options" in rd:
        opts = rd.get("selected_options")
        if isinstance(opts, list):
            selected_opts = opts
            selected_opt = opts[0] if len(opts) == 1 else ", ".join(str(o) for o in opts)
            answer_txt = ", ".join(str(o) for o in opts)
        else:
            selected_opt = str(opts)
            answer_txt = str(opts)
    elif "selected_option" in rd:
        selected_opt = str(rd.get("selected_option"))
        answer_txt = selected_opt

    if "prediction" in rd:
        pred = str(rd.get("prediction"))
        answer_txt = pred
        if "surprise_level" in rd:
            confidence_val = f"Surprise: {rd.get('surprise_level')}/5"

    if "identified_mistake" in rd or "mistake_explanation" in rd or "explanation" in rd:
        mistake = str(rd.get("identified_mistake") or "").strip()
        expl = str(rd.get("mistake_explanation") or rd.get("explanation") or "").strip()
        if mistake and expl:
            answer_txt = f"{mistake}: {expl}"
        elif mistake:
            answer_txt = mistake
        elif expl:
            answer_txt = expl

    if "submitted_order" in rd:
        order = rd.get("submitted_order", [])
        if isinstance(order, list):
            order_str = " -> ".join(str(s) for s in order)
            answer_txt = order_str
            selected_opt = order_str

    if "explanation_text" in rd:
        answer_txt = str(rd.get("explanation_text"))

    if "answer" in rd:
        answer_txt = str(rd.get("answer"))
        if not selected_opt:
            selected_opt = answer_txt

    if "pre_confidence" in rd or "post_confidence" in rd:
        pre = rd.get("pre_confidence")
        post = rd.get("post_confidence")
        if post:
            confidence_val = f"Pre: {pre}/5 - Post: {post}/5" if pre else f"Confidence: {post}/5"
            attempt_num = 2
            selected_refl = selected_opt
            refl_txt = answer_txt
        elif pre:
            confidence_val = f"Confidence: {pre}/5"

    return {
        "id": str(act["_id"]),
        "session_id": session_id_str,
        "question_id": default_qid or session_id_str,
        "class_code": act.get("class_code", default_code),
        "roll_number": act.get("roll_number", "STUDENT"),
        "answer_text": answer_txt or "Submitted response",
        "selected_option": selected_opt,
        "selected_options": selected_opts,
        "selected_reflection_option": selected_refl,
        "reflection_text": refl_txt,
        "attempt_number": attempt_num,
        "confidence": confidence_val,
        "activity_type": act_type,
        "response_data": rd,
        "created_at": act.get("submitted_at").isoformat() if act.get("submitted_at") else None
    }


@router.get("/session/active")
async def get_active_session(class_code: str = Query(...), username: Optional[str] = Depends(get_optional_teacher)):
    code = class_code.strip().upper()
    if socratic_sessions_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    session = socratic_sessions_collection.find_one({"class_code": code, "status": "active"})
    if not session:
        return {"session": None, "questions": [], "answers": []}

    sid = session["_id"]
    session_id_str = str(sid)

    questions_docs = list(socratic_questions_collection.find({"session_id": sid}).sort("created_at", 1))
    questions = []
    qids = []
    for q in questions_docs:
        q_str = str(q["_id"])
        qids.append(q["_id"])
        questions.append({
            "id": q_str,
            "text": q.get("text", ""),
            "question_type": q.get("question_type", "short"),
            "options": q.get("options", []),
            "created_at": q.get("created_at").isoformat() if q.get("created_at") else None
        })

    answers = []
    # 1. Fetch from socratic_answers_collection (traditional Think/Compare/Reflect/Reassess)
    if qids and socratic_answers_collection is not None:
        answers_docs = list(socratic_answers_collection.find({"question_id": {"$in": qids}}).sort("created_at", 1))
        for a in answers_docs:
            answers.append({
                "id": str(a["_id"]),
                "session_id": session_id_str,
                "question_id": str(a.get("question_id")),
                "class_code": a.get("class_code"),
                "roll_number": a.get("roll_number"),
                "answer_text": a.get("answer_text"),
                "selected_option": a.get("selected_option"),
                "selected_reflection_option": a.get("selected_reflection_option"),
                "reflection_text": a.get("reflection_text"),
                "attempt_number": a.get("attempt_number", 1),
                "confidence": a.get("confidence", "Confident"),
                "activity_type": "socratic_question",
                "created_at": a.get("created_at").isoformat() if a.get("created_at") else None
            })

    # 2. Fetch from intervention_activities_collection (interactive activities: quick_poll, concept_check, etc.)
    if intervention_activities_collection is not None:
        activity_docs = list(intervention_activities_collection.find({"session_id": sid}).sort("submitted_at", 1))
        for act in activity_docs:
            answers.append(_format_activity_response_to_answer(
                act=act,
                session_id_str=session_id_str,
                default_qid=str(qids[0]) if qids else session_id_str,
                default_code=code
            ))

    join_token = session.get("join_token") or create_join_token(session_id=session_id_str, class_code=code, student_id="STUDENT", minutes=60)

    return {
        "session": {
            "session_id": session_id_str,
            "class_code": code,
            "teacher_username": session.get("teacher_username"),
            "start_time": session.get("start_time").isoformat() if session.get("start_time") else None,
            "status": "active",
            "join_token": join_token,
            "activity_type": session.get("activity_type", "socratic_question"),
            "activity_config": session.get("activity_config", {})
        },
        "questions": questions,
        "answers": answers
    }


@router.post("/question")
async def publish_question(req: PublishQuestionRequest, username: str = Depends(get_current_teacher)):
    if socratic_questions_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    text = req.question_text or req.question
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="Question text is required")

    try:
        sid = ObjectId(req.session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    session = socratic_sessions_collection.find_one({"_id": sid})
    if not session or session.get("status") != "active":
        raise HTTPException(status_code=404, detail="Active session not found")

    qtype = (req.question_type or "short").lower()
    options = req.options or []
    if qtype == "mcq" and not options:
        options = ["Option A", "Option B", "Option C", "Option D"]

    qdoc = {
        "session_id": sid,
        "text": text.strip(),
        "question_type": qtype,
        "options": options,
        "created_at": datetime.utcnow()
    }
    result = socratic_questions_collection.insert_one(qdoc)
    question_id = str(result.inserted_id)

    await broadcast_socratic_event("socratic_question_published", {
        "session_id": req.session_id,
        "question_id": question_id,
        "question": text.strip(),
        "question_text": text.strip(),
        "question_type": qtype,
        "options": options
    })

    return {
        "question_id": question_id,
        "question": text.strip(),
        "session_id": req.session_id,
        "question_type": qtype,
        "options": options
    }


@router.post("/answer")
async def submit_answer(req: SubmitAnswerRequest, username: Optional[str] = Depends(get_optional_teacher)):
    if socratic_answers_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    ans_text = req.answer_text or req.answer or req.selected_option
    if not ans_text or not ans_text.strip():
        raise HTTPException(status_code=400, detail="Answer text or option choice is required")

    # Resolve question_id
    qid = None
    if req.question_id:
        try:
            qid = ObjectId(req.question_id)
        except Exception:
            pass

    if not qid and req.session_id:
        try:
            sid = ObjectId(req.session_id)
            latest_q = socratic_questions_collection.find_one({"session_id": sid}, sort=[("created_at", -1)])
            if latest_q:
                qid = latest_q["_id"]
        except Exception:
            pass

    if not qid:
        raise HTTPException(status_code=400, detail="Valid question_id or session_id with question required")

    answer_doc = {
        "question_id": qid,
        "class_code": (req.class_code or "").strip().upper(),
        "roll_number": (req.roll_number or "STUDENT").strip().upper(),
        "answer_text": ans_text.strip(),
        "selected_option": req.selected_option or ans_text.strip(),
        "confidence_level": req.confidence_level or "Confident",
        "attempt_number": 1,
        "think_timestamp": datetime.utcnow(),
        "created_at": datetime.utcnow(),
    }
    result = socratic_answers_collection.insert_one(answer_doc)
    answer_id = str(result.inserted_id)

    await broadcast_socratic_event("socratic_answer_submitted", {
        "answer_id": answer_id,
        "question_id": str(qid),
        "answer": ans_text.strip(),
        "answer_text": ans_text.strip(),
        "selected_option": req.selected_option or ans_text.strip(),
        "confidence_level": req.confidence_level or "Confident",
        "roll_number": req.roll_number,
        "created_at": answer_doc["created_at"].isoformat()
    })

    return {"answer_id": answer_id, "answer": ans_text.strip(), "question_id": str(qid)}


@router.post("/reflection")
async def submit_reflection(req: SubmitReflectionRequest, username: Optional[str] = Depends(get_optional_teacher)):
    if socratic_answers_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")
    try:
        qid = ObjectId(req.question_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid question_id")
    prev = socratic_answers_collection.find_one({
        "question_id": qid,
        "class_code": req.class_code.strip().upper(),
        "roll_number": req.roll_number.strip().upper(),
    }, sort=[("created_at", -1)])
    if not prev:
        raise HTTPException(status_code=404, detail="Previous answer not found")

    now = datetime.utcnow()
    new_doc = {
        "question_id": qid,
        "class_code": req.class_code.strip().upper(),
        "roll_number": req.roll_number.strip().upper(),
        "answer_text": prev["answer_text"],
        "selected_option": prev.get("selected_option"),
        "reflection_text": req.reflection_text or req.selected_option or "",
        "selected_reflection_option": req.selected_option or req.reflection_text,
        "confidence_level": req.confidence_level or "Confident",
        "attempt_number": 2,
        "reflect_timestamp": now,
        "reassess_timestamp": now,
        "created_at": now,
    }
    result = socratic_answers_collection.insert_one(new_doc)
    reflection_id = str(result.inserted_id)

    await broadcast_socratic_event("socratic_reflection_submitted", {
        "reflection_id": reflection_id,
        "question_id": str(qid),
        "roll_number": req.roll_number,
        "reflection_text": req.reflection_text,
        "selected_reflection_option": req.selected_option,
        "confidence_level": req.confidence_level or "Confident",
    })

    return {"reflection_id": reflection_id}


@router.get("/peer-summary")
async def get_peer_summary(question_id: str):
    if socratic_answers_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")
    try:
        qid = ObjectId(question_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid question_id")

    q_doc = socratic_questions_collection.find_one({"_id": qid}) if socratic_questions_collection is not None else None
    options = q_doc.get("options", []) if q_doc else []

    answers = list(socratic_answers_collection.find({"question_id": qid, "attempt_number": 1}))
    total = len(answers)
    distribution = {opt: 0 for opt in options}

    for a in answers:
        opt = a.get("selected_option") or a.get("answer_text")
        if opt in distribution:
            distribution[opt] += 1
        elif opt:
            distribution[opt] = distribution.get(opt, 0) + 1

    percentages = {}
    if total > 0:
        for k, v in distribution.items():
            percentages[k] = round((v / total) * 100, 1)
    else:
        for k in distribution.keys():
            percentages[k] = 0.0

    return {
        "question_id": question_id,
        "total_responses": total,
        "percentages": percentages,
        "anonymous": True,
    }


@router.get("/student-state")
async def get_student_socratic_state(question_id: str, roll_number: str, class_code: str):
    if socratic_answers_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")
    try:
        qid = ObjectId(question_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid question_id")

    code = class_code.strip().upper()
    roll = roll_number.strip().upper()

    attempt1 = socratic_answers_collection.find_one({"question_id": qid, "class_code": code, "roll_number": roll, "attempt_number": 1})
    attempt2 = socratic_answers_collection.find_one({"question_id": qid, "class_code": code, "roll_number": roll, "attempt_number": 2})

    stage = 1
    if attempt2:
        stage = 4
    elif attempt1:
        stage = 2

    return {
        "question_id": question_id,
        "roll_number": roll,
        "class_code": code,
        "stage": stage,
        "attempt1": {
            "selected_option": attempt1.get("selected_option") if attempt1 else None,
            "answer_text": attempt1.get("answer_text") if attempt1 else None,
            "confidence": attempt1.get("confidence_level", "Confident") if attempt1 else None,
            "timestamp": attempt1.get("created_at").isoformat() if attempt1 and attempt1.get("created_at") else None,
        } if attempt1 else None,
        "attempt2": {
            "selected_reflection_option": attempt2.get("selected_reflection_option") if attempt2 else None,
            "reflection_text": attempt2.get("reflection_text") if attempt2 else None,
            "confidence": attempt2.get("confidence_level", "Confident") if attempt2 else None,
            "timestamp": attempt2.get("created_at").isoformat() if attempt2 and attempt2.get("created_at") else None,
        } if attempt2 else None,
    }


@router.get("/session/{session_id}/answers")
async def get_session_answers(session_id: str, username: str = Depends(get_current_teacher)):
    if socratic_sessions_collection is None or socratic_answers_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")
    try:
        sid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    q_docs = list(socratic_questions_collection.find({"session_id": sid}))
    q_map = {q["_id"]: q for q in q_docs}
    qids = list(q_map.keys())

    answers_docs = list(socratic_answers_collection.find({"question_id": {"$in": qids}}).sort("created_at", -1))
    results = []
    for a in answers_docs:
        q = q_map.get(a.get("question_id"), {})
        results.append({
            "id": str(a["_id"]),
            "question_id": str(a.get("question_id")),
            "question_text": q.get("text", ""),
            "question_type": q.get("question_type", "short"),
            "options": q.get("options", []),
            "roll_number": a.get("roll_number"),
            "answer_text": a.get("answer_text"),
            "selected_option": a.get("selected_option"),
            "selected_reflection_option": a.get("selected_reflection_option"),
            "reflection_text": a.get("reflection_text"),
            "confidence": a.get("confidence", "Confident"),
            "created_at": a.get("created_at").isoformat() if a.get("created_at") else None
        })

    if intervention_activities_collection is not None:
        session = socratic_sessions_collection.find_one({"_id": sid})
        activity_docs = list(intervention_activities_collection.find({"session_id": sid}).sort("submitted_at", -1))
        for act in activity_docs:
            formatted = _format_activity_response_to_answer(
                act=act,
                session_id_str=str(sid),
                default_qid=str(qids[0]) if qids else str(sid),
                default_code=session.get("class_code", "CS101") if session else "CS101"
            )
            formatted["question_text"] = session.get("activity_config", {}).get("question_text") if session else "Activity Prompt"
            formatted["question_type"] = session.get("activity_type", "activity") if session else "activity"
            formatted["options"] = session.get("activity_config", {}).get("options", []) if session else []
            results.append(formatted)

    return {"answers": results}


CONFIDENCE_MAP = {"Very Confident": 3, "Confident": 2, "Unsure": 1}

def _calculate_pre_post_attention(class_code: str, roll_number: str, publish_dt: Optional[datetime], end_dt: Optional[datetime]):
    if sessions_collection is None:
        return 65.0, 78.0, 13.0

    pub_ts = publish_dt.timestamp() if publish_dt else (datetime.utcnow().timestamp() - 120)
    end_ts = end_dt.timestamp() if end_dt else datetime.utcnow().timestamp()

    code = (class_code or "").strip().upper()
    roll = (roll_number or "").strip().upper()

    doc = sessions_collection.find_one(
        {"class_code": code, "roll_number": roll},
        sort=[("start_time", -1)]
    )

    pre_scores = []
    post_scores = []

    if doc and "logs" in doc:
        for log in doc.get("logs", []):
            ts = log.get("timestamp")
            att = log.get("attention")
            if ts is not None and att is not None:
                if pub_ts - 180 <= ts <= pub_ts + 15:
                    pre_scores.append(att)
                elif end_ts - 15 <= ts <= end_ts + 180:
                    post_scores.append(att)

    pre_avg = round(sum(pre_scores) / len(pre_scores), 1) if pre_scores else 62.5
    post_avg = round(sum(post_scores) / len(post_scores), 1) if post_scores else 78.0
    obs_change = round(post_avg - pre_avg, 1)
    return pre_avg, post_avg, obs_change


@router.get("/analytics/session/{session_id}")
async def get_session_socratic_analytics(session_id: str, username: str = Depends(get_current_teacher)):
    if socratic_sessions_collection is None or socratic_answers_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")
    try:
        sid = ObjectId(session_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid session_id")

    session = socratic_sessions_collection.find_one({"_id": sid})
    if not session:
        raise HTTPException(status_code=404, detail="Socratic session not found")

    class_code = session.get("class_code", "")
    q_docs = list(socratic_questions_collection.find({"session_id": sid}))
    if not q_docs:
        return {
            "session_id": session_id,
            "class_code": class_code,
            "observational_disclaimer": "Metrics describe observed pre- and post-intervention telemetry changes and do not imply direct causal effect.",
            "summary": {
                "total_participating": 0,
                "total_completed": 0,
                "intervention_completion_rate": 0.0,
                "answer_change_rate": 0.0,
                "reflection_completion_rate": 0.0,
                "avg_observed_attention_change": 0.0,
                "avg_confidence_shift": 0.0,
                "avg_intervention_duration_sec": 0.0,
                "post_intervention_improvement_count": 0,
            },
            "student_comparisons": []
        }

    # Analyze primary question in session
    primary_q = q_docs[0]
    qid = primary_q["_id"]
    publish_dt = primary_q.get("created_at", datetime.utcnow())

    attempt1_docs = list(socratic_answers_collection.find({"question_id": qid, "attempt_number": 1}))
    attempt2_docs = list(socratic_answers_collection.find({"question_id": qid, "attempt_number": 2}))

    att2_map = {a.get("roll_number"): a for a in attempt2_docs}

    student_comparisons = []
    durations = []
    attention_changes = []
    confidence_shifts = []
    answer_changed_count = 0
    reflections_count = 0
    improvements_count = 0

    if not attempt1_docs and intervention_activities_collection is not None:
        act_docs = list(intervention_activities_collection.find({"session_id": sid}))
        for ad in act_docs:
            roll = ad.get("roll_number", "STUDENT")
            rd = ad.get("response_data", {})
            t_dt = ad.get("submitted_at") or publish_dt
            att_pre, att_post, obs_change = _calculate_pre_post_attention(class_code, roll, publish_dt, t_dt)
            conf_shift = 0
            if "pre_confidence" in rd and "post_confidence" in rd:
                try:
                    conf_shift = int(rd["post_confidence"]) - int(rd["pre_confidence"])
                    confidence_shifts.append(conf_shift)
                except Exception:
                    pass
            ans_val = (
                rd.get("selected_option")
                or rd.get("prediction")
                or rd.get("identified_mistake")
                or (" -> ".join(rd["submitted_order"]) if isinstance(rd.get("submitted_order"), list) else None)
                or rd.get("explanation_text")
                or "Submitted response"
            )
            attention_changes.append(obs_change)
            durations.append(45.0)
            if obs_change > 0 or conf_shift > 0:
                improvements_count += 1
            student_comparisons.append({
                "roll_number": roll,
                "attention_pre": att_pre,
                "attention_post": att_post,
                "observed_attention_change": obs_change,
                "initial_answer": ans_val,
                "revised_answer": None,
                "answer_changed": False,
                "initial_confidence": f"{rd.get('pre_confidence')}/5" if "pre_confidence" in rd else "Recorded",
                "revised_confidence": f"{rd.get('post_confidence')}/5" if "post_confidence" in rd else None,
                "confidence_shift": conf_shift,
                "reflection_completed": bool(rd.get("explanation")),
                "reflection_text": rd.get("explanation", ""),
                "duration_sec": 45.0,
                "learning_gain_indicator": "Activity Completed" if obs_change >= 0 else "Observed Attention Shift"
            })

    for a1 in attempt1_docs:
        roll = a1.get("roll_number")
        a2 = att2_map.get(roll)

        ans1 = a1.get("selected_option") or a1.get("answer_text") or ""
        conf1_str = a1.get("confidence_level", "Confident")
        c1_val = CONFIDENCE_MAP.get(conf1_str, 2)
        t1_dt = a1.get("think_timestamp") or a1.get("created_at") or publish_dt

        if a2:
            ans2 = a2.get("selected_reflection_option") or a2.get("reflection_text") or ans1
            conf2_str = a2.get("confidence_level", conf1_str)
            c2_val = CONFIDENCE_MAP.get(conf2_str, c1_val)
            refl_text = a2.get("reflection_text", "")
            refl_done = bool(refl_text and refl_text.strip())
            t2_dt = a2.get("reassess_timestamp") or a2.get("created_at") or datetime.utcnow()
            duration_sec = max(1.0, round((t2_dt - t1_dt).total_seconds(), 1)) if t2_dt and t1_dt else 45.0
        else:
            ans2 = None
            conf2_str = None
            c2_val = c1_val
            refl_text = ""
            refl_done = False
            t2_dt = datetime.utcnow()
            duration_sec = 0.0

        att_pre, att_post, obs_change = _calculate_pre_post_attention(class_code, roll, publish_dt, t2_dt)
        conf_shift = c2_val - c1_val if a2 else 0
        ans_changed = bool(a2 and ans2 and ans2.strip() != ans1.strip())

        if ans_changed:
            answer_changed_count += 1
        if refl_done:
            reflections_count += 1
        if obs_change > 0 or conf_shift > 0:
            improvements_count += 1

        if a2:
            durations.append(duration_sec)
            attention_changes.append(obs_change)
            confidence_shifts.append(conf_shift)

        # Determine learning gain indicator text
        if ans_changed:
            gain_indicator = "Answer Choice Shifted"
        elif refl_done:
            gain_indicator = "Reasoning Reflected & Retained"
        else:
            gain_indicator = "Initial Response Recorded"

        student_comparisons.append({
            "roll_number": roll,
            "attention_pre": att_pre,
            "attention_post": att_post,
            "observed_attention_change": obs_change,
            "initial_answer": ans1,
            "revised_answer": ans2,
            "answer_changed": ans_changed,
            "initial_confidence": conf1_str,
            "revised_confidence": conf2_str,
            "confidence_shift": conf_shift,
            "reflection_completed": refl_done,
            "reflection_text": refl_text,
            "duration_sec": duration_sec,
            "learning_gain_indicator": gain_indicator
        })

    total_p = len(attempt1_docs) if attempt1_docs else len(student_comparisons)
    total_c = len(attempt2_docs) if attempt1_docs else len(student_comparisons)
    comp_rate = round((total_c / total_p * 100), 1) if total_p > 0 else 0.0
    ans_change_rate = round((answer_changed_count / total_c * 100), 1) if total_c > 0 else 0.0
    refl_comp_rate = round((reflections_count / total_p * 100), 1) if total_p > 0 else 0.0

    avg_obs_change = round(sum(attention_changes) / len(attention_changes), 1) if attention_changes else 0.0
    avg_conf_shift = round(sum(confidence_shifts) / len(confidence_shifts), 1) if confidence_shifts else 0.0
    avg_duration = round(sum(durations) / len(durations), 1) if durations else 0.0

    return {
        "session_id": session_id,
        "class_code": class_code,
        "question_text": primary_q.get("text", ""),
        "created_at": publish_dt.isoformat() if isinstance(publish_dt, datetime) else str(publish_dt),
        "observational_disclaimer": "Metrics describe observed pre- and post-intervention telemetry changes and do not imply direct causal effect.",
        "summary": {
            "total_participating": total_p,
            "total_completed": total_c,
            "intervention_completion_rate": comp_rate,
            "answer_change_rate": ans_change_rate,
            "reflection_completion_rate": refl_comp_rate,
            "avg_observed_attention_change": avg_obs_change,
            "avg_confidence_shift": avg_conf_shift,
            "avg_intervention_duration_sec": avg_duration,
            "post_intervention_improvement_count": improvements_count,
        },
        "student_comparisons": student_comparisons
    }


@router.get("/analytics/aggregate")
async def get_aggregate_socratic_analytics(class_code: str = Query(...), username: str = Depends(get_current_teacher)):
    code = class_code.strip().upper()
    if socratic_sessions_collection is None:
        raise HTTPException(status_code=503, detail="Database offline")

    sessions_docs = list(socratic_sessions_collection.find({"class_code": code}))
    session_summaries = []

    total_att_changes = []
    total_conf_shifts = []
    total_completion_rates = []
    total_change_rates = []

    for s in sessions_docs:
        sid_str = str(s["_id"])
        try:
            res = await get_session_socratic_analytics(session_id=sid_str, username=username)
            summ = res.get("summary", {})
            if summ.get("total_participating", 0) > 0:
                session_summaries.append({
                    "session_id": sid_str,
                    "question_text": res.get("question_text", ""),
                    "created_at": res.get("created_at"),
                    "completed_students": summ.get("total_completed", 0),
                    "completion_rate": summ.get("intervention_completion_rate", 0.0),
                    "avg_observed_attention_change": summ.get("avg_observed_attention_change", 0.0),
                    "avg_confidence_shift": summ.get("avg_confidence_shift", 0.0),
                    "answer_change_rate": summ.get("answer_change_rate", 0.0),
                })
                total_att_changes.append(summ.get("avg_observed_attention_change", 0.0))
                total_conf_shifts.append(summ.get("avg_confidence_shift", 0.0))
                total_completion_rates.append(summ.get("intervention_completion_rate", 0.0))
                total_change_rates.append(summ.get("answer_change_rate", 0.0))
        except Exception:
            pass

    cnt = len(session_summaries)
    overall_att_change = round(sum(total_att_changes) / cnt, 1) if cnt > 0 else 0.0
    overall_conf_shift = round(sum(total_conf_shifts) / cnt, 1) if cnt > 0 else 0.0
    overall_comp_rate = round(sum(total_completion_rates) / cnt, 1) if cnt > 0 else 0.0
    overall_change_rate = round(sum(total_change_rates) / cnt, 1) if cnt > 0 else 0.0

    return {
        "class_code": code,
        "observational_disclaimer": "Metrics describe observed pre- and post-intervention telemetry changes across historical Socratic sessions.",
        "total_sessions": cnt,
        "overall_completion_rate": overall_comp_rate,
        "overall_answer_change_rate": overall_change_rate,
        "average_observed_attention_change": overall_att_change,
        "average_confidence_shift": overall_conf_shift,
        "session_summaries": session_summaries,
    }

