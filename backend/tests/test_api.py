"""API integration tests (requires MongoDB on localhost)."""
import os
import uuid

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-pytest-only")

from backend.app.main import app  # noqa: E402

client = TestClient(app)
USER = f"pytest_{uuid.uuid4().hex[:8]}"
PASSWORD = "testpass123"
CLASS_CODE = f"T{uuid.uuid4().hex[:6].upper()}"


@pytest.fixture(scope="module")
def auth_headers():
    client.post("/api/auth/register", json={"username": USER, "password": PASSWORD})
    login = client.post("/api/auth/login", json={"username": USER, "password": PASSWORD})
    assert login.status_code == 200
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_ready():
    r = client.get("/api/ready")
    assert r.status_code in (200, 503)


def test_create_class(auth_headers):
    r = client.post(
        "/api/classes",
        json={"class_code": CLASS_CODE, "display_name": "Pytest Class"},
        headers=auth_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["class_code"] == CLASS_CODE
    assert "join_code" in body


def test_student_telemetry(auth_headers):
    cls = client.post(
        "/api/classes",
        json={"class_code": CLASS_CODE + "B", "display_name": "Telemetry Class"},
        headers=auth_headers,
    ).json()

    payload = {
        "name": "Test Student",
        "roll_number": "R001",
        "class_code": cls["class_code"],
        "join_code": cls["join_code"],
        "attention": 80,
        "alert": "",
    }

    # Should fail before teacher adds student to roster
    unrostered = client.post("/api/student/update", json=payload)
    assert unrostered.status_code == 403

    # Teacher adds student to roster
    roster_add = client.post(
        f"/api/classes/{cls['class_code']}/roster",
        json={"roll_number": "R001", "name": "Test Student"},
        headers=auth_headers,
    )
    assert roster_add.status_code == 200

    r = client.post("/api/student/update", json=payload)
    assert r.status_code == 200

    hist = client.get(
        f"/api/analytics/history?class_code={cls['class_code']}",
        headers=auth_headers,
    )
    assert hist.status_code == 200
    assert len(hist.json()) >= 1


def test_student_verify_join_code(auth_headers):
    cls = client.post(
        "/api/classes",
        json={"class_code": CLASS_CODE + "V", "display_name": "Verify Class"},
        headers=auth_headers,
    ).json()

    # Verify fails if not on roster
    unrostered = client.post(
        "/api/student/verify",
        json={
            "class_code": cls["class_code"],
            "join_code": cls["join_code"],
            "roll_number": "R002",
            "name": "Verify Student",
        },
    )
    assert unrostered.status_code == 403

    # Teacher adds student to roster
    client.post(
        f"/api/classes/{cls['class_code']}/roster",
        json={"roll_number": "R002", "name": "Verify Student"},
        headers=auth_headers,
    )

    ok = client.post(
        "/api/student/verify",
        json={
            "class_code": cls["class_code"],
            "join_code": cls["join_code"],
            "roll_number": "R002",
            "name": "Verify Student",
        },
    )
    assert ok.status_code == 200

    bad_code = client.post(
        "/api/student/verify",
        json={
            "class_code": cls["class_code"],
            "join_code": "WRONG1",
            "roll_number": "R002",
            "name": "Verify Student",
        },
    )
    assert bad_code.status_code == 403

    bad_name = client.post(
        "/api/student/verify",
        json={
            "class_code": cls["class_code"],
            "join_code": cls["join_code"],
            "roll_number": "R002",
            "name": "Wrong Name",
        },
    )
    assert bad_name.status_code == 400
