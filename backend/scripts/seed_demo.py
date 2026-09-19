"""Seed a demo teacher, class, and roster. Run from repo root: python -m backend.scripts.seed_demo"""
import time

from backend.app.auth import hash_password
from backend.app.database import classes_collection, students_collection, teachers_collection

DEMO_USER = "demo"
DEMO_PASS = "demo1234"
CLASSES = [
    {
        "class_code": "CS201",
        "display_name": "Introduction to CS",
        "roster": [
            ("ROLL001", "Alice Johnson"),
            ("ROLL002", "Bob Smith"),
            ("ROLL003", "Carol Lee"),
            ("ROLL004", "David Brown"),
            ("ROLL005", "Emma Wilson"),
        ],
    },
    {
        "class_code": "CS233",
        "display_name": "Computer Systems & Architecture",
        "roster": [
            ("12345", "Mostafa"),
            ("ROLL001", "John Doe"),
            ("ROLL002", "Alice Johnson"),
            ("ROLL003", "Bob Smith"),
            ("ROLL004", "Carol Lee"),
            ("ROLL005", "David Brown"),
        ],
    },
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

    import secrets

    for item in CLASSES:
        code = item["class_code"]
        name = item["display_name"]
        roster = item["roster"]

        existing = classes_collection.find_one({"class_code": code})
        if existing:
            join_code = existing.get("join_code", "B29078")
            print(f"Class {code} exists. Join code: {join_code}")
        else:
            join_code = secrets.token_hex(3).upper()
            classes_collection.insert_one(
                {
                    "class_code": code,
                    "display_name": name,
                    "teacher_username": DEMO_USER,
                    "join_code": join_code,
                    "created_at": time.time(),
                }
            )
            print(f"Created class {code}. Join code: {join_code}")

        for roll, sname in roster:
            students_collection.update_one(
                {"class_code": code, "roll_number": roll},
                {"$set": {"name": sname, "class_code": code, "roll_number": roll}},
                upsert=True,
            )
        print(f"Roster for {code} loaded ({len(roster)} students).")


if __name__ == "__main__":
    main()
