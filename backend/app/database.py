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


def connect():
    global client, db, teachers_collection, classes_collection, students_collection, sessions_collection
    try:
        client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=2000)
        db = client[settings.mongodb_db]
        client.server_info()
        logger.info("Connected to MongoDB at %s", settings.mongodb_uri)

        teachers_collection = db["teachers"]
        classes_collection = db["classes"]
        students_collection = db["students"]
        sessions_collection = db["sessions"]

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
        _safe(
            "sessions.start_time",
            lambda: sessions_collection.create_index("start_time", ASCENDING),
        )
        if settings.session_ttl_days > 0:
            _safe(
                "sessions.ttl",
                lambda: sessions_collection.create_index(
                    "start_time",
                    expireAfterSeconds=settings.session_ttl_days * 86400,
                    name="sessions_ttl",
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
