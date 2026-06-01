"""Seed a demo teacher, class, and roster. Run from repo root: python -m backend.scripts.seed_demo"""
import time

from backend.app.auth import hash_password
from backend.app.database import classes_collection, students_collection, teachers_collection

DEMO_USER = "demo"
DEMO_PASS = "demo1234"
CLASS_CODE = "CS201"
CLASS_NAME = "Introduction to CS"
ROSTER = [
    ("ROLL001", "Alice Johnson"),
    ("ROLL002", "Bob Smith"),
    ("ROLL003", "Carol Lee"),
]


def main():
    if teachers_collection is None:
        print("Database offline.")
        return

    if not teachers_collection.find_one({"username": DEMO_USER}):
        teachers_collection.insert_one(
            {
                "username": DEMO_USER,
                "password_hash": hash_password(DEMO_PASS),
                "registered_at": time.time(),
            }
        )
        print(f"Created teacher: {DEMO_USER} / {DEMO_PASS}")
    else:
        print(f"Teacher {DEMO_USER} already exists")

    existing = classes_collection.find_one({"class_code": CLASS_CODE})
    if existing:
        join_code = existing["join_code"]
        print(f"Class {CLASS_CODE} exists. Join code: {join_code}")
    else:
        import secrets

        join_code = secrets.token_hex(3).upper()
        classes_collection.insert_one(
            {
                "class_code": CLASS_CODE,
                "display_name": CLASS_NAME,
                "teacher_username": DEMO_USER,
                "join_code": join_code,
                "created_at": time.time(),
            }
        )
        print(f"Created class {CLASS_CODE}. Join code: {join_code}")

    for roll, name in ROSTER:
        students_collection.update_one(
            {"class_code": CLASS_CODE, "roll_number": roll},
            {"$set": {"name": name, "class_code": CLASS_CODE, "roll_number": roll}},
            upsert=True,
        )
    print(f"Roster loaded ({len(ROSTER)} students).")


if __name__ == "__main__":
    main()
