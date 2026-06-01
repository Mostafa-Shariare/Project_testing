"""Roster management tests."""
import io
import uuid

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)
USER = f"roster_{uuid.uuid4().hex[:8]}"
PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def auth_headers():
    client.post("/api/auth/register", json={"username": USER, "password": PASSWORD})
    login = client.post("/api/auth/login", json={"username": USER, "password": PASSWORD})
    token = login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_roster_csv_import(auth_headers):
    code = f"R{uuid.uuid4().hex[:6].upper()}"
    client.post(
        "/api/classes",
        json={"class_code": code, "display_name": "Roster Test"},
        headers=auth_headers,
    )

    csv_body = "roll_number,name\nR100,Alice\nR101,Bob\n"
    res = client.post(
        f"/api/classes/{code}/roster/import-csv",
        headers=auth_headers,
        files={"file": ("roster.csv", io.BytesIO(csv_body.encode()), "text/csv")},
    )
    assert res.status_code == 200
    assert res.json()["imported"] == 2

    roster = client.get(f"/api/classes/{code}/roster", headers=auth_headers)
    assert len(roster.json()) == 2

    del_res = client.delete(f"/api/classes/{code}/roster/R100", headers=auth_headers)
    assert del_res.status_code == 200
