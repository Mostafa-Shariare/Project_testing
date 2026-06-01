"""Quick smoke test for teacher JWT auth. Run from repo root: python -m backend.scripts.test_auth"""
import json
import urllib.error
import urllib.request

BASE = "http://localhost:8000"
USER = "test_teacher_smoke"
PASSWORD = "testpass123"


def post(path, body):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=5) as res:
        return res.status, json.loads(res.read().decode())


def get(path, token):
    req = urllib.request.Request(
        f"{BASE}{path}",
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=5) as res:
        return res.status, json.loads(res.read().decode())


def main():
    try:
        status, _ = post("/api/auth/register", {"username": USER, "password": PASSWORD})
        print(f"register: {status} (may be 200 or duplicate)")
    except urllib.error.HTTPError as e:
        print(f"register: {e.code} (existing user is ok)")

    status, login = post("/api/auth/login", {"username": USER, "password": PASSWORD})
    token = login["access_token"]
    print(f"login: {status}, token length={len(token)}")

    status, me = get("/api/auth/me", token)
    print(f"me: {status}, username={me['username']}")

    status, history = get("/api/analytics/history", token)
    print(f"history: {status}, sessions={len(history)}")
    print("Auth smoke test passed.")


if __name__ == "__main__":
    main()
