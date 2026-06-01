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
    r = client.post("/api/student/update", json=payload)
    assert r.status_code == 200

    hist = client.get(
        f"/api/analytics/history?class_code={cls['class_code']}",
        headers=auth_headers,
    )
    assert hist.status_code == 200
    assert len(hist.json()) >= 1
