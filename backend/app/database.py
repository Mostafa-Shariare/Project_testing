"""MongoDB connection, collections, and indexes."""
import logging

from backend.app.config import get_settings
from pymongo import ASCENDING, MongoClient

logger = logging.getLogger(__name__)

settings = get_settings()
client: MongoClient | None = None
db = None

teachers_collection = None
classes_collection = None
students_collection = None
sessions_collection = None
student_actions_collection = None
socratic_sessions_collection = None
socratic_questions_collection = None
socratic_answers_collection = None
intervention_activities_collection = None


def connect():
    global client, db, teachers_collection, classes_collection, students_collection
    global sessions_collection, student_actions_collection, socratic_sessions_collection
    global socratic_questions_collection, socratic_answers_collection, intervention_activities_collection
    try:
        client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=2000)
        db = client[settings.mongodb_db]
        client.server_info()
        logger.info("Connected to MongoDB at %s", settings.mongodb_uri)

        teachers_collection = db["teachers"]
        classes_collection = db["classes"]
        students_collection = db["students"]
        sessions_collection = db["sessions"]
        student_actions_collection = db["student_actions"]

        # Socratic & activity collections
        socratic_sessions_collection = db["socratic_sessions"]
        socratic_questions_collection = db["socratic_questions"]
        socratic_answers_collection = db["socratic_answers"]
        intervention_activities_collection = db["intervention_activities"]

        _ensure_indexes()
        return True
    except Exception as exc:
        logger.error("MongoDB connection failed: %s", exc)
        client = None
        db = None
        teachers_collection = None
        classes_collection = None
        students_collection = None
        sessions_collection = None
        student_actions_collection = None
        socratic_sessions_collection = None
        socratic_questions_collection = None
        socratic_answers_collection = None
        intervention_activities_collection = None
        return False


def _ensure_indexes():
    def _safe(label, fn):
        try:
            fn()
            logger.info("Index ok: %s", label)
        except Exception as exc:
            logger.warning("Index skipped (%s): %s", label, exc)

    if teachers_collection is not None:
        _safe("teachers.username", lambda: teachers_collection.create_index("username", unique=True))

    if classes_collection is not None:
        _safe("classes.class_code", lambda: classes_collection.create_index("class_code", unique=True))
        _safe(
            "classes.teacher",
            lambda: classes_collection.create_index([("teacher_username", ASCENDING)]),
        )

    if students_collection is not None:
        _safe(
            "students.class_roll",
            lambda: students_collection.create_index(
                [("class_code", ASCENDING), ("roll_number", ASCENDING)],
                unique=True,
            ),
        )

    if sessions_collection is not None:
        _safe(
            "sessions.class_roll_status",
            lambda: sessions_collection.create_index(
                [("class_code", ASCENDING), ("roll_number", ASCENDING), ("status", ASCENDING)]
            ),
        )
        _safe(
            "sessions.teacher_time",
            lambda: sessions_collection.create_index(
                [("teacher_username", ASCENDING), ("start_time", ASCENDING)]
            ),
        )
        if settings.session_ttl_days > 0:
            _safe(
                "sessions.ttl",
                lambda: sessions_collection.create_index(
                    [("start_time", ASCENDING)],
                    expireAfterSeconds=settings.session_ttl_days * 86400,
                    name="sessions_ttl",
                ),
            )
        else:
            _safe(
                "sessions.start_time",
                lambda: sessions_collection.create_index([("start_time", ASCENDING)]),
            )

    if student_actions_collection is not None:
        _safe(
            "student_actions.class_roll",
            lambda: student_actions_collection.create_index(
                [("class_code", ASCENDING), ("roll_number", ASCENDING)],
                unique=True,
            ),
        )

    # Socratic & Activity collections indexes
    if socratic_sessions_collection is not None:
        _safe(
            "socratic_sessions.class_code",
            lambda: socratic_sessions_collection.create_index([("class_code", ASCENDING)], unique=False),
        )
        _safe(
            "socratic_sessions.class_status",
            lambda: socratic_sessions_collection.create_index(
                [("class_code", ASCENDING), ("status", ASCENDING)], unique=False
            ),
        )
    if socratic_questions_collection is not None:
        _safe(
            "socratic_questions.session_id",
            lambda: socratic_questions_collection.create_index([("session_id", ASCENDING)], unique=False),
        )
    if socratic_answers_collection is not None:
        _safe(
            "socratic_answers.question_id",
            lambda: socratic_answers_collection.create_index([("question_id", ASCENDING)], unique=False),
        )
        _safe(
            "socratic_answers.class_roll",
            lambda: socratic_answers_collection.create_index(
                [("class_code", ASCENDING), ("roll_number", ASCENDING)],
                unique=False,
            ),
        )
    if intervention_activities_collection is not None:
        _safe(
            "intervention_activities.session_id",
            lambda: intervention_activities_collection.create_index([("session_id", ASCENDING)], unique=False),
        )
        _safe(
            "intervention_activities.roll_number",
            lambda: intervention_activities_collection.create_index(
                [("session_id", ASCENDING), ("roll_number", ASCENDING)],
                unique=False,
            ),
        )


def is_db_ready() -> bool:
    if client is None:
        return False
    try:
        client.server_info()
        return True
    except Exception:
        return False


def close_db():
    global client
    if client is not None:
        client.close()
        logger.info("MongoDB connection closed")


connect()
