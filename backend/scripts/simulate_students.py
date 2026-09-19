"""
Simulate multiple live students for teacher-dashboard testing (no webcam).

Run from repo root:
  python -m backend.scripts.simulate_students --class-code CS201 --join-code YOUR_CODE

Get join code after seeding demo data:
  python -m backend.scripts.seed_demo
"""
from __future__ import annotations

import argparse
import json
import random
import signal
import sys
import time
import urllib.error
import urllib.request

DEFAULT_ROSTER = [
    ("ROLL001", "Alice Johnson"),
    ("ROLL002", "Bob Smith"),
    ("ROLL003", "Carol Lee"),
    ("ROLL004", "David Kim"),
    ("ROLL005", "Eva Martinez"),
    ("ROLL006", "Frank Wilson"),
]


def _post(url: str, payload: dict, timeout: float = 3.0) -> tuple[bool, str]:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout):
            return True, ""
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="replace")
            detail = json.loads(body).get("detail", body)
        except Exception:
            detail = str(e)
        return False, str(detail)
    except Exception as e:
        return False, str(e)


class StudentSimulator:
    def __init__(
        self,
        server_url: str,
        class_code: str,
        join_code: str,
        roster: list[tuple[str, str]],
    ):
        self.server_url = server_url.rstrip("/")
        self.class_code = class_code.strip().upper()
        self.join_code = join_code.strip().upper()
        self.roster = roster
        self._scores = {roll: random.randint(55, 92) for roll, _ in roster}
        self._running = True

    def stop(self):
        self._running = False

    def verify_all(self) -> bool:
        # Pre-prime roster in local database if available to prevent preflight rejection
        try:
            from backend.app.database import students_collection
            if students_collection is not None:
                for roll, name in self.roster:
                    students_collection.update_one(
                        {"class_code": self.class_code, "roll_number": roll},
                        {"$set": {"name": name, "class_code": self.class_code, "roll_number": roll}},
                        upsert=True,
                    )
        except Exception:
            pass

        ok_all = True
        for roll, name in self.roster:
            ok, err = _post(
                f"{self.server_url}/api/student/verify",
                {
                    "class_code": self.class_code,
                    "join_code": self.join_code,
                    "roll_number": roll,
                    "name": name,
                },
            )
            if ok:
                print(f"  [OK] {roll} {name}")
            else:
                print(f"  [FAIL] {roll} {name}: {err}")
                ok_all = False
        return ok_all

    def tick(self):
        for roll, name in self.roster:
            score = self._scores[roll]
            score = max(20, min(98, score + random.randint(-4, 4)))
            self._scores[roll] = score
            prob = score / 100.0
            payload = {
                "name": name,
                "roll_number": roll,
                "class_code": self.class_code,
                "join_code": self.join_code,
                "attention": score,
                "model_prob_smoothed": prob,
                "model_prob_raw": prob,
                "model_pred_stable": 1 if prob >= 0.5 else 0,
                "phone_detected": random.random() < 0.03,
                "hands_count": 0,
                "blinks": random.randint(5, 40),
                "blinks_per_min": round(random.uniform(8, 18), 1),
                "gaze": random.choice(["Center", "Center", "Center", "Left", "Right"]),
                "pose_pitch": round(random.uniform(-12, 12), 1),
                "pose_yaw": round(random.uniform(-15, 15), 1),
                "pose_roll": round(random.uniform(-8, 8), 1),
                "alert": "",
            }
            ok, err = _post(f"{self.server_url}/api/student/update", payload)
            if not ok:
                print(f"[WARN] {roll} update failed: {err}")

    def end_all(self):
        for roll, _ in self.roster:
            _post(
                f"{self.server_url}/api/student/end",
                {"roll_number": roll, "class_code": self.class_code},
                timeout=2.0,
            )


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Simulate live student telemetry.")
    p.add_argument("--server", default="http://localhost:8000", help="API base URL")
    p.add_argument("--class-code", default="CS201", help="Class code")
    p.add_argument("--join-code", required=True, help="Class join code from teacher dashboard")
    p.add_argument(
        "--count",
        type=int,
        default=3,
        help=f"Number of simulated students (1-{len(DEFAULT_ROSTER)})",
    )
    p.add_argument("--interval", type=float, default=1.0, help="Seconds between updates")
    return p.parse_args()


def main():
    args = parse_args()
    count = max(1, min(args.count, len(DEFAULT_ROSTER)))
    roster = DEFAULT_ROSTER[:count]
    sim = StudentSimulator(args.server, args.class_code, args.join_code, roster)

    def _shutdown(*_):
        print("\nStopping simulators and ending sessions...")
        sim.stop()
        sim.end_all()
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _shutdown)

    print(f"Verifying join for {len(roster)} student(s)...")
    if not sim.verify_all():
        print("Join verification failed. Check class code, join code, and that the backend is running.")
        sys.exit(1)

    print(f"Simulating {len(roster)} students on {args.class_code} (Ctrl+C to stop)")
    while sim._running:
        sim.tick()
        time.sleep(max(0.2, args.interval))


if __name__ == "__main__":
    main()
