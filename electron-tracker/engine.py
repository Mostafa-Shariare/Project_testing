"""
Visoria Electron Tracker — Python Engine Bridge
================================================
Headless Computer Vision & Machine Learning Bridge for the Electron Student Tracker.
Communicates with Electron's main process via stdin / stdout JSON messaging.
"""

import sys
import os
import json
import time
import base64
import threading
import urllib.request
from pathlib import Path

# Ensure UTF-8 output across platforms
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Add repo root to sys.path so we can import client.tracker and ml.model
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import cv2
import numpy as np
import mediapipe as mp

from ml.model import (
    predict_attention,
    predict_proba_attention,
    explain_prediction,
)
from client.tracker import (
    BlinkDetector,
    TemporalSmoother,
    YOLOWorker,
    StateReporter,
    verify_session_join,
    get_face_landmarker,
    get_hand_model,
    detect_hands,
    extract_features,
    heuristic_attention,
    draw_mesh,
    draw_face_bbox,
    draw_head_pose_markers,
    draw_iris_markers,
    draw_hand_landmarks,
    draw_yolo_boxes,
    FEATURE_KEYS,
)


def emit(payload: dict):
    """Emit JSON payload to stdout for Electron main process to read."""
    try:
        sys.stdout.write(json.dumps(payload) + "\n")
        sys.stdout.flush()
    except Exception:
        pass


def verify_and_resolve_join(
    server_url: str,
    class_code: str,
    join_code: str,
    roll_number: str,
    name: str = "Student",
) -> tuple[bool, str, str]:
    """Pre-flight verification against the Visoria FastAPI server before camera starts."""
    server_url = server_url.rstrip("/")
    if "localhost" in server_url:
        server_url = server_url.replace("localhost", "127.0.0.1")
    class_code = class_code.strip().upper()
    join_code = join_code.strip().upper()

    # If join_code is empty, try resolving the active session code first
    if not join_code:
        try:
            req = urllib.request.Request(f"{server_url}/api/classes/{class_code}/public-info")
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                join_code = data.get("join_code", "")
        except Exception:
            pass

    payload = {
        "class_code": class_code,
        "join_code": join_code,
        "roll_number": roll_number.strip().upper(),
        "name": name.strip(),
    }
    data = json.dumps(payload).encode("utf-8")
    try:
        req = urllib.request.Request(
            f"{server_url}/api/student/verify",
            data=data,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            resp_data = json.loads(resp.read().decode("utf-8"))
            resolved_join_code = resp_data.get("join_code") or join_code
            return True, "", resolved_join_code
    except urllib.error.HTTPError as e:
        # If verification failed (e.g. join code typo), attempt auto-recovery via public class info
        try:
            req_info = urllib.request.Request(f"{server_url}/api/classes/{class_code}/public-info")
            with urllib.request.urlopen(req_info, timeout=3.0) as info_resp:
                info_data = json.loads(info_resp.read().decode("utf-8"))
                actual_join_code = info_data.get("join_code", "")
                if actual_join_code and actual_join_code != join_code:
                    payload["join_code"] = actual_join_code
                    retry_data = json.dumps(payload).encode("utf-8")
                    retry_req = urllib.request.Request(
                        f"{server_url}/api/student/verify",
                        data=retry_data,
                        headers={"Content-Type": "application/json"},
                    )
                    with urllib.request.urlopen(retry_req, timeout=4.0) as retry_resp:
                        r_data = json.loads(retry_resp.read().decode("utf-8"))
                        return True, "", r_data.get("join_code") or actual_join_code
        except Exception:
            pass

        try:
            err_body = e.read().decode("utf-8", errors="replace")
            detail = json.loads(err_body).get("detail", err_body)
        except Exception:
            detail = str(e)
        return False, str(detail), ""
    except Exception as e:
        return False, f"Cannot reach server: {e}", ""


def open_webcam(device_id=0):
    """Open webcam with DirectShow priority on Windows with fast capture negotiation."""
    if sys.platform.startswith("win"):
        try:
            cap = cv2.VideoCapture(device_id, cv2.CAP_DSHOW)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                ret, _ = cap.read()
                if ret:
                    return cap
                cap.release()
        except Exception:
            pass

    cap = cv2.VideoCapture(device_id)
    if cap.isOpened():
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    return cap


class HeadlessTrackerEngine:
    def __init__(self):
        self.is_running = False
        self.is_paused = False
        self.stop_event = threading.Event()
        self.tracking_thread = None

        # Config
        self.server_url = "http://127.0.0.1:8000"
        self.student_name = "Student"
        self.roll_number = "ROLL001"
        self.class_code = "CS101"
        self.join_code = ""

        # HUD toggles
        self.show_mesh = False
        self.show_face_bbox = True
        self.show_pose = True
        self.show_iris = True
        self.show_hands = True
        self.show_phone = True

        # Socratic polling state
        self.socratic_state = {
            "active": False,
            "session_id": None,
            "question": None,
            "join_token": "",
        }

        # Pre-warm vision models and ML artifacts in background thread so Start Tracking is instantaneous
        threading.Thread(target=self._prewarm_models, daemon=True).start()

    def _prewarm_models(self):
        """Asynchronously initialize MediaPipe and ML singletons on startup."""
        try:
            get_face_landmarker()
            get_hand_model()
            from ml.model import _load_artifacts
            _load_artifacts()
            # Quick dummy inference to pre-warm XGBoost / sklearn pipelines
            dummy_feat = {k: 0.0 for k in FEATURE_KEYS}
            predict_proba_attention(dummy_feat)
        except Exception:
            pass

    def update_hud(self, toggles: dict):
        if "mesh" in toggles: self.show_mesh = bool(toggles["mesh"])
        if "bbox" in toggles: self.show_face_bbox = bool(toggles["bbox"])
        if "pose" in toggles: self.show_pose = bool(toggles["pose"])
        if "iris" in toggles: self.show_iris = bool(toggles["iris"])
        if "hands" in toggles: self.show_hands = bool(toggles["hands"])
        if "phone" in toggles: self.show_phone = bool(toggles["phone"])
        emit({"type": "status", "message": "HUD toggles updated"})

    def start_tracking(self, config: dict):
        if self.is_running:
            emit({"type": "error", "message": "Tracker is already running"})
            return

        raw_url = config.get("server_url", "http://127.0.0.1:8000").rstrip("/")
        if "localhost" in raw_url:
            raw_url = raw_url.replace("localhost", "127.0.0.1")
        self.server_url = raw_url
        self.student_name = config.get("student_name", "Student")
        self.roll_number = config.get("roll_number", "ROLL001").strip().upper()
        self.class_code = config.get("class_code", "CS101").strip().upper()
        self.join_code = config.get("join_code", "").strip().upper()

        # Step 1: Pre-flight join verification with backend
        emit({"type": "status", "message": "Verifying session with Visoria server..."})
        ok, err, resolved_join_code = verify_and_resolve_join(
            self.server_url, self.class_code, self.join_code, self.roll_number, self.student_name
        )
        if not ok:
            emit({"type": "join_denied", "error": err or "Verification failed"})
            return

        if resolved_join_code:
            self.join_code = resolved_join_code

        self.is_running = True
        self.is_paused = False
        self.stop_event.clear()

        self.tracking_thread = threading.Thread(target=self._run_loop, daemon=True)
        self.tracking_thread.start()
        emit({"type": "started", "message": "Session verified. Tracking started."})

    def stop_tracking(self):
        if not self.is_running:
            emit({"type": "stopped", "message": "Tracker is not running"})
            return

        self.is_running = False
        self.stop_event.set()
        if self.tracking_thread:
            self.tracking_thread.join(timeout=2.0)
            self.tracking_thread = None

        emit({"type": "stopped", "message": "Tracking stopped."})

    def toggle_pause(self, pause: bool):
        self.is_paused = pause
        emit({"type": "paused", "is_paused": self.is_paused})

    def _poll_socratic(self):
        """Background poller for Socratic sessions."""
        while not self.stop_event.is_set():
            try:
                url = f"{self.server_url}/api/socratic/session/active?class_code={self.class_code}"
                req = urllib.request.Request(url, headers={"User-Agent": "VisoriaElectronTracker/1.0"})
                with urllib.request.urlopen(req, timeout=2.0) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode("utf-8"))
                        if data and data.get("session"):
                            sess = data["session"]
                            self.socratic_state["active"] = True
                            self.socratic_state["session_id"] = sess.get("session_id")
                            self.socratic_state["join_token"] = sess.get("join_token", "")
                            self.socratic_state["activity_type"] = sess.get("activity_type", "socratic_question")
                            qs = data.get("questions", [])
                            if qs:
                                self.socratic_state["question"] = qs[-1]
                        else:
                            self.socratic_state["active"] = False
                            self.socratic_state["session_id"] = None
                            self.socratic_state["question"] = None
            except Exception:
                pass
            time.sleep(3.0)

    def _run_loop(self):
        # Initialize background reporter
        last_status_msg = "Connected to server"
        def _on_status(msg):
            nonlocal last_status_msg
            last_status_msg = msg

        reporter = StateReporter(
            self.server_url,
            self.student_name,
            self.roll_number,
            self.class_code,
            self.join_code,
            on_status=_on_status,
        )
        reporter.start()

        # Start Socratic poller
        socratic_thread = threading.Thread(target=self._poll_socratic, daemon=True)
        socratic_thread.start()

        emit({"type": "status", "message": "Connecting to camera hardware..."})
        cap = open_webcam(0)
        if not cap.isOpened():
            reporter.stop()
            self.is_running = False
            emit({"type": "error", "message": "Cannot open webcam device. Please verify your camera is connected."})
            return

        emit({"type": "status", "message": "Camera connected. Initializing vision models..."})
        face_lmk = get_face_landmarker()
        blink_det = BlinkDetector()
        smoother = TemporalSmoother(window=15, low=0.45, high=0.55)
        yolo_worker = YOLOWorker(every_n=6)
        emit({"type": "status", "message": "Vision pipeline active. Streaming feed..."})

        fps_timer = time.time()
        frame_counter = 0
        read_fails = 0

        try:
            while not self.stop_event.is_set():
                ret, frame = cap.read()
                if not ret:
                    read_fails += 1
                    if read_fails > 15:
                        emit({"type": "error", "message": "Lost webcam stream. Ensure no other app is accessing the camera."})
                        break
                    time.sleep(0.04)
                    continue
                read_fails = 0

                frame = cv2.flip(frame, 1)
                H, W = frame.shape[:2]

                if self.is_paused:
                    # Privacy pause mode: render calm blurred/gradient frame
                    blurred = cv2.GaussianBlur(frame, (85, 85), 0)
                    cv2.putText(
                        blurred,
                        "CAMERA PAUSED (PRIVACY ACTIVE)",
                        (W // 2 - 250, H // 2),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.9,
                        (154, 163, 178),
                        2,
                        cv2.LINE_AA,
                    )
                    reporter.update_state({
                        "attention": 1,
                        "model_prob_smoothed": 0.85,
                        "model_pred_stable": 1,
                        "gaze": "Privacy Pause",
                        "is_paused": True,
                    })
                    display_frame = blurred
                    telemetry_data = {
                        "attention": 1,
                        "model_prob_smoothed": 0.85,
                        "model_prob_raw": 0.85,
                        "model_pred_stable": 1,
                        "phone_detected": False,
                        "hands_count": 0,
                        "blinks": 0,
                        "blinks_per_min": 0,
                        "gaze": "Privacy Active",
                        "pose_pitch": 0.0,
                        "pose_yaw": 0.0,
                        "pose_roll": 0.0,
                        "alert": "CAMERA PAUSED",
                        "status": last_status_msg,
                        "is_paused": True,
                    }
                else:
                    # ── Stage 1: Ingestion
                    yolo_worker.tick(frame)
                    phone_feat, phone_boxes = yolo_worker.get()
                    no_of_hand, hand_landmarks = detect_hands(frame)

                    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                    face_result = face_lmk.detect(mp_img)
                    face_absent = not bool(face_result.face_landmarks)

                    # ── Stage 2: Feature Extraction
                    feat, pose_angles, ear_avg, gaze_dir = extract_features(
                        frame, face_result, phone_feat, no_of_hand
                    )
                    blink_det.update(ear_avg)
                    bpm = blink_det.blinks_per_minute()

                    # Heuristic attention
                    if face_absent:
                        h_score = heuristic_attention(0, 0, gaze_dir, ear_avg, no_face=True)
                    elif pose_angles:
                        h_score = heuristic_attention(pose_angles[1], pose_angles[0], gaze_dir, ear_avg)
                    else:
                        h_score = heuristic_attention(0, 0, gaze_dir, ear_avg)

                    # ── Stage 3: ML Attention Prediction
                    if face_absent:
                        prob_raw = 0.0
                    else:
                        try:
                            prob_raw = float(predict_proba_attention(feat))
                        except Exception:
                            prob_raw = float(h_score)

                    prob_smooth, pred_stable = smoother.update(prob_raw)
                    attention_binary = 1 if prob_smooth >= 0.5 else 0
                    blend = int(round(h_score * 0.45 + prob_smooth * 100 * 0.55)) if not face_absent else 0
                    blend = max(0, min(100, blend))

                    pitch = float(pose_angles[0]) if pose_angles else 0.0
                    yaw   = float(pose_angles[1]) if pose_angles else 0.0
                    roll  = float(pose_angles[2]) if pose_angles else 0.0

                    alert_text = ""
                    if face_absent:
                        alert_text = "NO FACE DETECTED"
                    elif bool(phone_feat.get("phone_detected", False)):
                        alert_text = "PHONE DETECTED"
                    elif prob_smooth < 0.45:
                        alert_text = "ATTENTION SHIFT"

                    if blend >= 80:
                        state_label = "Optimal Focus"
                    elif blend >= 60:
                        state_label = "Mindful Focus"
                    elif blend >= 40:
                        state_label = "Attention Drift"
                    else:
                        state_label = "Breather Suggested"

                    contributing_factors = []
                    if face_absent:
                        contributing_factors.append("Face detection unmaintained")
                    else:
                        if phone_feat.get("phone_detected"):
                            contributing_factors.append("Mobile device presence observed in frame")
                        if gaze_dir in ("Left", "Right", "Away"):
                            contributing_factors.append(f"Gaze deviation ({gaze_dir})")
                        if abs(yaw) > 20:
                            contributing_factors.append("Sideways head orientation")
                        if bpm > 25:
                            contributing_factors.append("Elevated blink frequency")
                        if no_of_hand >= 2:
                            contributing_factors.append("Hand movement near face")
                    if blend >= 70 and not contributing_factors:
                        contributing_factors.append("Centered gaze toward primary screen")
                        contributing_factors.append("Stable forward-facing posture")

                    # Update background reporter
                    reporter.update_state({
                        "attention": blend,
                        "attention_state": state_label,
                        "contributing_factors": contributing_factors[:3],
                        "model_prob_smoothed": prob_smooth,
                        "model_prob_raw": prob_raw,
                        "model_pred_stable": pred_stable,
                        "phone_detected": bool(phone_feat.get("phone_detected", False)),
                        "hands_count": int(no_of_hand),
                        "blinks": int(getattr(blink_det, "total", 0)),
                        "blinks_per_min": float(bpm),
                        "gaze": str(gaze_dir),
                        "pose": (pitch, yaw, roll),
                        "alert": alert_text,
                        "is_paused": False,
                    })

                    # ── Overlays Drawing
                    if face_result.face_landmarks:
                        lms = face_result.face_landmarks[0]
                        if self.show_mesh:
                            draw_mesh(frame, lms, W, H)
                        if self.show_face_bbox:
                            draw_face_bbox(frame, lms, W, H)
                        if self.show_pose:
                            draw_head_pose_markers(frame, lms, W, H)
                        if self.show_iris:
                            draw_iris_markers(frame, lms, W, H)

                    if self.show_hands and hand_landmarks:
                        draw_hand_landmarks(frame, hand_landmarks, W, H)

                    draw_yolo_boxes(frame, phone_boxes, self.show_phone)

                    display_frame = frame
                    telemetry_data = {
                        "attention": blend,
                        "attention_binary": attention_binary,
                        "attention_state": state_label,
                        "model_prob_smoothed": round(prob_smooth, 3),
                        "model_prob_raw": round(prob_raw, 3),
                        "model_pred_stable": pred_stable,
                        "phone_detected": bool(phone_feat.get("phone_detected", False)),
                        "hands_count": int(no_of_hand),
                        "blinks": int(getattr(blink_det, "total", 0)),
                        "blinks_per_min": round(bpm, 1),
                        "gaze": str(gaze_dir),
                        "pose_pitch": round(pitch, 1),
                        "pose_yaw": round(yaw, 1),
                        "pose_roll": round(roll, 1),
                        "alert": alert_text,
                        "status": last_status_msg,
                        "is_paused": False,
                    }

                # Scale frame down slightly for efficient IPC transmission (e.g. 720x405)
                small_frame = cv2.resize(display_frame, (720, 405), interpolation=cv2.INTER_AREA)
                _, buffer = cv2.imencode(".jpg", small_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
                jpg_as_text = base64.b64encode(buffer).decode("ascii")

                emit({
                    "type": "frame",
                    "image": f"data:image/jpeg;base64,{jpg_as_text}",
                    "telemetry": telemetry_data,
                    "socratic": self.socratic_state if self.socratic_state["active"] else None,
                })

                # Target ~24 FPS
                time.sleep(0.04)

        except Exception as e:
            import traceback
            traceback.print_exc(file=sys.stderr)
            emit({"type": "error", "message": f"Tracking loop error: {e}"})
        finally:
            cap.release()
            reporter.stop()
            self.is_running = False
            emit({"type": "stopped", "message": "Tracker shutdown completed."})


def main():
    engine = HeadlessTrackerEngine()
    emit({"type": "ready", "message": "Visoria Python Engine Bridge Initialized"})

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue
            msg = json.loads(line)
            cmd = msg.get("cmd")
            if cmd == "start":
                engine.start_tracking(msg.get("config", {}))
            elif cmd == "stop":
                engine.stop_tracking()
            elif cmd == "pause":
                engine.toggle_pause(bool(msg.get("paused", True)))
            elif cmd == "set_hud":
                engine.update_hud(msg.get("toggles", {}))
            elif cmd == "ping":
                emit({"type": "pong", "is_running": engine.is_running})
            elif cmd == "quit":
                engine.stop_tracking()
                break
        except Exception as e:
            emit({"type": "error", "message": f"Bridge error: {e}"})


if __name__ == "__main__":
    main()
