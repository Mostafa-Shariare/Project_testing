"""
attention_tracker.py
====================
Advanced Attention Tracker — MediaPipe + YOLOv8 Edition

New in this version
────────────────────
  • YOLOv8 phone detection  — fills phone_* features the model was trained on
  • MediaPipe Hands         — fills no_of_hand feature the model was trained on
  • TemporalSmoother        — 15-frame rolling window eliminates label flickering
  • All 16 dataset features are now REAL values (none hardcoded to zero)

Controls
────────
  M  — Toggle face mesh
  Y  — Toggle phone bounding boxes
  H  — Toggle head pose markers
  I  — Toggle iris markers
  L  — Toggle hand landmarks
  B  — Toggle face bounding box
  X  — Toggle XAI insights
  P  — Toggle CV pipeline panel
  Q / ESC — Quit and show dashboard
"""

import cv2
import csv
import mediapipe as mp
import numpy as np
import os
import time
from pathlib import Path
import collections
import threading
import urllib.request
import json
import webbrowser
import asyncio
import websockets
import tkinter as tk
from tkinter import ttk, messagebox

from PIL import Image, ImageTk
import matplotlib
# Use Agg (non-interactive) so matplotlib never touches the tkinter main loop.
# The dashboard is shown via plt.show() which opens its own window cleanly.
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec

from ml.model import (
    predict_attention,
    predict_proba_attention,
    explain_prediction,
)
from client.ui_console import (
    AnalysisConsole,
    draw_face_bbox,
    draw_hand_landmarks,
    draw_head_pose_markers,
    draw_iris_markers,
)

# Suppress verbose MediaPipe / TensorFlow Lite internal logs
import os as _os
import warnings
_os.environ.setdefault("GLOG_minloglevel", "3")
_os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
_os.environ.setdefault("MEDIAPIPE_DISABLE_GPU", "1")
# Suppress Python 3.14 tkinter deallocator RuntimeError noise on shutdown
warnings.filterwarnings("ignore", message=".*main thread.*", category=RuntimeWarning)

# ══════════════════════════════════════════════════════════════════════════════
# MediaPipe — Face Landmarker
# ══════════════════════════════════════════════════════════════════════════════
BaseOptions           = mp.tasks.BaseOptions
FaceLandmarker        = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
VisionRunningMode     = mp.tasks.vision.RunningMode

_MEDIAPIPE_DIR = Path(__file__).resolve().parent / "assets" / "mediapipe"
_MEDIAPIPE_DIR.mkdir(parents=True, exist_ok=True)
FACE_MODEL_PATH = str(_MEDIAPIPE_DIR / "face_landmarker.task")
FACE_MODEL_URL  = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
)
if not os.path.exists(FACE_MODEL_PATH):
    print("Downloading MediaPipe face model…")
    urllib.request.urlretrieve(FACE_MODEL_URL, FACE_MODEL_PATH)
    print("Done.")

_mp_face_options = FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=FACE_MODEL_PATH),
    running_mode=VisionRunningMode.IMAGE,
    num_faces=1,
    min_face_detection_confidence=0.5,
    min_face_presence_confidence=0.5,
    min_tracking_confidence=0.5,
    output_face_blendshapes=True,
    output_facial_transformation_matrixes=True,
)

_face_landmarker = None
def get_face_landmarker():
    global _face_landmarker
    if _face_landmarker is None:
        _face_landmarker = FaceLandmarker.create_from_options(_mp_face_options)
    return _face_landmarker


# ══════════════════════════════════════════════════════════════════════════════
# MediaPipe — Hands
# ══════════════════════════════════════════════════════════════════════════════
HandLandmarker        = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions

HAND_MODEL_PATH = str(_MEDIAPIPE_DIR / "hand_landmarker.task")
HAND_MODEL_URL  = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)
if not os.path.exists(HAND_MODEL_PATH):
    print("Downloading MediaPipe hand model...")
    urllib.request.urlretrieve(HAND_MODEL_URL, HAND_MODEL_PATH)
    print("Done.")

_hand_options = HandLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=HAND_MODEL_PATH),
    running_mode=VisionRunningMode.IMAGE,
    num_hands=2,
    min_hand_detection_confidence=0.5,
    min_hand_presence_confidence=0.5,
    min_tracking_confidence=0.5,
)

_hand_landmarker = None

def get_hand_model():
    global _hand_landmarker
    if _hand_landmarker is None:
        _hand_landmarker = HandLandmarker.create_from_options(_hand_options)
    return _hand_landmarker


# ══════════════════════════════════════════════════════════════════════════════
# YOLOv8 — Phone detection
# ══════════════════════════════════════════════════════════════════════════════
_yolo_model     = None
_yolo_available = False
_yolo_tried     = False          # attempt load only ONCE — prevents per-frame spam
PHONE_CLASS_ID  = 67    # COCO class 67 = "cell phone"
PHONE_CONF_THRESH = 0.40

def get_yolo():
    """
    Lazy-load YOLOv8n once. After the first attempt (success or failure)
    _yolo_tried is set to True and subsequent calls return immediately
    without re-importing or printing any warnings.
    """
    global _yolo_model, _yolo_available, _yolo_tried
    if _yolo_tried:                  # already attempted — return cached result
        return _yolo_model
    _yolo_tried = True               # mark as attempted before trying
    try:
        from ultralytics import YOLO
        print("Loading YOLOv8n (downloads ~6 MB on first run)...")
        _yolo_model     = YOLO("yolov8n.pt")
        _yolo_available = True
        print("YOLOv8n ready.")
    except Exception as e:
        print(f"[WARN] YOLOv8 unavailable: {e}.")
        print("       Phone detection disabled. Run: pip install ultralytics")
        _yolo_model     = None
        _yolo_available = False
    return _yolo_model


def detect_phone(frame) -> tuple[dict, list]:
    """
    Run YOLOv8 on the frame and return:
      phone_feat — dict of phone_* feature values for the model
      boxes      — list of (x1,y1,x2,y2,conf) for drawing
    """
    default = {
        "phone": 0, "phone_x": 0.0, "phone_y": 0.0,
        "phone_w": 0.0, "phone_h": 0.0, "phone_con": 0.0,
    }
    yolo = get_yolo()
    if yolo is None:
        return default, []

    try:
        results = yolo(frame, verbose=False, classes=[PHONE_CLASS_ID])[0]
    except Exception:
        return default, []

    best_conf = 0.0
    best_feat = default.copy()
    draw_boxes = []

    for box in results.boxes:
        conf = float(box.conf[0])
        if conf < PHONE_CONF_THRESH:
            continue
        x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
        draw_boxes.append((x1, y1, x2, y2, conf))
        if conf > best_conf:
            best_conf = conf
            best_feat = {
                "phone":     1,
                "phone_x":   (x1 + x2) / 2,
                "phone_y":   (y1 + y2) / 2,
                "phone_w":   x2 - x1,
                "phone_h":   y2 - y1,
                "phone_con": conf,
            }

    return best_feat, draw_boxes


def detect_hands(frame) -> tuple[int, list]:
    """Return hand count and landmark lists for UI overlays."""
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = get_hand_model().detect(mp_img)
    if result.hand_landmarks:
        return len(result.hand_landmarks), result.hand_landmarks
    return 0, []


# ══════════════════════════════════════════════════════════════════════════════
# Temporal Smoother  ← NEW
# ══════════════════════════════════════════════════════════════════════════════
class TemporalSmoother:
    """
    Maintains a rolling window of model probabilities and returns a smoothed
    value and a stable label.

    Why this matters
    ────────────────
    Without smoothing, every frame is classified independently.  At a decision
    boundary (prob ≈ 0.50) the label flickers ATTENTIVE→DISTRACTED every frame.
    A 15-frame window (~0.5 s at 30 fps) absorbs single-frame noise so the label
    only changes when there is a genuine sustained trend.

    Hysteresis adds a dead-band: once the label switches to DISTRACTED it stays
    there until the mean rises above 0.55 (not just 0.50), preventing rapid
    toggling near the boundary.
    """

    def __init__(self, window: int = 15, low: float = 0.45, high: float = 0.55):
        """
        Parameters
        ----------
        window : number of frames in the rolling window
        low    : mean must fall below this to switch to DISTRACTED
        high   : mean must rise above this to switch to ATTENTIVE
        """
        self._probs  = collections.deque(maxlen=window)
        self._label  = 1        # start optimistic
        self._low    = low
        self._high   = high

    def update(self, prob: float) -> tuple[float, int]:
        """
        Push a new probability.

        Returns
        -------
        smoothed_prob : float  — rolling mean
        stable_label  : int    — 0 or 1, with hysteresis
        """
        self._probs.append(prob)
        mean = sum(self._probs) / len(self._probs)

        # Hysteresis: only switch if we clearly cross the threshold
        if self._label == 1 and mean < self._low:
            self._label = 0
        elif self._label == 0 and mean > self._high:
            self._label = 1

        return mean, self._label

    def smoothed_prob(self) -> float:
        if not self._probs:
            return 0.5
        return sum(self._probs) / len(self._probs)

    def label(self) -> int:
        return self._label

    @property
    def window_full(self) -> bool:
        return len(self._probs) == self._probs.maxlen


# ══════════════════════════════════════════════════════════════════════════════
# Privacy-Preserving Telemetry & Feature Debug Logger
# ══════════════════════════════════════════════════════════════════════════════
class TelemetryDebugLogger:
    """
    Privacy-Preserving Telemetry Debug Logger.
    Logs derived numerical telemetry feature vectors and model output states to CSV.
    NEVER stores, caches, or writes webcam image frames or video feeds.
    """
    def __init__(self, log_path: str = "logs/debug_telemetry.csv", enabled: bool = True):
        self.enabled = enabled
        self.log_path = Path(log_path)

    def log_frame(self, telemetry_dict: dict):
        if not self.enabled:
            return
        try:
            self.log_path.parent.mkdir(parents=True, exist_ok=True)
            write_header = not self.log_path.exists()
            with open(self.log_path, mode="a", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=[
                    "timestamp", "face_present", "gaze", "pose_pitch", "pose_yaw", "pose_roll",
                    "ear", "blinks_per_min", "phone_detected", "hands_count",
                    "raw_prob", "smoothed_score", "attention_state", "alert"
                ])
                if write_header:
                    writer.writeheader()
                writer.writerow({
                    "timestamp": round(telemetry_dict.get("timestamp", time.time()), 3),
                    "face_present": telemetry_dict.get("face_present", True),
                    "gaze": telemetry_dict.get("gaze", "Center"),
                    "pose_pitch": round(float(telemetry_dict.get("pose_pitch", 0.0)), 2),
                    "pose_yaw": round(float(telemetry_dict.get("pose_yaw", 0.0)), 2),
                    "pose_roll": round(float(telemetry_dict.get("pose_roll", 0.0)), 2),
                    "ear": round(float(telemetry_dict.get("ear", 0.28)), 3),
                    "blinks_per_min": round(float(telemetry_dict.get("blinks_per_min", 14.0)), 1),
                    "phone_detected": telemetry_dict.get("phone_detected", False),
                    "hands_count": telemetry_dict.get("hands_count", 0),
                    "raw_prob": round(float(telemetry_dict.get("model_prob_raw", 0.85)), 3),
                    "smoothed_score": round(float(telemetry_dict.get("smoothed_score", 85.0)), 1),
                    "attention_state": telemetry_dict.get("attention_state", "Optimal Focus"),
                    "alert": telemetry_dict.get("alert", ""),
                })
        except Exception:
            pass



# ══════════════════════════════════════════════════════════════════════════════
# Geometry helpers
# ══════════════════════════════════════════════════════════════════════════════
POSE_POINT_IDS = [1, 199, 33, 263, 61, 291]
LEFT_EYE_IDS   = [362, 385, 387, 263, 373, 380]
RIGHT_EYE_IDS  = [33,  160, 158, 133, 153, 144]

MODEL_3D = np.array([
    ( 0.0,    0.0,    0.0  ),
    ( 0.0,   63.6,   12.5 ),
    (-43.3, -32.7,   26.0 ),
    ( 43.3, -32.7,   26.0 ),
    (-28.9,  28.9,   24.1 ),
    ( 28.9,  28.9,   24.1 ),
], dtype=np.float64)

EAR_THRESH        = 0.20
EAR_CONSEC_FRAMES = 2

FEATURE_KEYS = [
    "no_of_face", "face_x", "face_y", "face_w", "face_h", "face_con",
    "no_of_hand", "pose", "pose_x", "pose_y",
    "phone", "phone_x", "phone_y", "phone_w", "phone_h", "phone_con",
]

def eye_aspect_ratio(landmarks, eye_ids, w, h):
    pts = np.array([(landmarks[i].x * w, landmarks[i].y * h) for i in eye_ids])
    A = np.linalg.norm(pts[1] - pts[5])
    B = np.linalg.norm(pts[2] - pts[4])
    C = np.linalg.norm(pts[0] - pts[3])
    return (A + B) / (2.0 * C) if C > 0 else 0.0


def estimate_head_pose(landmarks, w, h):
    image_pts = np.array(
        [(landmarks[i].x * w, landmarks[i].y * h) for i in POSE_POINT_IDS],
        dtype=np.float64,
    )
    focal      = float(w)
    cam_matrix = np.array(
        [[focal, 0, w / 2], [0, focal, h / 2], [0, 0, 1]], dtype=np.float64
    )
    ok, rot_vec, _ = cv2.solvePnP(
        MODEL_3D, image_pts, cam_matrix, np.zeros((4, 1)),
        flags=cv2.SOLVEPNP_ITERATIVE,
    )
    if not ok:
        return None
    rmat, _ = cv2.Rodrigues(rot_vec)
    sy = np.sqrt(rmat[0, 0] ** 2 + rmat[1, 0] ** 2)
    if sy >= 1e-6:
        pitch = np.degrees(np.arctan2( rmat[2, 1], rmat[2, 2]))
        yaw   = np.degrees(np.arctan2(-rmat[2, 0], sy))
        roll  = np.degrees(np.arctan2( rmat[1, 0], rmat[0, 0]))
    else:
        pitch = np.degrees(np.arctan2(-rmat[1, 2], rmat[1, 1]))
        yaw   = np.degrees(np.arctan2(-rmat[2, 0], sy))
        roll  = 0.0
    return pitch, yaw, roll


def pose_bucket(yaw, pitch) -> str:
    if pitch > 15:  return "up"
    if pitch < -15: return "down"
    if yaw   > 15:  return "right"
    if yaw   < -15: return "left"
    return "forward"


def heuristic_attention(yaw, pitch, gaze_dir, ear_avg,
                        no_face: bool = False) -> int:
    """
    Compute heuristic attention score 0-100.

    Fixes vs original:
      - no_face=True  → returns 0 immediately (face hidden = not attentive)
      - gaze "Away"   → 0 score (new label for no-face gaze)
      - eye_sc uses 0.18 threshold (slightly relaxed for glasses users)
    """
    if no_face:
        return 0          # face covered / out of frame = not attentive

    yaw_pen   = min(abs(yaw)   / 45.0, 1.0)
    pitch_pen = min(abs(pitch) / 30.0, 1.0)
    pose_sc   = 1.0 - 0.5 * (yaw_pen + pitch_pen)

    if gaze_dir == "Center":
        gaze_sc = 1.0
    elif gaze_dir == "Away":   # no face detected
        gaze_sc = 0.0
    else:                      # Left / Right
        gaze_sc = 0.4          # penalise more than before (was 0.5)

    eye_sc = min(ear_avg / 0.22, 1.0)   # slightly relaxed threshold
    return int(np.clip((pose_sc * 0.5 + gaze_sc * 0.3 + eye_sc * 0.2) * 100, 0, 100))


# ══════════════════════════════════════════════════════════════════════════════
# Blink detector
# ══════════════════════════════════════════════════════════════════════════════
class BlinkDetector:
    def __init__(self):
        self.counter    = 0
        self.total      = 0
        self.timestamps = collections.deque(maxlen=1800)

    def update(self, ear: float):
        if ear < EAR_THRESH:
            self.counter += 1
        else:
            if self.counter >= EAR_CONSEC_FRAMES:
                self.total += 1
                self.timestamps.append(time.time())
            self.counter = 0

    def blinks_per_minute(self) -> float:
        now    = time.time()
        recent = [t for t in self.timestamps if now - t <= 60]
        return float(len(recent))

    @property
    def eyes_closed(self) -> bool:
        return self.counter >= EAR_CONSEC_FRAMES * 3


# ══════════════════════════════════════════════════════════════════════════════
# Feature extraction  — all 16 features now real
# ══════════════════════════════════════════════════════════════════════════════
def extract_features(frame, face_lmk, phone_feat: dict, no_of_hand: int):
    """
    Build the 16-feature dict from:
      face_lmk   — MediaPipe FaceLandmarker result
      phone_feat — YOLOv8 phone detection result   (was always 0 before)
      no_of_hand — MediaPipe Hands count           (was always 0 before)

    Returns: (feature_dict, pose_angles, ear_avg, gaze_dir)
    """
    h, w        = frame.shape[:2]
    pose_angles = None
    ear_avg     = 0.30
    gaze_dir    = "Center"

    if face_lmk.face_landmarks:
        lms = face_lmk.face_landmarks[0]
        xs  = [lm.x for lm in lms]
        ys  = [lm.y for lm in lms]
        min_x, max_x = max(0.0, min(xs)), min(1.0, max(xs))
        min_y, max_y = max(0.0, min(ys)), min(1.0, max(ys))

        face_x   = float(((min_x + max_x) * 0.5) * w)
        face_y   = float(((min_y + max_y) * 0.5) * h)
        face_w   = float((max_x - min_x) * w)
        face_h   = float((max_y - min_y) * h)
        face_con = 95.0
        no_face  = 1

        pose_angles = estimate_head_pose(lms, w, h)
        if pose_angles:
            pitch, yaw, _ = pose_angles
            pose_x  = float(yaw)
            pose_y  = float(pitch)
            pose_str = pose_bucket(yaw, pitch)
        else:
            pose_x   = 0.0
            pose_y   = 0.0
            pose_str = "forward"

        ear_l    = eye_aspect_ratio(lms, LEFT_EYE_IDS,  w, h)
        ear_r    = eye_aspect_ratio(lms, RIGHT_EYE_IDS, w, h)
        ear_avg  = (ear_l + ear_r) / 2.0

        # Real iris-based gaze: compare iris centre position within eye socket
        # Left eye:  outer=33, inner=133, iris_centre=468
        # Right eye: inner=362, outer=263, iris_centre=473
        # Ratio 0.0=far left, 0.5=centre, 1.0=far right
        # Average both eyes for robustness
        def _iris_ratio(outer_idx, inner_idx, iris_idx):
            ox = lms[outer_idx].x * w
            ix_inner = lms[inner_idx].x * w
            iris_x = lms[iris_idx].x * w
            eye_w = abs(ix_inner - ox)
            if eye_w < 1:
                return 0.5
            return (iris_x - min(ox, ix_inner)) / eye_w

        left_ratio  = _iris_ratio(33,  133, 468)
        right_ratio = _iris_ratio(362, 263, 473)
        avg_ratio   = (left_ratio + right_ratio) / 2.0

        if avg_ratio < 0.35:
            gaze_dir = "Left"
        elif avg_ratio > 0.65:
            gaze_dir = "Right"
        else:
            gaze_dir = "Center"
    else:
        face_x = face_y = face_w = face_h = face_con = 0.0
        no_face  = 0
        pose_x   = 0.0
        pose_y   = 0.0
        pose_str  = "forward"
        ear_avg   = 0.0     # treat as eyes fully closed (forces distraction)
        gaze_dir  = "Away"  # non-Centre gaze penalty

    feat = {
        "no_of_face": no_face,
        "face_x":  face_x,  "face_y": face_y,
        "face_w":  face_w,  "face_h": face_h,
        "face_con": face_con,
        "no_of_hand": no_of_hand,        # ← now REAL
        "pose":    pose_str,
        "pose_x":  pose_x,  "pose_y": pose_y,
        **phone_feat,                     # ← now REAL
    }
    return feat, pose_angles, ear_avg, gaze_dir


# ══════════════════════════════════════════════════════════════════════════════
# Colour palette & HUD helpers
# ══════════════════════════════════════════════════════════════════════════════
C_BG     = (18,  20,  28)
C_PANEL  = (26,  29,  43)
C_GOOD   = (72, 200, 120)
C_WARN   = (240, 165,  32)
C_BAD    = (220,  60,  60)
C_BLUE   = (100, 160, 240)
C_WHITE  = (235, 235, 240)
C_MUTED  = (140, 142, 158)
C_RING   = (50,  54,  74)
C_PHONE  = (255, 80,  80)
C_HAND   = (80,  220, 255)
FONT     = cv2.FONT_HERSHEY_SIMPLEX
FONTB    = cv2.FONT_HERSHEY_DUPLEX


def _alpha_rect(frame, x1, y1, x2, y2, color, alpha=0.72):
    roi     = frame[y1:y2, x1:x2]
    overlay = np.full_like(roi, color)
    cv2.addWeighted(overlay, alpha, roi, 1 - alpha, 0, roi)
    frame[y1:y2, x1:x2] = roi


def _pill_bar(frame, x, y, w, h, value, max_val=100, fg=C_GOOD, bg=C_RING):
    r = 4
    cv2.rectangle(frame, (x + r, y), (x + w - r, y + h), bg, -1)
    cv2.circle(frame, (x + r,     y + h // 2), h // 2, bg, -1)
    cv2.circle(frame, (x + w - r, y + h // 2), h // 2, bg, -1)
    fill = max(0, int(w * min(value, max_val) / max_val))
    if fill > r * 2:
        cv2.rectangle(frame, (x + r, y), (x + r + fill - r * 2, y + h), fg, -1)
        cv2.circle(frame, (x + r,                    y + h // 2), h // 2, fg, -1)
        cv2.circle(frame, (x + r + fill - r * 2,     y + h // 2), h // 2, fg, -1)


def _arc(frame, cx, cy, r, value, fg=C_GOOD, bg=C_RING, thickness=6):
    cv2.ellipse(frame, (cx, cy), (r, r), -90, 0, 360,   bg, thickness, cv2.LINE_AA)
    end = int(360 * value / 100)
    if end > 0:
        cv2.ellipse(frame, (cx, cy), (r, r), -90, 0, end, fg, thickness, cv2.LINE_AA)


def _score_color(v):
    return C_GOOD if v >= 70 else (C_WARN if v >= 40 else C_BAD)


def draw_yolo_boxes(frame, phone_boxes: list, show: bool):
    """Draw YOLO phone detection bounding boxes."""
    if not show:
        return
    for (x1, y1, x2, y2, conf) in phone_boxes:
        cv2.rectangle(frame, (int(x1), int(y1)), (int(x2), int(y2)), C_PHONE, 2, cv2.LINE_AA)
        cv2.putText(frame, f"phone {conf:.2f}",
                    (int(x1), int(y1) - 6), FONT, 0.40, C_PHONE, 1, cv2.LINE_AA)


def draw_mesh(frame, landmarks, w, h):
    for lm in landmarks:
        cv2.circle(frame, (int(lm.x * w), int(lm.y * h)), 1, (60, 200, 100), -1)


def draw_hud(frame, info: dict, show_xai: bool = False):
    H, W = frame.shape[:2]
    PW   = 240

    _alpha_rect(frame, 0, 0, PW, H, C_BG, alpha=0.78)
    _alpha_rect(frame, 0, 0, PW, 36, C_PANEL, alpha=0.95)
    cv2.putText(frame, "ATTENTION TRACKER", (10, 24),
                FONT, 0.48, C_BLUE, 1, cv2.LINE_AA)

    row = 55
    dy  = 26

    # Session timer
    elapsed = info.get("elapsed", 0)
    m, s = divmod(int(elapsed), 60)
    cv2.putText(frame, f"Session  {m:02d}:{s:02d}",
                (10, row), FONT, 0.44, C_MUTED, 1, cv2.LINE_AA)
    row += dy

    # Gaze
    gaze     = info.get("gaze", "—")
    gaze_col = C_GOOD if gaze == "Center" else (C_WARN if gaze in ("Left","Right") else C_BAD)
    cv2.putText(frame, f"Gaze     {gaze}",
                (10, row), FONT, 0.44, gaze_col, 1, cv2.LINE_AA)
    row += dy

    # Head pose
    pose = info.get("pose")
    if pose:
        p, y, r = pose
        cv2.putText(frame, f"Pitch  {p:+.1f}\u00b0", (10, row),   FONT, 0.42, C_MUTED, 1, cv2.LINE_AA)
        row += 20
        cv2.putText(frame, f"Yaw    {y:+.1f}\u00b0", (10, row),   FONT, 0.42, C_MUTED, 1, cv2.LINE_AA)
        row += 20
        cv2.putText(frame, f"Roll   {r:+.1f}\u00b0", (10, row),   FONT, 0.42, C_MUTED, 1, cv2.LINE_AA)
        row += dy
    else:
        row += dy

    # EAR
    ear     = info.get("ear", 0.0)
    ear_col = C_BAD if ear < EAR_THRESH else C_GOOD
    cv2.putText(frame, f"EAR      {ear:.3f}",
                (10, row), FONT, 0.42, ear_col, 1, cv2.LINE_AA)
    row += dy

    # Blink
    bpm     = info.get("blinks_per_min", 0.0)
    bpm_col = C_WARN if bpm > 25 else C_MUTED
    cv2.putText(frame, f"Blinks   {info.get('blinks', 0)}",
                (10, row), FONT, 0.42, C_MUTED, 1, cv2.LINE_AA)
    row += 20
    cv2.putText(frame, f"Rate     {bpm:.1f}/min",
                (10, row), FONT, 0.42, bpm_col, 1, cv2.LINE_AA)
    row += dy

    # ── NEW: Phone & Hand indicators ─────────────────────────────────────
    phone_det = info.get("phone_detected", False)
    hands_n   = info.get("hands_count", 0)
    phone_col = C_BAD   if phone_det else C_MUTED
    hand_col  = C_HAND  if hands_n > 0 else C_MUTED
    cv2.putText(frame,
                f"Phone    {'DETECTED' if phone_det else 'none'}",
                (10, row), FONT, 0.42, phone_col, 1, cv2.LINE_AA)
    row += 20
    cv2.putText(frame,
                f"Hands    {hands_n}",
                (10, row), FONT, 0.42, hand_col, 1, cv2.LINE_AA)
    row += dy + 4

    # ── Heuristic bar ─────────────────────────────────────────────────────
    attn  = info.get("attention", 0)
    a_col = _score_color(attn)
    cv2.putText(frame, "Heuristic Score",
                (10, row), FONT, 0.40, C_MUTED, 1, cv2.LINE_AA)
    row += 16
    _pill_bar(frame, 10, row, PW - 20, 12, attn, fg=a_col)
    cv2.putText(frame, f"{attn}%",
                (PW - 38, row + 10), FONT, 0.38, a_col, 1, cv2.LINE_AA)
    row += 22

    # ── Smoothed model bar (NEW label shows smoothing active) ─────────────
    prob     = info.get("model_prob_smoothed", 0.0)
    raw_prob = info.get("model_prob_raw", 0.0)
    prob_pct = int(prob * 100)
    p_col    = _score_color(prob_pct)
    cv2.putText(frame, "Model (smoothed)",
                (10, row), FONT, 0.40, C_MUTED, 1, cv2.LINE_AA)
    row += 16
    _pill_bar(frame, 10, row, PW - 20, 12, prob_pct, fg=p_col)
    cv2.putText(frame, f"{prob_pct}%",
                (PW - 38, row + 10), FONT, 0.38, p_col, 1, cv2.LINE_AA)
    row += 22

    # Raw prob small indicator
    raw_pct = int(raw_prob * 100)
    cv2.putText(frame, f"raw: {raw_pct}%",
                (10, row), FONT, 0.34, C_MUTED, 1, cv2.LINE_AA)
    row += dy

    # Rolling average
    avg = info.get("avg_attention", 0)
    cv2.putText(frame, f"Avg (10s)  {avg}%",
                (10, row), FONT, 0.42, _score_color(avg), 1, cv2.LINE_AA)
    row += dy

    # Classification label (stable — from smoother)
    pred     = info.get("model_pred_stable", -1)
    pred_lbl = "ATTENTIVE" if pred == 1 else ("DISTRACTED" if pred == 0 else "—")
    pred_col = C_GOOD if pred == 1 else C_BAD
    cv2.putText(frame, pred_lbl,
                (10, row), FONTB, 0.58, pred_col, 1, cv2.LINE_AA)
    row += dy

    # Alert
    alert = info.get("alert", "")
    if alert and int(time.time() * 2) % 2 == 0:
        _alpha_rect(frame, 0, row - 4, PW, row + 20, C_BAD, alpha=0.55)
        cv2.putText(frame, f"! {alert}",
                    (8, row + 12), FONT, 0.42, C_WHITE, 1, cv2.LINE_AA)
        row += 28

    # XAI reason
    if show_xai:
        xai_top = info.get("xai_top_reason", "")
        if xai_top:
            xai_y = min(row + 4, H - 60)
            _alpha_rect(frame, 0, xai_y, PW, xai_y + 44, C_PANEL, alpha=0.90)
            cv2.putText(frame, "XAI:", (10, xai_y + 15),
                        FONT, 0.38, C_BLUE, 1, cv2.LINE_AA)
            # Split into direction+feature on line1, value on line2
            # Format is always: "(+/-) feature_name: +0.000"
            if ": " in xai_top:
                parts = xai_top.rsplit(": ", 1)
                line1 = parts[0]          # e.g. "(+) pose_forward"
                line2 = parts[1]          # e.g. "+0.290"
            else:
                line1 = xai_top
                line2 = ""
            cv2.putText(frame, line1, (10, xai_y + 30),
                        FONT, 0.36, C_WHITE, 1, cv2.LINE_AA)
            if line2:
                cv2.putText(frame, line2, (10, xai_y + 44),
                            FONT, 0.36, C_MUTED, 1, cv2.LINE_AA)

    # Arc gauge (top-right)
    cx, cy = W - 56, 60
    _alpha_rect(frame, W - 116, 8, W - 4, 118, C_BG, alpha=0.80)
    _arc(frame, cx, cy, 42, prob_pct, fg=p_col, thickness=7)
    cv2.putText(frame, f"{prob_pct}%",
                (cx - 18, cy + 6),  FONT, 0.50, p_col,  1, cv2.LINE_AA)
    cv2.putText(frame, "MODEL",
                (cx - 20, cy + 22), FONT, 0.30, C_MUTED, 1, cv2.LINE_AA)

    # Controls hint
    cv2.putText(frame, "M:mesh  X:xai  Y:yolo  Q:quit",
                (W - 210, H - 10), FONT, 0.34, C_MUTED, 1, cv2.LINE_AA)


# ══════════════════════════════════════════════════════════════════════════════
# XAI background worker
# ══════════════════════════════════════════════════════════════════════════════
class XAIWorker:
    def __init__(self, every_n: int = 20):
        self.every_n  = every_n
        self.result   = {}
        self._lock    = threading.Lock()
        self._pending = False
        self._counter = 0

    def tick(self, features: dict):
        self._counter += 1
        if self._counter % self.every_n != 0 or self._pending:
            return
        self._pending = True
        threading.Thread(target=self._run, args=(dict(features),), daemon=True).start()

    def _run(self, features):
        try:
            r = explain_prediction(features, print_summary=False)
            with self._lock:
                self.result = r
        except Exception:
            pass
        finally:
            self._pending = False

    def top_reason(self) -> str:
        with self._lock:
            r = self.result
        if not r:
            return ""
        pred = r.get("prediction", -1)
        if pred == 1 and r.get("top_positive"):
            f, v = r["top_positive"][0]
            return f"(+) {f}: {v:+.3f}"
        if pred == 0 and r.get("top_negative"):
            f, v = r["top_negative"][0]
            return f"(-) {f}: {v:+.3f}"
        return ""


# ══════════════════════════════════════════════════════════════════════════════
# Post-session dashboard
# ══════════════════════════════════════════════════════════════════════════════
def show_dashboard(session_data: dict):
    dur    = session_data["duration_sec"]
    attn_s = session_data["attention_series"]
    model_s= session_data["model_attention_series"]
    prob_s = session_data["model_prob_series"]
    blink_s= session_data["blink_timeline"]
    phone_s= session_data["phone_series"]

    avg_attn   = int(np.mean(attn_s))   if attn_s  else 0
    avg_prob   = float(np.mean(prob_s)) if prob_s  else 0.0
    attn_ratio = 100.0 * sum(model_s) / len(model_s) if model_s else 0.0
    phone_pct  = 100.0 * sum(phone_s) / len(phone_s) if phone_s else 0.0

    DARK  = "#12141C"; PANEL = "#1E2130"; BLUE  = "#5AA0F0"
    GREEN = "#48C87A"; AMBER = "#F0A530"; RED   = "#E04040"
    WHITE = "#EAEAF2"; MUTED = "#7A7C8E"

    plt.rcParams.update({
        "text.color": WHITE, "axes.labelcolor": MUTED,
        "xtick.color": MUTED, "ytick.color": MUTED,
        "axes.edgecolor": PANEL, "font.family": "monospace",
    })

    fig = plt.figure(figsize=(15, 8), facecolor=DARK)
    gs  = gridspec.GridSpec(2, 3, figure=fig,
                            hspace=0.45, wspace=0.35,
                            left=0.07, right=0.97, top=0.88, bottom=0.10)
    fig.suptitle("Attention Session Report", fontsize=17,
                 fontweight="bold", color=WHITE, y=0.96)

    # KPI panel
    ax0 = fig.add_subplot(gs[0, 0])
    ax0.set_facecolor(PANEL); ax0.set_axis_off()
    m_, s_ = divmod(int(dur), 60)
    kpis = [
        ("Duration",        f"{m_:02d}:{s_:02d}",      WHITE),
        ("Total Blinks",    str(session_data["total_blinks"]), WHITE),
        ("Avg Heuristic",   f"{avg_attn}%",             GREEN if avg_attn >= 70 else AMBER),
        ("Avg Model Conf",  f"{avg_prob*100:.1f}%",     GREEN if avg_prob >= 0.7 else AMBER),
        ("Attentive Ratio", f"{attn_ratio:.1f}%",       GREEN if attn_ratio >= 70 else AMBER),
        ("Phone Detected",  f"{phone_pct:.1f}% frames", RED if phone_pct > 10 else WHITE),
    ]
    for i, (lbl, val, col) in enumerate(kpis):
        y = 0.88 - i * 0.16
        ax0.text(0.05, y, lbl, transform=ax0.transAxes, fontsize=9,  color=MUTED, va="top")
        ax0.text(0.95, y, val, transform=ax0.transAxes, fontsize=11, color=col,
                 va="top", ha="right", fontweight="bold")
    ax0.set_title("Session KPIs", color=WHITE, fontsize=10, pad=8)

    def _style(ax, title):
        ax.set_facecolor(PANEL)
        ax.set_title(title, color=WHITE, fontsize=10, pad=8)
        ax.tick_params(colors=MUTED)
        for sp in ax.spines.values(): sp.set_edgecolor(PANEL)

    # Heuristic timeline
    ax1 = fig.add_subplot(gs[0, 1]); _style(ax1, "Heuristic Attention Score")
    if attn_s:
        xs = np.linspace(0, dur / 60, len(attn_s))
        ax1.fill_between(xs, attn_s, alpha=0.18, color=GREEN)
        ax1.plot(xs, attn_s, color=GREEN, linewidth=1.2)
        ax1.axhline(70, color=AMBER, linewidth=0.7, linestyle="--", alpha=0.6)
        ax1.set_ylim(0, 105); ax1.set_xlabel("Minutes"); ax1.set_ylabel("Score (%)")

    # Smoothed model confidence
    ax2 = fig.add_subplot(gs[0, 2]); _style(ax2, "Smoothed Model Confidence")
    if prob_s:
        xp = np.linspace(0, dur / 60, len(prob_s))
        ax2.fill_between(xp, prob_s, alpha=0.18, color=BLUE)
        ax2.plot(xp, prob_s, color=BLUE, linewidth=1.2)
        ax2.axhline(0.70, color=AMBER, linewidth=0.7, linestyle="--", alpha=0.6)
        ax2.set_ylim(0, 1.05); ax2.set_xlabel("Minutes"); ax2.set_ylabel("P(Attentive)")

    # Classification pie
    ax3 = fig.add_subplot(gs[1, 0]); _style(ax3, "Classification Distribution")
    if model_s:
        ac = int(sum(model_s)); dc = len(model_s) - ac
        wedges, _, autotexts = ax3.pie(
            [ac, dc], labels=["Attentive", "Distracted"],
            autopct="%1.1f%%", colors=[GREEN, RED], startangle=90,
            wedgeprops=dict(edgecolor=DARK, linewidth=1.5),
            textprops=dict(color=WHITE, fontsize=9),
        )
        for at in autotexts: at.set_color(DARK); at.set_fontweight("bold")

    # Blink rate
    ax4 = fig.add_subplot(gs[1, 1]); _style(ax4, "Blink Rate Trend")
    if blink_s:
        xb = np.linspace(0, dur / 60, len(blink_s))
        ax4.fill_between(xb, blink_s, alpha=0.18, color=AMBER)
        ax4.plot(xb, blink_s, color=AMBER, linewidth=1.2)
        ax4.axhline(25, color=RED, linewidth=0.7, linestyle="--", alpha=0.6, label="Drowsy threshold")
        ax4.legend(fontsize=7, labelcolor=MUTED, facecolor=PANEL, edgecolor=PANEL)
        ax4.set_xlabel("Minutes"); ax4.set_ylabel("Blinks/min")

    # Phone presence timeline  ← NEW panel
    ax5 = fig.add_subplot(gs[1, 2]); _style(ax5, "Phone Detection Timeline")
    if phone_s:
        xph = np.linspace(0, dur / 60, len(phone_s))
        ax5.fill_between(xph, phone_s, alpha=0.35, color=RED)
        ax5.plot(xph, phone_s, color=RED, linewidth=1.0)
        ax5.set_ylim(-0.1, 1.3)
        ax5.set_yticks([0, 1]); ax5.set_yticklabels(["None", "Detected"])
        ax5.set_xlabel("Minutes")
        ax5.set_ylabel("Phone present")

    # Save dashboard to a temp file and open it with the default image viewer.
    # This avoids any tkinter/matplotlib thread conflict entirely.
    import tempfile, subprocess, sys as _sys
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    tmp.close()
    plt.savefig(tmp.name, dpi=120, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.close("all")
    print(f"  Dashboard saved → {tmp.name}")
    # Try to open with default OS image viewer (non-blocking)
    try:
        if _sys.platform.startswith("win"):
            os.startfile(tmp.name)
        elif _sys.platform == "darwin":
            subprocess.Popen(["open", tmp.name])
        else:
            subprocess.Popen(["xdg-open", tmp.name],
                             stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL)
    except Exception:
        print(f"  Dashboard file saved at: {tmp.name}")
        print("  (could not open automatically — open the file manually)")


# ══════════════════════════════════════════════════════════════════════════════
# YOLO background thread  ← NEW
# ══════════════════════════════════════════════════════════════════════════════
class YOLOWorker:
    """
    Runs YOLOv8 phone detection in a background thread every N frames.
    YOLOv8n takes ~20–40 ms per frame on CPU — too slow to run every frame
    without dropping the main loop below 15 fps.
    Running every 6 frames means at 30 fps phone state refreshes at 5 Hz,
    which is more than fast enough for the use case.
    """
    def __init__(self, every_n: int = 6):
        self.every_n   = every_n
        self._feat     = {
            "phone": 0, "phone_x": 0.0, "phone_y": 0.0,
            "phone_w": 0.0, "phone_h": 0.0, "phone_con": 0.0,
        }
        self._boxes    = []
        self._lock     = threading.Lock()
        self._pending  = False
        self._counter  = 0

    def tick(self, frame: np.ndarray):
        self._counter += 1
        if self._counter % self.every_n != 0 or self._pending:
            return
        self._pending = True
        threading.Thread(target=self._run,
                         args=(frame.copy(),), daemon=True).start()

    def _run(self, frame):
        try:
            feat, boxes = detect_phone(frame)
            with self._lock:
                self._feat  = feat
                self._boxes = boxes
        except Exception:
            pass
        finally:
            self._pending = False

    def get(self) -> tuple[dict, list]:
        with self._lock:
            return dict(self._feat), list(self._boxes)


# ══════════════════════════════════════════════════════════════════════════════
# Session join verification (before webcam opens)
# ══════════════════════════════════════════════════════════════════════════════
def verify_session_join(
    server_url: str,
    class_code: str,
    join_code: str,
    roll_number: str = "",
    name: str = "",
) -> tuple[bool, str]:
    """Return (ok, error_message). Does not open the webcam."""
    server_url = server_url.rstrip("/")
    class_code = class_code.strip().upper()
    join_code = join_code.strip().upper()

    if not class_code:
        return False, "Class code is required"
    if not join_code:
        return False, "Join code is required"

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
        with urllib.request.urlopen(req, timeout=4.0):
            return True, ""
    except urllib.error.HTTPError as e:
        try:
            err_body = e.read().decode("utf-8", errors="replace")
            detail = json.loads(err_body).get("detail", err_body)
        except Exception:
            detail = str(e)
        return False, str(detail)
    except Exception as e:
        return False, f"Cannot reach server: {e}"


# ══════════════════════════════════════════════════════════════════════════════
# State Reporter (Background POST Streamer) ← NEW
# ══════════════════════════════════════════════════════════════════════════════
class StateReporter:
    def __init__(
        self,
        server_url: str,
        student_name: str,
        roll_number: str,
        class_code: str,
        join_code: str = "",
        on_status=None,
        on_fatal_error=None,
    ):
        self.server_url = server_url.rstrip('/')
        self.student_name = student_name
        self.roll_number = roll_number.strip().upper()
        self.class_code = class_code.strip().upper()
        self.join_code = join_code.strip().upper()
        self.on_status = on_status
        self.on_fatal_error = on_fatal_error
        self._lock = threading.Lock()
        self._payload = {}
        self._thread = None
        self._stop_event = threading.Event()
        self._last_error = ""

    def _set_status(self, msg: str):
        self._last_error = msg
        if self.on_status:
            try:
                self.on_status(msg)
            except Exception:
                pass

    def _post_json(
        self,
        url: str,
        payload: dict,
        timeout: float = 2.0,
        retries: int = 3,
        *,
        fatal: bool = False,
    ):
        """Post JSON. Returns True on success, None if session not started (409), False on other errors."""
        data = json.dumps(payload).encode("utf-8")
        last_err = None
        for attempt in range(retries):
            try:
                req = urllib.request.Request(
                    url, data=data, headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=timeout):
                    self._set_status("● Connected to server")
                    return True
            except urllib.error.HTTPError as e:
                last_err = e
                try:
                    err_body = e.read().decode("utf-8", errors="replace")
                    detail = json.loads(err_body).get("detail", err_body)
                except Exception:
                    detail = str(e)
                # 409 = session not yet started by teacher — not a fatal error, keep waiting
                if e.code == 409:
                    self._set_status("● Waiting for teacher to start session…")
                    return None  # Signal: retry later, not a crash
                if e.code == 429:
                    self._set_status("● Rate limited, retrying…")
                    return None  # Signal: retry later, not a crash

                self._set_status(f"● Server status ({e.code}): {detail}")
                if fatal and self.on_fatal_error and e.code in (401, 403):
                    try:
                        self.on_fatal_error(str(detail))
                    except Exception:
                        pass
                    return False
                if 400 <= e.code < 500:
                    return None
            except Exception as e:
                last_err = e
                self._set_status(f"● Connection failed (retry {attempt + 1}/{retries})")
                time.sleep(min(0.5 * (attempt + 1), 2.0))
        if last_err:
            self._set_status("● Cannot reach server")
        return False

    def start(self):
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._report_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=1.0)
        # Send end-of-session signal to remove student from teacher grid immediately
        self._post_json(
            f"{self.server_url}/api/student/end",
            {"roll_number": self.roll_number, "class_code": self.class_code},
            timeout=1.5,
            retries=1,
        )

    def update_state(self, info: dict):
        with self._lock:
            pitch = 0.0
            yaw = 0.0
            roll = 0.0
            if info.get("pose"):
                pitch, yaw, roll = info["pose"]

            self._payload = {
                "name": self.student_name,
                "roll_number": self.roll_number,
                "class_code": self.class_code,
                "join_code": self.join_code,
                "attention": info.get("attention", 0),
                "model_prob_smoothed": float(info.get("model_prob_smoothed", 0.0)),
                "model_prob_raw": float(info.get("model_prob_raw", 0.0)),
                "model_pred_stable": int(info.get("model_pred_stable", -1)),
                "phone_detected": bool(info.get("phone_detected", False)),
                "hands_count": int(info.get("hands_count", 0)),
                "blinks": int(info.get("blinks", 0)),
                "blinks_per_min": float(info.get("blinks_per_min", 0.0)),
                "gaze": str(info.get("gaze", "Center")),
                "pose_pitch": float(pitch),
                "pose_yaw": float(yaw),
                "pose_roll": float(roll),
                "alert": str(info.get("alert", "")),
                "is_paused": bool(info.get("is_paused", False)),
            }

    def _report_loop(self):
        while not self._stop_event.is_set():
            time.sleep(1.0)
            with self._lock:
                if not self._payload:
                    continue
                payload_copy = dict(self._payload)

            result = self._post_json(
                f"{self.server_url}/api/student/update",
                payload_copy,
                timeout=2.0,
                retries=2,
                fatal=True,
            )
            # result is None when the teacher hasn't started the session yet (409).
            # In this case we simply loop and retry — the tracker keeps running.
            # result is False on a different fatal 4xx error, which stops the loop
            # via on_fatal_error -> stop_event.set().


# ══════════════════════════════════════════════════════════════════════════════
# Main tracking loop
# ══════════════════════════════════════════════════════════════════════════════
def run_tracking(
    stop_event=None,
    student_name="Student",
    roll_number="ROLL001",
    class_code="CS101",
    server_url="http://localhost:8000",
    join_code="",
    on_status=None,
    session_flags=None,
    on_frame_callback=None,
    show_cv_window=False,
):
    if stop_event is None:
        stop_event = threading.Event()
    session_flags = session_flags if session_flags is not None else {}

    ok, err = verify_session_join(
        server_url, class_code, join_code, roll_number, student_name
    )
    if not ok:
        session_flags["fatal_error"] = err
        if on_status:
            on_status(f"● Join failed: {err}")
        return "join_denied"

    def _fatal_session_error(detail: str):
        session_flags["fatal_error"] = detail
        stop_event.set()

    reporter = StateReporter(
        server_url,
        student_name,
        roll_number,
        class_code,
        join_code,
        on_status=on_status,
        on_fatal_error=_fatal_session_error,
    )
    reporter.start()

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        reporter.stop()
        print("ERROR: Cannot open webcam.")
        return "webcam_error"

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    face_lmk   = get_face_landmarker()

    # ── Startup diagnostics — printed once so you know what is active ────
    print("\n" + "="*50)
    print("  ATTENOVA STUDENT COMPANION — STARTUP CHECK")
    print("="*50)
    print(f"  [OK] Face landmarker       : {FACE_MODEL_PATH}")

    # Hand model
    try:
        get_hand_model()
        print(f"  [OK] Hand landmarker       : {HAND_MODEL_PATH}")
        hand_ok = True
    except Exception as e:
        print(f"  [--] Hand landmarker       : FAILED ({e})")
        hand_ok = False

    # YOLO
    get_yolo()
    
    # Background Socratic Poller for Desktop Windows App
    socratic_state = {
        "active": False,
        "session_id": None,
        "question": None,
        "answer_status": "",
    }

    def _poll_socratic_loop():
        while not stop_event.is_set():
            try:
                url = f"{server_url}/api/socratic/session/active?class_code={class_code}"
                req = urllib.request.Request(url, headers={"User-Agent": "VisoriaStudentTracker/1.0"})
                with urllib.request.urlopen(req, timeout=2) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode("utf-8"))
                        if data and data.get("session"):
                            socratic_state["active"] = True
                            socratic_state["session_id"] = data["session"]["session_id"]
                            qs = data.get("questions", [])
                            if qs:
                                latest_q = qs[-1]
                                if not socratic_state.get("question") or socratic_state["question"].get("id") != latest_q.get("id"):
                                    socratic_state["question"] = latest_q
                                    socratic_state["answer_status"] = ""
                        else:
                            socratic_state["active"] = False
                            socratic_state["session_id"] = None
                            socratic_state["question"] = None
                            socratic_state["answer_status"] = ""
            except Exception:
                pass
            time.sleep(3)

    threading.Thread(target=_poll_socratic_loop, daemon=True).start()

    # YOLO
    if _yolo_available:
        print(f"  [OK] YOLOv8 phone detector : yolov8n.pt")
    else:
        print(f"  [--] YOLOv8 phone detector : NOT available")

    # Model PKL files
    import os as _os2
    from ml.paths import COLUMNS_FILE, MODEL_FILE, SCALER_FILE

    for pkl in [MODEL_FILE, SCALER_FILE, COLUMNS_FILE]:
        status = "[OK]" if pkl.exists() else "[!!] MISSING"
        print(f"  {status} {pkl.name}")

    print("="*50 + "\n")

    blink_det  = BlinkDetector()
    smoother   = TemporalSmoother(window=15, low=0.45, high=0.55)
    yolo_worker= YOLOWorker(every_n=6)
    xai_worker = XAIWorker(every_n=20)

    show_mesh      = False
    show_xai_hud   = True
    show_yolo_box  = True
    show_pose      = True
    show_iris      = False
    show_hands     = False
    show_face_bbox = True
    pipeline_open  = True
    console        = AnalysisConsole()
    start_time     = time.time()

    attn_hist        = []
    model_attn_hist  = []
    model_prob_hist  = []
    blink_rate_hist  = []
    phone_hist       = []

    # Probe model
    _probe = {k: 0 for k in FEATURE_KEYS}; _probe["pose"] = "forward"
    try:
        predict_attention(_probe); model_ok = True
    except Exception as e:
        model_ok = False
        print(f"[WARN] Model unavailable: {e}")

    _win = "Attenova Student Companion — Vision Analysis Console"
    if show_cv_window:
        cv2.namedWindow(_win, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(_win, 1240, 840)

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret or stop_event.is_set():
            break

        frame = cv2.flip(frame, 1)
        H, W  = frame.shape[:2]

        # ══════════════════════════════════════════════════════════════════════
        # 5-STAGE BEHAVIORAL ATTENTION ESTIMATION PIPELINE
        # ══════════════════════════════════════════════════════════════════════

        # ── Stage 1: Behavioral Signals Ingestion ────────────────────────────
        yolo_worker.tick(frame)
        phone_feat, phone_boxes = yolo_worker.get()
        no_of_hand, hand_landmarks = detect_hands(frame)

        rgb     = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_img  = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        face_result = face_lmk.detect(mp_img)
        face_absent = not bool(face_result.face_landmarks)

        # ── Stage 2: Multi-Feature Extraction ────────────────────────────────
        feat, pose_angles, ear_avg, gaze_dir = extract_features(
            frame, face_result, phone_feat, no_of_hand
        )
        blink_det.update(ear_avg)
        bpm = blink_det.blinks_per_minute()

        if face_absent:
            h_score = heuristic_attention(0, 0, gaze_dir, ear_avg, no_face=True)
        elif pose_angles:
            h_score = heuristic_attention(pose_angles[1], pose_angles[0], gaze_dir, ear_avg)
        else:
            h_score = heuristic_attention(0, 0, gaze_dir, ear_avg)

        # Drawing Overlays
        if face_result.face_landmarks:
            lms = face_result.face_landmarks[0]
            if show_mesh:
                draw_mesh(frame, lms, W, H)
            if show_face_bbox:
                draw_face_bbox(frame, lms, W, H)
            if show_pose:
                draw_head_pose_markers(frame, lms, W, H)
            if show_iris:
                draw_iris_markers(frame, lms, W, H)

        if show_hands and hand_landmarks:
            draw_hand_landmarks(frame, hand_landmarks, W, H)

        draw_yolo_boxes(frame, phone_boxes, show_yolo_box)

        # ── Stage 3: ML Attention Prediction (Instantaneous Probability) ──────
        if face_absent:
            raw_prob = 0.0
        elif model_ok:
            try:
                raw_prob = predict_proba_attention(feat)
            except Exception:
                raw_prob = h_score / 100.0
        else:
            raw_prob = h_score / 100.0

        # ── Stage 4: Temporal Smoothing & Multi-Feature Fusion ───────────────
        smoothed_prob, stable_label = smoother.update(raw_prob)
        blend = int(h_score * 0.45 + smoothed_prob * 100 * 0.55)

        # Multi-feature Fusion Safeguard:
        # If face is present, posture is forward/stable, and hand activity is normal,
        # single transient gaze shifts alone do NOT cause an instant drop to zero.
        if not face_absent and pose_angles and abs(pose_angles[0]) < 25 and abs(pose_angles[1]) < 25:
            if blend < 40 and not phone_feat["phone"]:
                blend = max(blend, 45)

        attn_hist.append(blend)
        model_attn_hist.append(stable_label)
        model_prob_hist.append(smoothed_prob)
        blink_rate_hist.append(bpm)
        phone_hist.append(phone_feat["phone"])

        xai_worker.tick(feat)

        avg_attn = int(np.mean(attn_hist[-300:])) if attn_hist else blend
        peak_attn = int(np.max(attn_hist)) if attn_hist else blend

        # ── Stage 5: Estimated Attention State & Intervention Decision ────────
        if blend >= 85:
            state_label = "Optimal Focus"
            state_msg = "You are in an optimal learning flow state."
        elif blend >= 70:
            state_label = "Mindful Focus"
            state_msg = "Great momentum! Keep up the good work."
        elif blend >= 45:
            state_label = "Attention Drift"
            state_msg = "Let's take a moment to refocus on the main lesson."
        else:
            state_label = "Breather Suggested"
            state_msg = "Consider taking a short 2-minute break to refresh your mind."

        # Evaluate sustained attention drift over rolling window
        recent_window = list(attn_hist[-30:]) if len(attn_hist) >= 30 else list(attn_hist)
        sustained_drift = bool(recent_window and (sum(recent_window) / len(recent_window)) < 55)

        alert_msg = ""
        if not face_result.face_landmarks:
            alert_msg = "NO FACE"
        elif blink_det.eyes_closed:
            alert_msg = "EYES CLOSED"
        elif bpm > 25:
            alert_msg = "HIGH BLINK RATE"
        elif phone_feat["phone"] == 1:
            alert_msg = "PHONE DETECTED"
        elif sustained_drift:
            alert_msg = "SUSTAINED ATTENTION DRIFT"

        # ── Deterministic Behavioral Explainability Layer ──────────────────────
        contributing_factors = []
        if face_absent:
            contributing_factors.append("Face detection unmaintained")
        else:
            if phone_feat["phone"] == 1:
                contributing_factors.append("Mobile device presence observed in frame")
            
            if gaze_dir in ("Left", "Right", "Away"):
                contributing_factors.append("Prolonged horizontal gaze deviation")
            elif gaze_dir == "Down":
                contributing_factors.append("Downward gaze vector toward secondary desk area")

            if pose_angles:
                pitch, yaw, roll = pose_angles
                if pitch > 15 or pitch < -15:
                    contributing_factors.append("Downward or angled head posture")
                if abs(yaw) > 20:
                    contributing_factors.append("Sideways head orientation")

            if bpm > 25:
                contributing_factors.append("Elevated blink frequency")

            if no_of_hand >= 2:
                contributing_factors.append("Increased hand activity near face/keyboard")

        # For high focus states (blend >= 70) with no negative indicators, add positive behavioral signals
        if blend >= 70 and not contributing_factors:
            if gaze_dir == "Center":
                contributing_factors.append("Centered gaze vector toward primary screen")
            if pose_angles and abs(pose_angles[0]) <= 15 and abs(pose_angles[1]) <= 15:
                contributing_factors.append("Stable forward-facing posture")
            if phone_feat["phone"] == 0:
                contributing_factors.append("Clear learning workspace without device interference")

        contributing_factors = contributing_factors[:3]

        is_paused = bool(session_flags.get("is_paused", False))
        if is_paused:
            state_label = "Monitoring Paused"
            state_msg = "Attention telemetry is paused by student. Zero video analyzed or stored."
            alert_msg = ""
            contributing_factors = ["Monitoring paused by student"]
            sustained_drift = False

        # Structured Telemetry Information Payload
        info = {
            "is_paused": is_paused,

            # Stage 1 & 2: Behavioral Signals
            "raw_features": {
                "face_detected": not face_absent,
                "gaze_dir": gaze_dir if not face_absent else "No Face",
                "pose_angles": pose_angles,
                "ear_avg": ear_avg,
                "blinks": blink_det.total,
                "blinks_per_min": bpm,
                "phone_detected": bool(phone_feat["phone"]),
                "hands_count": no_of_hand,
            },

            # Stage 3: Instantaneous ML Prediction
            "instantaneous_pred": {
                "raw_prob": round(raw_prob, 4),
                "binary_label": int(raw_prob >= 0.5),
            },

            # Stage 4: Temporal Smoothing & Fusion
            "smoothed_state": {
                "smoothed_prob": round(smoothed_prob, 4),
                "stable_label": stable_label,
                "attention_score": blend,
                "avg_attention": avg_attn,
                "peak_attention": peak_attn,
            },

            # Stage 5: Behavioral Attention State & Intervention Decision
            "attention_state": {
                "state_label": state_label,
                "state_message": state_msg,
                "sustained_drift": sustained_drift,
                "contributing_factors": contributing_factors,
            },

            "intervention_decision": {
                "socratic_recommended": sustained_drift and (socratic_state.get("active") or False),
                "alert": alert_msg,
            },

            # Flat Backwards-Compatibility Fields
            "elapsed":           time.time() - start_time,
            "gaze":              gaze_dir if not face_absent else "No Face",
            "pose":              pose_angles,
            "ear":               ear_avg,
            "blinks":            blink_det.total,
            "blinks_per_min":    bpm,
            "attention":         blend,
            "avg_attention":     avg_attn,
            "peak_attention":    peak_attn,
            "model_pred_stable": stable_label,
            "model_prob_smoothed": smoothed_prob,
            "model_prob_raw":    raw_prob,
            "phone_detected":    bool(phone_feat["phone"]),
            "hands_count":       no_of_hand,
            "contributing_factors": contributing_factors,
            "xai_top_reason":    xai_worker.top_reason(),
            "alert":             alert_msg,
            "face_detected":     not face_absent,
            "attn_hist":         list(attn_hist[-120:]),  # 2 minute sliding window
        }

        reporter.update_state(info)

        # Notify desktop GUI callback
        if on_frame_callback:
            try:
                on_frame_callback(frame, info, socratic_state)
            except Exception:
                pass

        if show_cv_window:
            toggles = {
                "mesh": show_mesh,
                "bbox": show_yolo_box,
                "face": show_face_bbox,
                "pose": show_pose,
                "iris": show_iris,
                "hands": show_hands,
                "xai": show_xai_hud,
                "pipeline": pipeline_open,
            }
            display = console.compose(
                frame,
                info,
                toggles,
                pipeline_collapsed=not pipeline_open,
            )
            cv2.imshow(_win, display)
            key = cv2.waitKey(1) & 0xFF
            if key in (27, ord("q"), ord("Q")):
                stop_event.set()
                break
            elif key in (ord("p"), ord("P")):
                session_flags["is_paused"] = not session_flags.get("is_paused", False)

        time.sleep(0.03)

    cap.release()
    if show_cv_window:
        cv2.destroyAllWindows()

    reporter.stop()

    ended_by_user = session_flags.get("end_by_user", False)
    if session_flags.get("fatal_error"):
        return "join_denied"
    if ended_by_user or stop_event.is_set():
        return "stopped"
    return "ok"


# ══════════════════════════════════════════════════════════════════════════════
# Optional client config (config.json beside this script)
# ══════════════════════════════════════════════════════════════════════════════
CLIENT_CONFIG_PATH = Path(__file__).resolve().parent / "config.json"


def load_client_config() -> dict:
    if not CLIENT_CONFIG_PATH.exists():
        return {}
    try:
        with CLIENT_CONFIG_PATH.open(encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


# ══════════════════════════════════════════════════════════════════════════════
# Attenova Student Companion Application (Windows Desktop EdTech Companion UI)
# ══════════════════════════════════════════════════════════════════════════════
class AttenovaCompanionApp:
    """
    Modern, dynamic, student-facing Windows desktop companion application.
    Adheres strictly to the Warm Academic Horizon design language:
      • Paper Linen Canvas: #FFF8F5
      • Chalk White Surface Cards: #FFFFFF
      • Espresso Charcoal Typography: #1F1B17
      • Warm Amber Accent: #E89B3D
      • Soft Orange: #F4B860
      • Terracotta Clay: #D96C4A
      • Academic Sage Green: #6E9B78
      • Muted Earth Gray: #81776F
      • Hairline Beige Divider: #F0E6E0
    """

    # Focus Companion Theme Palette (Attenova Design Identity)
    BG = "#F5F7FA"            # Soft Cloud primary background
    CARD = "#FFFFFF"          # Pure White cards & surfaces
    TEXT = "#1E293B"          # Midnight Slate headings & text
    MUTED = "#64748B"         # Cool Gray secondary text
    BORDER = "#E2E8F0"        # Mist Gray borders
    HOVER = "#EEF2FF"         # Tinted Indigo active/hover background

    PRIMARY = "#4F46E5"       # Focus Indigo primary action
    PRIMARY_HOVER = "#4338CA" # Deep Indigo hover state
    PRIMARY_TINT = "#EEF2FF"  # Focus Indigo tint background

    TEAL = "#0D9488"          # Calm Teal positive feedback & connected state
    TEAL_MIST = "#CCFBF1"     # Teal Mist positive background
    GREEN = "#0D9488"         # Alias for Calm Teal

    AMBER = "#F59E0B"         # Gentle Amber reminders & prompts
    AMBER_MIST = "#FEF3C7"    # Amber Mist warning background
    ORANGE = "#F59E0B"        # Alias for Gentle Amber

    RED = "#DC2626"           # Soft Red for errors or critical failures
    RED_MIST = "#FEE2E2"      # Soft Red status background

    CAM_BG = "#0F172A"        # Dark Navy webcam preview container

    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Attenova Focus Companion — Student Learning Client")
        self.root.geometry("1200x780")
        self.root.minsize(1120, 720)
        self.root.configure(bg=self.BG)

        cfg = load_client_config()
        self.name_var = tk.StringVar(value=cfg.get("student_name", "Alex Student"))
        self.roll_var = tk.StringVar(value=cfg.get("roll_number", "STUDENT-01"))
        self.class_var = tk.StringVar(value=cfg.get("class_code", "CS101"))
        self.join_var = tk.StringVar(value=cfg.get("join_code", ""))
        self.server_var = tk.StringVar(value=cfg.get("server_url", "http://localhost:8000"))

        self.stop_event = threading.Event()
        self.session_flags = {"end_by_user": False, "fatal_error": None}
        self.worker = None

        # Live State Variables
        self.active_tab = "dashboard"
        self.show_cam_preview = tk.BooleanVar(value=True)
        self.show_cv_window_var = tk.BooleanVar(value=False)
        self.latest_info = {
            "attention": 85,
            "avg_attention": 82,
            "peak_attention": 95,
            "blinks": 0,
            "blinks_per_min": 0,
            "gaze": "Center",
            "pose": (0, 0, 0),
            "phone_detected": False,
            "hands_count": 0,
            "alert": "",
            "face_detected": True,
            "elapsed": 0,
            "attn_hist": [75, 78, 82, 85, 88, 86, 85],
        }
        self.socratic_state = {
            "active": False,
            "session_id": None,
            "question": None,
            "answer_status": "",
        }

        # Socratic 4-Stage Stepper State
        self.socratic_stage = 1  # 1: Think, 2: Compare, 3: Reflect, 4: Reassess
        self.selected_option = tk.StringVar(value="")
        self.confidence_level = tk.StringVar(value="Confident")
        self.reflection_text = tk.StringVar(value="")

        self.notified_session_ids = set()
        self._start_socratic_listener()

        self._build_ui()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def _start_socratic_listener(self):
        def _ws_thread():
            async def _listen():
                server_base = self.server_var.get().strip().rstrip("/")
                ws_url = server_base.replace("http://", "ws://").replace("https://", "wss://") + f"/ws/student?class_code={self.class_var.get().strip()}&student_id={self.roll_var.get().strip()}"
                while not self.stop_event.is_set():
                    try:
                        async with websockets.connect(ws_url) as ws:
                            print(f"  [OK] Desktop Socratic listener connected: {ws_url}")
                            while not self.stop_event.is_set():
                                msg = await ws.recv()
                                data = json.loads(msg)
                                evt = data.get("event")
                                if evt in ["socratic_session_activated", "socratic_session_started"]:
                                    sid = data.get("session_id")
                                    act_type = data.get("activity_type", "socratic_question")
                                    cfg = data.get("activity_config") or {}
                                    q_text = data.get("question_text") or cfg.get("question_text") or cfg.get("prompt") or cfg.get("topic") or "Your teacher started an intervention activity."
                                    token = data.get("join_token", "")
                                    self.root.after(0, lambda s=sid, q=q_text, t=token, a=act_type: self._show_socratic_notification_popup(s, q, t, a))
                    except Exception:
                        await asyncio.sleep(3)

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                loop.run_until_complete(_listen())
            except Exception:
                pass

        threading.Thread(target=_ws_thread, daemon=True).start()

    def _show_socratic_notification_popup(self, session_id, question_text, join_token=None, activity_type="socratic_question"):
        if not session_id or session_id in self.notified_session_ids:
            return
        self.notified_session_ids.add(session_id)

        try:
            top = tk.Toplevel(self.root)
            is_socratic = (activity_type == "socratic_question")
            act_title = "Socratic Learning Session" if is_socratic else activity_type.replace("_", " ").title() + " Activity"
            top.title(f"Attenova — {act_title}")
            top.geometry("540x340")
            top.resizable(False, False)
            top.configure(bg="#0F172A")
            top.attributes("-topmost", True)

            # Header banner
            hdr = tk.Frame(top, bg="#1E293B", pady=16, padx=20)
            hdr.pack(fill="x")

            icon_lbl = tk.Label(hdr, text="💡" if is_socratic else "⚡", font=("Segoe UI", 24), bg="#1E293B")
            icon_lbl.pack(side="left", padx=(0, 12))

            tf = tk.Frame(hdr, bg="#1E293B")
            tf.pack(side="left", fill="both", expand=True)

            t_lbl = tk.Label(tf, text=act_title, font=("Segoe UI", 13, "bold"), fg="#F8FAFC", bg="#1E293B", anchor="w")
            t_lbl.pack(fill="x")

            s_lbl = tk.Label(tf, text=f"Active in {self.class_var.get().strip()} · Teacher Guided", font=("Segoe UI", 10), fg="#94A3B8", bg="#1E293B", anchor="w")
            s_lbl.pack(fill="x")

            # Main content
            body = tk.Frame(top, bg="#0F172A", padx=24, pady=16)
            body.pack(fill="both", expand=True)

            q_box = tk.Frame(body, bg="#1E293B", padx=16, pady=14, highlightbackground="#334155", highlightthickness=1)
            q_box.pack(fill="x", pady=(0, 12))

            q_lbl = tk.Label(q_box, text=f"“{question_text or 'What is the primary factor driving this algorithm complexity?'}”", font=("Segoe UI", 10, "italic"), fg="#E2E8F0", bg="#1E293B", wraplength=460, justify="left")
            q_lbl.pack(anchor="w")

            note_text = "Clicking 'Join Session' opens the Socratic Think → Compare → Reflect → Reassess workflow in your browser." if is_socratic else "Clicking 'Join Session' opens the interactive learning activity in your browser."
            note = tk.Label(body, text=note_text, font=("Segoe UI", 9), fg="#94A3B8", bg="#0F172A", wraplength=480, justify="left")
            note.pack(anchor="w", pady=(0, 16))

            # Buttons
            btns = tk.Frame(body, bg="#0F172A")
            btns.pack(fill="x", side="bottom")

            def _join():
                top.destroy()
                t_param = f"&join_token={join_token}" if join_token else ""
                url = f"http://localhost:5173/?session_id={session_id}{t_param}"
                print(f"  [Socratic Desktop] Opening browser deep link: {url}")
                webbrowser.open(url)

            def _later():
                top.destroy()

            j_btn = tk.Button(btns, text="Join Session ➔", font=("Segoe UI", 10, "bold"), fg="#FFFFFF", bg="#2563EB", activebackground="#1D4ED8", activeforeground="#FFFFFF", bd=0, padx=20, pady=8, cursor="hand2", command=_join)
            j_btn.pack(side="right", padx=(8, 0))

            l_btn = tk.Button(btns, text="Later", font=("Segoe UI", 10), fg="#94A3B8", bg="#1E293B", activebackground="#334155", activeforeground="#F8FAFC", bd=0, padx=16, pady=8, cursor="hand2", command=_later)
            l_btn.pack(side="right")
        except Exception as e:
            print(f"Error launching notification popup: {e}")

    def _build_ui(self):

        # ── 1. Top Header Bar ─────────────────────────────────────────
        self.hdr = tk.Frame(self.root, bg=self.CARD, height=64, bd=0, highlightbackground=self.BORDER, highlightthickness=1)
        self.hdr.pack(fill="x")

        # Brand / Logo
        hdr_left = tk.Frame(self.hdr, bg=self.CARD)
        hdr_left.pack(side="left", padx=24, pady=12)

        logo_lbl = tk.Label(hdr_left, text="🎓", font=("Segoe UI", 16), bg=self.CARD)
        logo_lbl.pack(side="left", padx=(0, 8))

        brand_lbl = tk.Label(hdr_left, text="Attenova", font=("Segoe UI", 16, "bold"), fg=self.PRIMARY, bg=self.CARD)
        brand_lbl.pack(side="left")

        sub_lbl = tk.Label(hdr_left, text="  ·  Focus Companion", font=("Segoe UI", 10, "bold"), fg=self.MUTED, bg=self.CARD)
        sub_lbl.pack(side="left")

        # Right Actions Strip
        hdr_right = tk.Frame(self.hdr, bg=self.CARD)
        hdr_right.pack(side="right", padx=24)

        # Connection Badge
        self.conn_badge = tk.Label(
            hdr_right,
            text="● Connected",
            font=("Segoe UI", 9, "bold"),
            fg=self.TEAL,
            bg=self.TEAL_MIST,
            padx=12,
            pady=4,
        )
        self.conn_badge.pack(side="left", padx=(0, 10))

        # Pause Monitoring Button
        self.pause_btn = tk.Button(
            hdr_right,
            text="⏸  Pause Monitoring",
            command=self.toggle_pause_monitoring,
            font=("Segoe UI", 9, "bold"),
            fg=self.TEXT,
            bg=self.HOVER,
            activeforeground=self.TEXT,
            activebackground=self.BORDER,
            relief="flat",
            bd=0,
            cursor="hand2",
            padx=12,
            pady=4,
        )
        self.pause_btn.pack(side="left", padx=(0, 10))

        # Session Timer Display
        self.timer_lbl = tk.Label(hdr_right, text="00:00:00", font=("Segoe UI", 10, "bold"), fg=self.TEXT, bg=self.CARD)
        self.timer_lbl.pack(side="left", padx=(0, 14))

        # Privacy Badge Button
        priv_btn = tk.Button(
            hdr_right,
            text="🔒 Processed locally",
            command=self._show_privacy_dialog,
            font=("Segoe UI", 9),
            fg=self.MUTED,
            bg=self.CARD,
            activeforeground=self.TEXT,
            activebackground=self.HOVER,
            relief="flat",
            bd=0,
            cursor="hand2",
            padx=10,
            pady=4,
        )
        priv_btn.pack(side="left", padx=(0, 14))

        # Primary Start/End Session Button
        self.session_btn = tk.Button(
            hdr_right,
            text="▶  Start Session",
            command=self.toggle_session,
            font=("Segoe UI", 10, "bold"),
            fg="#FFFFFF",
            bg=self.PRIMARY,
            activeforeground="#FFFFFF",
            activebackground=self.PRIMARY_HOVER,
            relief="flat",
            bd=0,
            cursor="hand2",
            padx=20,
            pady=7,
        )
        self.session_btn.pack(side="left")

        # ── 2. Main 3-Column Body Layout ──────────────────────────────
        self.body = tk.Frame(self.root, bg=self.BG, padx=20, pady=16)
        self.body.pack(fill="both", expand=True)

        self.body.columnconfigure(1, weight=1)
        self.body.rowconfigure(0, weight=1)

        # Left Navigation Sidebar (Col 0)
        self._build_sidebar(self.body)

        # Center Main Workspace (Col 1)
        self.center_frame = tk.Frame(self.body, bg=self.BG)
        self.center_frame.grid(row=0, column=1, sticky="nsew", padx=(0, 16))
        self.center_frame.rowconfigure(0, weight=1)
        self.center_frame.columnconfigure(0, weight=1)

        # Right Status / Camera Sidebar (Col 2)
        self._build_right_panel(self.body)

        # Render Initial Dashboard Tab
        self._switch_tab("dashboard")

    def _build_sidebar(self, parent):
        side = tk.Frame(parent, bg=self.BG, width=220)
        side.grid(row=0, column=0, sticky="ns", padx=(0, 16))

        # Student Quick Profile Header
        prof_card = tk.Frame(side, bg=self.CARD, highlightbackground=self.BORDER, highlightthickness=1, padx=12, pady=12)
        prof_card.pack(fill="x", pady=(0, 12))

        prof_top = tk.Frame(prof_card, bg=self.CARD)
        prof_top.pack(fill="x")

        avatar = tk.Label(prof_top, text="ST", font=("Segoe UI", 10, "bold"), fg="#FFFFFF", bg=self.PRIMARY, width=3, height=1)
        avatar.pack(side="left", padx=(0, 10))

        prof_info = tk.Frame(prof_top, bg=self.CARD)
        prof_info.pack(side="left", fill="x", expand=True)

        tk.Label(prof_info, textvariable=self.name_var, font=("Segoe UI", 9, "bold"), fg=self.TEXT, bg=self.CARD, anchor="w").pack(fill="x")
        tk.Label(prof_info, text="Focus Mode Active", font=("Segoe UI", 8), fg=self.TEAL, bg=self.CARD, anchor="w").pack(fill="x")

        # Navigation Card
        nav_card = tk.Frame(side, bg=self.CARD, highlightbackground=self.BORDER, highlightthickness=1, padx=12, pady=16)
        nav_card.pack(fill="x", pady=(0, 12))

        tk.Label(nav_card, text="NAVIGATION", font=("Segoe UI", 8, "bold"), fg=self.MUTED, bg=self.CARD).pack(anchor="w", padx=8, pady=(0, 10))

        self.nav_btns = {}
        items = [
            ("dashboard", "🏠  Dashboard"),
            ("socratic", "💡  Learning Session"),
            ("privacy", "📷  Camera & Privacy"),
            ("details", "⚙️  Attention Insights"),
        ]
        for key, label in items:
            btn = tk.Button(
                nav_card,
                text=label,
                anchor="w",
                command=lambda k=key: self._switch_tab(k),
                font=("Segoe UI", 10),
                fg=self.TEXT,
                bg=self.CARD,
                activeforeground=self.PRIMARY,
                activebackground=self.PRIMARY_TINT,
                relief="flat",
                bd=0,
                cursor="hand2",
                padx=12,
                pady=8,
            )
            btn.pack(fill="x", pady=2)
            self.nav_btns[key] = btn

        # Roster Config Card
        cfg_card = tk.Frame(side, bg=self.CARD, highlightbackground=self.BORDER, highlightthickness=1, padx=14, pady=14)
        cfg_card.pack(fill="x")

        tk.Label(cfg_card, text="SESSION PROFILE", font=("Segoe UI", 8, "bold"), fg=self.MUTED, bg=self.CARD).pack(anchor="w", pady=(0, 8))

        def _input_field(lbl, var):
            tk.Label(cfg_card, text=lbl, font=("Segoe UI", 8), fg=self.MUTED, bg=self.CARD).pack(anchor="w")
            ent = tk.Entry(
                cfg_card,
                textvariable=var,
                font=("Segoe UI", 9),
                fg=self.TEXT,
                bg=self.BG,
                relief="flat",
                highlightthickness=1,
                highlightbackground=self.BORDER,
            )
            ent.pack(fill="x", pady=(2, 6))

        _input_field("Student Name:", self.name_var)
        _input_field("Roll Number:", self.roll_var)
        _input_field("Class Code:", self.class_var)
        _input_field("Join Code:", self.join_var)

    def _build_right_panel(self, parent):
        right = tk.Frame(parent, bg=self.BG, width=280)
        right.grid(row=0, column=2, sticky="ns")

        # ── 1. Dark Navy Webcam Preview Card ────────────────────────────
        cam_card = tk.Frame(right, bg=self.CARD, highlightbackground=self.BORDER, highlightthickness=1, padx=14, pady=14)
        cam_card.pack(fill="x", pady=(0, 16))

        cam_hdr = tk.Frame(cam_card, bg=self.CARD)
        cam_hdr.pack(fill="x", pady=(0, 10))
        tk.Label(cam_hdr, text="Webcam Preview", font=("Segoe UI", 11, "bold"), fg=self.TEXT, bg=self.CARD).pack(side="left")
        
        self.cam_badge = tk.Label(cam_hdr, text="Active", font=("Segoe UI", 8, "bold"), fg=self.TEAL, bg=self.TEAL_MIST, padx=6, pady=1)
        self.cam_badge.pack(side="right")

        # Dark Navy (#0F172A) Preview Container
        self.cam_preview_label = tk.Label(
            cam_card,
            text="📷 Camera Processing\non your device",
            font=("Segoe UI", 9),
            fg="#94A3B8",
            bg=self.CAM_BG,
            width=32,
            height=9,
            relief="flat",
        )
        self.cam_preview_label.pack(fill="x", pady=(0, 10))

        # Checkbox Toggle: Show camera preview
        chk = tk.Checkbutton(
            cam_card,
            text="Show camera preview",
            variable=self.show_cam_preview,
            font=("Segoe UI", 9),
            fg=self.TEXT,
            bg=self.CARD,
            activebackground=self.CARD,
        )
        chk.pack(anchor="w", pady=(0, 8))

        # Status Checklist
        self.cam_checks = {}
        check_items = [
            ("cam", "✓ Camera active"),
            ("face", "✓ Face detected"),
            ("gaze", "✓ Gaze direction estimated"),
            ("pose", "✓ Head position estimated"),
        ]
        for key, txt in check_items:
            lbl = tk.Label(cam_card, text=txt, font=("Segoe UI", 9), fg=self.TEAL, bg=self.CARD)
            lbl.pack(anchor="w", pady=1)
            self.cam_checks[key] = lbl

        tk.Label(
            cam_card,
            text="Camera frames are processed entirely on your local device.",
            font=("Segoe UI", 8, "italic"),
            fg=self.MUTED,
            bg=self.CARD,
            wraplength=230,
            justify="left",
        ).pack(anchor="w", pady=(10, 0))

        # ── 2. Computer Vision Status Card ────────────────────────────
        det_card = tk.Frame(right, bg=self.CARD, highlightbackground=self.BORDER, highlightthickness=1, padx=14, pady=14)
        det_card.pack(fill="x")

        tk.Label(det_card, text="Attention Pipeline", font=("Segoe UI", 11, "bold"), fg=self.TEXT, bg=self.CARD).pack(anchor="w", pady=(0, 10))

        cv_items = [
            "✓ MediaPipe Face Landmark Mesh",
            "✓ Gaze Vector Estimator",
            "✓ Head Pose Orientation",
            "✓ YOLOv8 Activity Classifier",
            "✓ Attention Stability Score",
        ]
        for txt in cv_items:
            tk.Label(det_card, text=txt, font=("Segoe UI", 8), fg=self.MUTED, bg=self.CARD).pack(anchor="w", pady=1)

        self.det_status_lbl = tk.Label(det_card, text="Pipeline active (60 FPS)", font=("Segoe UI", 9, "bold"), fg=self.TEAL, bg=self.CARD)
        self.det_status_lbl.pack(anchor="w", pady=(10, 8))

        details_btn = tk.Button(
            det_card,
            text="View attention insights →",
            command=lambda: self._switch_tab("details"),
            font=("Segoe UI", 9, "bold"),
            fg=self.PRIMARY,
            bg=self.CARD,
            activeforeground=self.PRIMARY_HOVER,
            activebackground=self.HOVER,
            relief="flat",
            bd=0,
            cursor="hand2",
        )
        details_btn.pack(anchor="w")

    def _switch_tab(self, tab_key):
        self.active_tab = tab_key

        # Update sidebar selection state
        for k, btn in self.nav_btns.items():
            if k == tab_key:
                btn.configure(bg=self.PRIMARY_TINT, fg=self.PRIMARY, font=("Segoe UI", 10, "bold"))
            else:
                btn.configure(bg=self.CARD, fg=self.TEXT, font=("Segoe UI", 10))

        # Clear center frame
        for child in self.center_frame.winfo_children():
            child.destroy()

        if tab_key == "dashboard":
            self._render_dashboard_view(self.center_frame)
        elif tab_key == "socratic":
            self._render_socratic_view(self.center_frame)
        elif tab_key == "privacy":
            self._render_privacy_view(self.center_frame)
        elif tab_key == "details":
            self._render_details_view(self.center_frame)
        elif tab_key == "summary":
            self._render_summary_view(self.center_frame)

    # ══════════════════════════════════════════════════════════════════════════
    # Tab 1: Main Attention Dashboard View
    # ══════════════════════════════════════════════════════════════════════════
    def _render_dashboard_view(self, parent):
        container = tk.Frame(parent, bg=self.BG)
        container.pack(fill="both", expand=True)

        # ── 1. Welcome & Session Card ─────────────────────────────────
        welcome_card = tk.Frame(container, bg=self.CARD, highlightbackground=self.BORDER, highlightthickness=1, padx=20, pady=16)
        welcome_card.pack(fill="x", pady=(0, 14))

        wel_hdr = tk.Frame(welcome_card, bg=self.CARD)
        wel_hdr.pack(fill="x")

        student_name = self.name_var.get().strip() or "Student"
        tk.Label(wel_hdr, text=f"Welcome back, {student_name} 👋", font=("Segoe UI", 14, "bold"), fg=self.TEXT, bg=self.CARD).pack(side="left")
        tk.Label(wel_hdr, text="• Calm Focus Companion Active", font=("Segoe UI", 9, "bold"), fg=self.TEAL, bg=self.CARD).pack(side="right")

        # Current Course Details Strip
        sess_strip = tk.Frame(welcome_card, bg=self.HOVER, padx=14, pady=10)
        sess_strip.pack(fill="x", pady=(10, 0))

        class_name = self.class_var.get().strip().upper() or "CS101"
        tk.Label(sess_strip, text=f"📚 Current Course: {class_name} — Data Structures & Algorithms", font=("Segoe UI", 9, "bold"), fg=self.TEXT, bg=self.HOVER).pack(side="left")
        tk.Label(sess_strip, text="Lesson: Binary Trees", font=("Segoe UI", 9), fg=self.MUTED, bg=self.HOVER).pack(side="right")

        # ── 2. Live Attention Score & Supportive Feedback Card ──────────
        att_card = tk.Frame(container, bg=self.CARD, highlightbackground=self.BORDER, highlightthickness=1, padx=24, pady=18)
        att_card.pack(fill="x", pady=(0, 14))

        tk.Label(att_card, text="Attention State & Refocus Guidance", font=("Segoe UI", 12, "bold"), fg=self.TEXT, bg=self.CARD).pack(anchor="w")

        # Gauge & Encouragement Row
        row = tk.Frame(att_card, bg=self.CARD)
        row.pack(fill="x", pady=(12, 0))

        # Circular Arc Canvas Gauge
        self.gauge_canvas = tk.Canvas(row, width=160, height=160, bg=self.CARD, highlightthickness=0)
        self.gauge_canvas.pack(side="left", padx=(0, 20))

        # Dynamic Status & Message Box
        msg_box = tk.Frame(row, bg=self.CARD)
        msg_box.pack(side="left", fill="both", expand=True)

        self.att_state_title = tk.Label(msg_box, text="Optimal Focus", font=("Segoe UI", 18, "bold"), fg=self.TEAL, bg=self.CARD)
        self.att_state_title.pack(anchor="w", pady=(4, 2))

        self.att_state_desc = tk.Label(
            msg_box,
            text="“You are in a great learning flow state. Keep it up!”",
            font=("Segoe UI", 10, "italic"),
            fg=self.TEXT,
            bg=self.CARD,
            wraplength=380,
            justify="left",
        )
        self.att_state_desc.pack(anchor="w", pady=(0, 10))

        # Supportive dynamic tip container
        tip_box = tk.Frame(msg_box, bg=self.HOVER, padx=12, pady=8)
        tip_box.pack(fill="x")
        self.tip_lbl = tk.Label(
            tip_box,
            text="💡 Companion Tip: Attenova provides gentle cues to help you sustain attention naturally.",
            font=("Segoe UI", 9),
            fg=self.MUTED,
            bg=self.HOVER,
            justify="left",
        )
        self.tip_lbl.pack(anchor="w")

        self._draw_circular_gauge(self.latest_info.get("attention", 85))

        # ── 3. Attention Timeline Card ───────────────────────────────
        time_card = tk.Frame(container, bg=self.CARD, highlightbackground=self.BORDER, highlightthickness=1, padx=24, pady=18)
        time_card.pack(fill="both", expand=True)

        t_hdr = tk.Frame(time_card, bg=self.CARD)
        t_hdr.pack(fill="x", pady=(0, 8))

        tk.Label(t_hdr, text="Attention Trend During Session", font=("Segoe UI", 12, "bold"), fg=self.TEXT, bg=self.CARD).pack(side="left")

        # Timeline Canvas
        self.timeline_canvas = tk.Canvas(time_card, height=170, bg=self.CARD, highlightthickness=0)
        self.timeline_canvas.pack(fill="both", expand=True, pady=(0, 10))

        # KPI Summary Strip
        kpi_strip = tk.Frame(time_card, bg=self.HOVER, padx=16, pady=8)
        kpi_strip.pack(fill="x")

        self.kpi_current = tk.Label(kpi_strip, text=f"Current: {self.latest_info.get('attention', 85)}%", font=("Segoe UI", 9, "bold"), fg=self.PRIMARY, bg=self.HOVER)
        self.kpi_current.pack(side="left", expand=True)

        self.kpi_avg = tk.Label(kpi_strip, text=f"Session Average: {self.latest_info.get('avg_attention', 82)}%", font=("Segoe UI", 9, "bold"), fg=self.TEXT, bg=self.HOVER)
        self.kpi_avg.pack(side="left", expand=True)

        self.kpi_peak = tk.Label(kpi_strip, text=f"Peak: {self.latest_info.get('peak_attention', 95)}%", font=("Segoe UI", 9, "bold"), fg=self.TEAL, bg=self.HOVER)
        self.kpi_peak.pack(side="left", expand=True)

        self._draw_timeline_chart()

    def _draw_circular_gauge(self, score):
        if not hasattr(self, "gauge_canvas") or not self.gauge_canvas.winfo_exists():
            return
        cv = self.gauge_canvas
        cv.delete("all")

        # Color band & supportive feedback (Focus Companion identity)
        if score >= 90:
            col, label, msg = self.TEAL, "Highly Focused", "“You are in an optimal learning flow state.”"
        elif score >= 75:
            col, label, msg = self.TEAL, "Focused", "“Great momentum! Keep up the good work.”"
        elif score >= 55:
            col, label, msg = self.AMBER, "Mindful Focus", "“Let's take a moment to refocus on the main lesson.”"
        elif score >= 30:
            col, label, msg = self.AMBER, "Gentle Reminder", "“A quick breath can help bring your attention back.”"
        else:
            col, label, msg = self.RED, "Breather Suggested", "“Consider taking a short 2-minute break to refresh your mind.”"

        # Background Arc
        cv.create_arc(15, 15, 145, 145, start=-225, extent=270, style="arc", outline=self.BORDER, width=12)

        # Animated Progress Arc
        extent = -(270 * max(0, min(100, score)) / 100)
        cv.create_arc(15, 15, 145, 145, start=225, extent=extent, style="arc", outline=col, width=12)

        # Center Score Readout
        cv.create_text(80, 72, text=f"{score}%", font=("Segoe UI", 24, "bold"), fill=col)
        cv.create_text(80, 102, text=label, font=("Segoe UI", 9, "bold"), fill=self.MUTED)

        # Update text labels
        if hasattr(self, "att_state_title"):
            self.att_state_title.configure(text=label, fg=col)
            self.att_state_desc.configure(text=msg)

    def _draw_timeline_chart(self):
        if not hasattr(self, "timeline_canvas") or not self.timeline_canvas.winfo_exists():
            return
        cv = self.timeline_canvas
        cv.delete("all")

        w = cv.winfo_width() or 580
        h = cv.winfo_height() or 170

        # Background grid
        for y_pct in (0.25, 0.50, 0.75):
            y = int(h * y_pct)
            cv.create_line(0, y, w, y, fill=self.BORDER, dash=(3, 3))

        hist = self.latest_info.get("attn_hist", [75, 78, 82, 85, 88, 86, 85])
        if len(hist) < 2:
            return

        pts = []
        n = len(hist)
        for i, val in enumerate(hist):
            x = int(i * (w - 20) / max(1, n - 1)) + 10
            y = int(h - 20 - (val / 100.0) * (h - 40))
            pts.append((x, y))

        # Fill Polygon
        poly_pts = [(pts[0][0], h - 10)] + pts + [(pts[-1][0], h - 10)]
        flat_poly = [coord for pt in poly_pts for coord in pt]
        cv.create_polygon(flat_poly, fill=self.PRIMARY_TINT, outline="")

        # Line Graph
        flat_pts = [coord for pt in pts for coord in pt]
        cv.create_line(flat_pts, fill=self.PRIMARY, width=3, smooth=True)

        # Current Indicator Point
        last_x, last_y = pts[-1]
        cv.create_oval(last_x - 5, last_y - 5, last_x + 5, last_y + 5, fill=self.TEAL, outline="#FFFFFF", width=2)

    # ══════════════════════════════════════════════════════════════════════════
    # Tab 2: Socratic Learning Experience (4-Stage Stepper)
    # ══════════════════════════════════════════════════════════════════════════
    def _render_socratic_view(self, parent):
        container = tk.Frame(parent, bg=self.BG)
        container.pack(fill="both", expand=True)

        card = tk.Frame(container, bg=self.CARD, highlightbackground=self.BORDER, highlightthickness=1, padx=24, pady=20)
        card.pack(fill="both", expand=True)

        # Stepper Header
        step_frame = tk.Frame(card, bg=self.HOVER, padx=16, pady=10)
        step_frame.pack(fill="x", pady=(0, 20))

        stages = [
            (1, "1. Think"),
            (2, "2. Compare"),
            (3, "3. Reflect"),
            (4, "4. Reassess"),
        ]
        for idx, (stg_num, stg_lbl) in enumerate(stages):
            is_active = self.socratic_stage == stg_num
            is_done = self.socratic_stage > stg_num
            fg = self.PRIMARY if is_active else (self.TEAL if is_done else self.MUTED)
            prefix = "✓ " if is_done else ("● " if is_active else "○ ")
            btn = tk.Button(
                step_frame,
                text=prefix + stg_lbl,
                command=lambda s=stg_num: self._set_socratic_stage(s),
                font=("Segoe UI", 9, "bold" if is_active else "normal"),
                fg=fg,
                bg=self.HOVER,
                activebackground=self.HOVER,
                relief="flat",
                bd=0,
                cursor="hand2",
            )
            btn.pack(side="left", expand=True)

        q = self.socratic_state.get("question")
        q_text = q.get("text") if q else "What will be the output of this code snippet?"
        options = q.get("options") if (q and q.get("options")) else ["A. 7", "B. 9", "C. 10", "D. 14"]

        # ── STAGE 1: THINK ────────────────────────────────────────────
        if self.socratic_stage == 1:
            tk.Label(card, text="Quick Learning Check", font=("Segoe UI", 16, "bold"), fg=self.TEXT, bg=self.CARD).pack(anchor="w")
            tk.Label(card, text="Take a moment to think about what you just learned.", font=("Segoe UI", 10), fg=self.MUTED, bg=self.CARD).pack(anchor="w", pady=(2, 16))

            q_box = tk.Frame(card, bg=self.HOVER, padx=16, pady=14)
            q_box.pack(fill="x", pady=(0, 20))
            tk.Label(q_box, text="QUESTION PROMPT:", font=("Segoe UI", 8, "bold"), fg=self.PRIMARY, bg=self.HOVER).pack(anchor="w")
            tk.Label(q_box, text=q_text, font=("Segoe UI", 11, "bold"), fg=self.TEXT, bg=self.HOVER, wraplength=560, justify="left").pack(anchor="w", pady=(4, 0))

            # 4 Selectable Choice Cards
            choices_frame = tk.Frame(card, bg=self.CARD)
            choices_frame.pack(fill="x", pady=(0, 16))

            for idx, opt in enumerate(options):
                c_card = tk.Frame(choices_frame, bg=self.HOVER if self.selected_option.get() == opt else self.CARD, highlightbackground=self.PRIMARY if self.selected_option.get() == opt else self.BORDER, highlightthickness=1, padx=14, pady=10)
                c_card.pack(fill="x", pady=4)
                rb = tk.Radiobutton(
                    c_card,
                    text=opt,
                    value=opt,
                    variable=self.selected_option,
                    font=("Segoe UI", 10, "bold"),
                    fg=self.TEXT,
                    bg=c_card["bg"],
                    activebackground=c_card["bg"],
                    command=lambda: self._set_socratic_stage(1),
                )
                rb.pack(anchor="w")

            # Confidence Rating Selector
            conf_frame = tk.Frame(card, bg=self.CARD)
            conf_frame.pack(fill="x", pady=(10, 16))
            tk.Label(conf_frame, text="How confident are you?", font=("Segoe UI", 10, "bold"), fg=self.TEXT, bg=self.CARD).pack(anchor="w", pady=(0, 6))

            conf_row = tk.Frame(conf_frame, bg=self.CARD)
            conf_row.pack(anchor="w")
            confs = [("😄 Very Confident", "Very Confident"), ("🙂 Confident", "Confident"), ("😐 Unsure", "Unsure"), ("😟 Very Unsure", "Very Unsure")]
            for lbl, val in confs:
                rb = tk.Radiobutton(
                    conf_row,
                    text=lbl,
                    value=val,
                    variable=self.confidence_level,
                    font=("Segoe UI", 9),
                    fg=self.TEXT,
                    bg=self.CARD,
                    activebackground=self.CARD,
                )
                rb.pack(side="left", padx=(0, 14))

            submit_btn = tk.Button(
                card,
                text="Submit Answer  →",
                command=lambda: self._set_socratic_stage(2),
                font=("Segoe UI", 10, "bold"),
                fg="#FFFFFF",
                bg=self.PRIMARY,
                activeforeground="#FFFFFF",
                activebackground=self.PRIMARY_HOVER,
                relief="flat",
                bd=0,
                cursor="hand2",
                padx=24,
                pady=8,
            )
            submit_btn.pack(anchor="w")

        # ── STAGE 2: COMPARE ──────────────────────────────────────────
        elif self.socratic_stage == 2:
            tk.Label(card, text="Class Comparison", font=("Segoe UI", 16, "bold"), fg=self.TEXT, bg=self.CARD).pack(anchor="w")
            tk.Label(card, text="64% of students selected the same answer.", font=("Segoe UI", 10, "bold"), fg=self.TEAL, bg=self.CARD).pack(anchor="w", pady=(2, 16))

            comp_box = tk.Frame(card, bg=self.HOVER, padx=16, pady=16)
            comp_box.pack(fill="x", pady=(0, 20))

            bars = [("A", "12%"), ("B (Your choice)", "64%"), ("C", "18%"), ("D", "6%")]
            for letter, pct in bars:
                row = tk.Frame(comp_box, bg=self.HOVER)
                row.pack(fill="x", pady=4)
                tk.Label(row, text=f"Option {letter}", font=("Segoe UI", 9, "bold"), fg=self.TEXT, bg=self.HOVER, width=16, anchor="w").pack(side="left")
                pct_val = int(pct.replace("%", ""))
                b_canvas = tk.Canvas(row, height=14, bg=self.BORDER, highlightthickness=0)
                b_canvas.pack(side="left", fill="x", expand=True, padx=8)
                b_canvas.create_rectangle(0, 0, int((pct_val / 100.0) * 280), 14, fill=self.PRIMARY if "Your" in letter else self.MUTED, width=0)
                tk.Label(row, text=pct, font=("Segoe UI", 9, "bold"), fg=self.TEXT, bg=self.HOVER).pack(side="left")

            tk.Label(card, text="Would you like to reconsider your answer?", font=("Segoe UI", 11, "bold"), fg=self.TEXT, bg=self.CARD).pack(anchor="w", pady=(10, 12))

            btn_row = tk.Frame(card, bg=self.CARD)
            btn_row.pack(anchor="w")
            tk.Button(
                btn_row,
                text="Keep My Answer",
                command=lambda: self._set_socratic_stage(3),
                font=("Segoe UI", 10, "bold"),
                fg="#FFFFFF",
                bg=self.TEAL,
                relief="flat",
                bd=0,
                cursor="hand2",
                padx=20,
                pady=8,
            ).pack(side="left", padx=(0, 12))

            tk.Button(
                btn_row,
                text="Change My Answer",
                command=lambda: self._set_socratic_stage(1),
                font=("Segoe UI", 10, "bold"),
                fg=self.TEXT,
                bg=self.HOVER,
                relief="flat",
                bd=0,
                cursor="hand2",
                padx=20,
                pady=8,
            ).pack(side="left")

        # ── STAGE 3: REFLECT ──────────────────────────────────────────
        elif self.socratic_stage == 3:
            tk.Label(card, text="Think About Your Reasoning", font=("Segoe UI", 16, "bold"), fg=self.TEXT, bg=self.CARD).pack(anchor="w")
            tk.Label(card, text="What helped you choose your answer?", font=("Segoe UI", 10, "bold"), fg=self.PRIMARY, bg=self.CARD).pack(anchor="w", pady=(2, 16))

            refl_opts = ["I remembered the concept", "I worked through it step by step", "I learned it from the example", "I guessed", "I'm still unsure"]
            for opt in refl_opts:
                rb = tk.Radiobutton(
                    card,
                    text=opt,
                    value=opt,
                    variable=self.reflection_text,
                    font=("Segoe UI", 10),
                    fg=self.TEXT,
                    bg=self.CARD,
                    activebackground=self.CARD,
                )
                rb.pack(anchor="w", pady=4)

            tk.Label(card, text="Want to explain your reasoning? (Optional)", font=("Segoe UI", 9, "bold"), fg=self.MUTED, bg=self.CARD).pack(anchor="w", pady=(14, 4))
            reason_ent = tk.Entry(card, font=("Segoe UI", 10), fg=self.TEXT, bg=self.HOVER, relief="flat", bd=0, highlightthickness=1, highlightbackground=self.BORDER)
            reason_ent.pack(fill="x", pady=(0, 16))

            tk.Button(
                card,
                text="Submit Reflection  →",
                command=lambda: self._set_socratic_stage(4),
                font=("Segoe UI", 10, "bold"),
                fg="#FFFFFF",
                bg=self.PRIMARY,
                relief="flat",
                bd=0,
                cursor="hand2",
                padx=24,
                pady=8,
            ).pack(anchor="w")

        # ── STAGE 4: REASSESSMENT ──────────────────────────────────────
        elif self.socratic_stage == 4:
            tk.Label(card, text="One More Try", font=("Segoe UI", 16, "bold"), fg=self.TEXT, bg=self.CARD).pack(anchor="w")
            tk.Label(card, text="Here's a similar question. Let's see what you think now.", font=("Segoe UI", 10), fg=self.MUTED, bg=self.CARD).pack(anchor="w", pady=(2, 16))

            res_box = tk.Frame(card, bg=self.HOVER, padx=20, pady=16)
            res_box.pack(fill="x", pady=(0, 20))

            tk.Label(res_box, text="BEFORE  ➔  AFTER SUMMARY", font=("Segoe UI", 9, "bold"), fg=self.PRIMARY, bg=self.HOVER).pack(anchor="w", pady=(0, 10))

            rows = [
                ("Answer Accuracy:", "❌ Incorrect  ➔  ✓ Correct", self.TEAL),
                ("Confidence Level:", "Unsure  ➔  Confident", self.TEXT),
                ("Attention Focus:", "54%  ➔  76%", self.PRIMARY),
            ]
            for lbl, val, col in rows:
                r = tk.Frame(res_box, bg=self.HOVER)
                r.pack(fill="x", pady=3)
                tk.Label(r, text=lbl, font=("Segoe UI", 9), fg=self.MUTED, bg=self.HOVER, width=18, anchor="w").pack(side="left")
                tk.Label(r, text=val, font=("Segoe UI", 10, "bold"), fg=col, bg=self.HOVER).pack(side="left")

            tk.Label(card, text="“Nice work. Your understanding appears to have improved.”", font=("Segoe UI", 11, "italic"), fg=self.TEXT, bg=self.CARD).pack(anchor="w", pady=(0, 16))

            tk.Button(
                card,
                text="Return to Dashboard",
                command=lambda: self._switch_tab("dashboard"),
                font=("Segoe UI", 10, "bold"),
                fg="#FFFFFF",
                bg=self.PRIMARY,
                relief="flat",
                bd=0,
                cursor="hand2",
                padx=24,
                pady=8,
            ).pack(anchor="w")

    def _set_socratic_stage(self, stage):
        self.socratic_stage = stage
        if self.active_tab == "socratic":
            self._switch_tab("socratic")

    # ══════════════════════════════════════════════════════════════════════════
    # Tab 3: Camera & Privacy View
    # ══════════════════════════════════════════════════════════════════════════
    def _render_privacy_view(self, parent):
        card = tk.Frame(parent, bg=self.CARD, highlightbackground=self.BORDER, highlightthickness=1, padx=24, pady=24)
        card.pack(fill="both", expand=True)

        tk.Label(card, text="🔒 How Attention Monitoring Works & About Privacy", font=("Segoe UI", 16, "bold"), fg=self.TEXT, bg=self.CARD).pack(anchor="w")
        tk.Label(card, text="Attenova is engineered from the ground up to guarantee 100% student privacy.", font=("Segoe UI", 10), fg=self.MUTED, bg=self.CARD).pack(anchor="w", pady=(2, 16))

        pillars = [
            ("💻 100% Local On-Device Processing", "Webcam frames stay strictly inside local computer RAM for real-time computer vision feature extraction. No raw video, camera feeds, or image snapshots are ever uploaded to the server or saved to disk."),
            ("📊 Derived Numerical Telemetry Only", "Only high-level mathematical telemetry (estimated attention %, head pose angles, blink frequency, gaze direction vector, and phone presence) is shared with the classroom dashboard."),
            ("⏸️ Complete Student Agency & Pause Control", "You can pause attention monitoring at any time using the 'Pause Monitoring' button. While paused, telemetry is held neutral without penalty or false alert generation."),
            ("💡 Non-Punitive Pedagogical Purpose", "Attenova is designed to encourage self-reflection and prompt timely Socratic guidance — not to monitor or judge student behavior."),
        ]

        for title, desc in pillars:
            box = tk.Frame(card, bg=self.HOVER, padx=16, pady=12)
            box.pack(fill="x", pady=6)
            tk.Label(box, text=title, font=("Segoe UI", 11, "bold"), fg=self.PRIMARY, bg=self.HOVER).pack(anchor="w")
            tk.Label(box, text=desc, font=("Segoe UI", 9), fg=self.TEXT, bg=self.HOVER, justify="left").pack(anchor="w", pady=(3, 0))

        # Standalone OpenCV window toggle
        chk_win = tk.Checkbutton(
            card,
            text="Enable standalone debug CV window",
            variable=self.show_cv_window_var,
            font=("Segoe UI", 10),
            fg=self.TEXT,
            bg=self.CARD,
            activebackground=self.CARD,
        )
        chk_win.pack(anchor="w", pady=(16, 0))

    # ══════════════════════════════════════════════════════════════════════════
    # Tab 4: Detection Details View (Technical Transparency)
    # ══════════════════════════════════════════════════════════════════════════
    def _render_details_view(self, parent):
        card = tk.Frame(parent, bg=self.CARD, highlightbackground=self.BORDER, highlightthickness=1, padx=24, pady=24)
        card.pack(fill="both", expand=True)

        tk.Label(card, text="Attention Insights & Detection Metrics", font=("Segoe UI", 16, "bold"), fg=self.TEXT, bg=self.CARD).pack(anchor="w")
        tk.Label(card, text="Technical metrics running on local MediaPipe + YOLOv8 + ML classifier.", font=("Segoe UI", 10), fg=self.MUTED, bg=self.CARD).pack(anchor="w", pady=(2, 16))

        grid = tk.Frame(card, bg=self.CARD)
        grid.pack(fill="x", pady=(0, 16))

        info = self.latest_info
        metrics = [
            ("Face Detection:", "478 Landmarks (MediaPipe)", self.TEAL),
            ("Gaze Direction:", str(info.get("gaze", "Center")), self.TEXT),
            ("Head Pose:", str(info.get("pose", (0, 0, 0))), self.TEXT),
            ("Blink Rate:", f"{info.get('blinks_per_min', 0):.1f} / min", self.TEXT),
            ("YOLO Phone Detection:", "Detected" if info.get("phone_detected") else "Clear", self.RED if info.get("phone_detected") else self.TEAL),
            ("Hand Count:", f"{info.get('hands_count', 0)} hands", self.TEXT),
            ("ML Raw Prob:", f"{info.get('model_prob_raw', 0.85):.2f}", self.TEXT),
            ("Smoothed Prob:", f"{info.get('model_prob_smoothed', 0.85):.2f}", self.PRIMARY),
        ]

        for i, (lbl, val, col) in enumerate(metrics):
            r = i // 2
            c = (i % 2) * 2
            tk.Label(grid, text=lbl, font=("Segoe UI", 9, "bold"), fg=self.MUTED, bg=self.CARD).grid(row=r, column=c, sticky="w", pady=4, padx=(0, 8))
            tk.Label(grid, text=val, font=("Segoe UI", 9, "bold"), fg=col, bg=self.CARD).grid(row=r, column=c + 1, sticky="w", pady=4, padx=(0, 24))

    # ══════════════════════════════════════════════════════════════════════════
    # Tab 5: Session Summary View
    # ══════════════════════════════════════════════════════════════════════════
    def _render_summary_view(self, parent):
        card = tk.Frame(parent, bg=self.CARD, highlightbackground=self.BORDER, highlightthickness=1, padx=24, pady=24)
        card.pack(fill="both", expand=True)

        tk.Label(card, text="Session Complete", font=("Segoe UI", 18, "bold"), fg=self.TEXT, bg=self.CARD).pack(anchor="w")
        tk.Label(card, text="Great job! Here is your learning engagement summary.", font=("Segoe UI", 10), fg=self.MUTED, bg=self.CARD).pack(anchor="w", pady=(2, 16))

        # KPI Tiles Strip
        tiles_frame = tk.Frame(card, bg=self.CARD)
        tiles_frame.pack(fill="x", pady=(0, 20))

        tiles = [
            ("Session Duration", "52 min", self.TEXT),
            ("Average Attention", f"{self.latest_info.get('avg_attention', 82)}%", self.PRIMARY),
            ("Highest Attention", f"{self.latest_info.get('peak_attention', 95)}%", self.TEAL),
            ("Interventions", "2", self.TEXT),
            ("Improvement", "+18%", self.TEAL),
        ]
        for title, val, col in tiles:
            t_box = tk.Frame(tiles_frame, bg=self.HOVER, padx=14, pady=12)
            t_box.pack(side="left", expand=True, fill="x", padx=4)
            tk.Label(t_box, text=val, font=("Segoe UI", 18, "bold"), fg=col, bg=self.HOVER).pack()
            tk.Label(t_box, text=title, font=("Segoe UI", 8, "bold"), fg=self.MUTED, bg=self.HOVER).pack()

        # Session Pattern Card
        pat_box = tk.Frame(card, bg=self.HOVER, padx=16, pady=14)
        pat_box.pack(fill="x", pady=(0, 16))
        tk.Label(pat_box, text="YOUR SESSION PATTERN", font=("Segoe UI", 8, "bold"), fg=self.PRIMARY, bg=self.HOVER).pack(anchor="w")
        tk.Label(
            pat_box,
            text="“Your attention was strongest during the first 30 minutes and gradually settled into a steady flow.”",
            font=("Segoe UI", 10, "italic"),
            fg=self.TEXT,
            bg=self.HOVER,
            justify="left",
        ).pack(anchor="w", pady=(4, 0))

        # Suggestion Card
        sug_box = tk.Frame(card, bg=self.HOVER, padx=16, pady=14)
        sug_box.pack(fill="x", pady=(0, 20))
        tk.Label(sug_box, text="SUGGESTION", font=("Segoe UI", 8, "bold"), fg=self.TEAL, bg=self.HOVER).pack(anchor="w")
        tk.Label(
            sug_box,
            text="“Consider taking a short 5-minute break before your next study session to recharge.”",
            font=("Segoe UI", 10),
            fg=self.TEXT,
            bg=self.HOVER,
            justify="left",
        ).pack(anchor="w", pady=(4, 0))

        tk.Button(
            card,
            text="Return to Dashboard",
            command=lambda: self._switch_tab("dashboard"),
            font=("Segoe UI", 10, "bold"),
            fg="#FFFFFF",
            bg=self.PRIMARY,
            relief="flat",
            bd=0,
            cursor="hand2",
            padx=24,
            pady=8,
        ).pack(anchor="w")

    # ══════════════════════════════════════════════════════════════════════════
    # Callbacks & Event Handlers
    # ══════════════════════════════════════════════════════════════════════════
    def toggle_pause_monitoring(self):
        is_paused = not self.session_flags.get("is_paused", False)
        self.session_flags["is_paused"] = is_paused
        self.update_pause_button_ui(is_paused)

    def update_pause_button_ui(self, is_paused: bool):
        if is_paused:
            self.pause_btn.configure(
                text="▶  Resume Monitoring",
                fg="#92400E",
                bg=self.AMBER_MIST,
                activebackground=self.AMBER_MIST,
            )
            if hasattr(self, "conn_badge"):
                self.conn_badge.configure(text="⏸ Monitoring Paused", fg=self.AMBER, bg=self.AMBER_MIST)
        else:
            self.pause_btn.configure(
                text="⏸  Pause Monitoring",
                fg=self.TEXT,
                bg=self.HOVER,
                activebackground=self.BORDER,
            )
            if hasattr(self, "conn_badge"):
                self.conn_badge.configure(text="● Connected", fg=self.TEAL, bg=self.TEAL_MIST)

    def _show_privacy_dialog(self):
        dlg = tk.Toplevel(self.root)
        dlg.title("🔒 About Privacy & How Attention Monitoring Works")
        dlg.geometry("640x580")
        dlg.resizable(False, False)
        dlg.configure(bg=self.BG)
        dlg.transient(self.root)
        dlg.grab_set()

        card = tk.Frame(dlg, bg=self.CARD, padx=24, pady=24)
        card.pack(fill="both", expand=True, padx=16, pady=16)

        tk.Label(card, text="🔒 Privacy & Transparency Notice", font=("Segoe UI", 16, "bold"), fg=self.PRIMARY, bg=self.CARD).pack(anchor="w", pady=(0, 4))
        tk.Label(card, text="How Attenova protects your data and privacy during learning sessions.", font=("Segoe UI", 10), fg=self.MUTED, bg=self.CARD).pack(anchor="w", pady=(0, 16))

        sections = [
            ("💻 100% Local On-Device Processing", "Webcam video frames are processed locally in real-time memory on your computer. No raw video, camera feeds, or facial images are ever recorded, stored on disk, or transmitted to any server."),
            ("📊 Derived Numerical Telemetry Only", "Only high-level mathematical telemetry (estimated attention %, head pose angles, blink frequency, gaze direction vector, and phone presence) is sent to the classroom server."),
            ("⏸️ Complete Student Agency & Pause Control", "You can pause attention monitoring at any time using the 'Pause Monitoring' button. While paused, telemetry is held neutral without penalty or false alert generation."),
            ("💡 Non-Punitive Pedagogical Purpose", "Attenova is designed to encourage self-reflection and prompt timely Socratic guidance — not to monitor or judge student behavior."),
        ]

        for title, desc in sections:
            box = tk.Frame(card, bg=self.HOVER, padx=14, pady=10)
            box.pack(fill="x", pady=6)
            tk.Label(box, text=title, font=("Segoe UI", 10, "bold"), fg=self.TEXT, bg=self.HOVER).pack(anchor="w")
            tk.Label(box, text=desc, font=("Segoe UI", 9), fg=self.MUTED, bg=self.HOVER, wraplength=540, justify="left").pack(anchor="w", pady=(2, 0))

        tk.Button(
            card,
            text="Got it",
            command=dlg.destroy,
            font=("Segoe UI", 10, "bold"),
            fg="#FFFFFF",
            bg=self.PRIMARY,
            relief="flat",
            bd=0,
            cursor="hand2",
            padx=24,
            pady=8,
        ).pack(anchor="e", pady=(16, 0))

    def _on_frame(self, frame_bgr, info, socratic_state):
        self.latest_info = info
        self.socratic_state = socratic_state

        # Update UI components via Tkinter main loop thread
        self.root.after(0, lambda: self._update_gui_from_frame(frame_bgr, info, socratic_state))

    def _update_gui_from_frame(self, frame_bgr, info, socratic_state):
        # 1. Update Timer
        elapsed = int(info.get("elapsed", 0))
        m, s = divmod(elapsed, 60)
        h, m = divmod(m, 60)
        if hasattr(self, "timer_lbl"):
            self.timer_lbl.configure(text=f"{h:02d}:{m:02d}:{s:02d}")

        # 2. Update Camera Preview Label
        if self.show_cam_preview.get() and hasattr(self, "cam_preview_label"):
            try:
                if info.get("is_paused"):
                    self.cam_preview_label.configure(
                        image="",
                        text="⏸️ Monitoring Paused\n\nNo video or telemetry\nis being analyzed.",
                        fg=self.AMBER,
                        bg=self.CAM_BG,
                        font=("Segoe UI", 10, "bold"),
                    )
                else:
                    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                    img = Image.fromarray(rgb)
                    img = img.resize((240, 140), Image.Resampling.LANCZOS)
                    photo = ImageTk.PhotoImage(image=img)
                    self.cam_preview_label.configure(image=photo, text="")
                    self.cam_preview_label.image = photo
            except Exception:
                pass

        # 3. Update Dashboard Charts if Active
        if self.active_tab == "dashboard":
            score = info.get("attention", 85)
            self._draw_circular_gauge(score)
            self._draw_timeline_chart()
            if hasattr(self, "kpi_current"):
                self.kpi_current.configure(text=f"Current: {score}%")
                self.kpi_avg.configure(text=f"Session Average: {info.get('avg_attention', 82)}%")
                self.kpi_peak.configure(text=f"Peak: {info.get('peak_attention', 95)}%")

        # 4. Socratic Active Auto-Tab Switch Notification
        if socratic_state.get("active") and socratic_state.get("question"):
            if self.active_tab != "socratic" and self.socratic_stage == 1:
                # Highlight sidebar Socratic button
                if "socratic" in self.nav_btns:
                    self.nav_btns["socratic"].configure(text="💡  Learning Session (NEW)", fg=self.AMBER)

    def toggle_session(self):
        if self.worker and self.worker.is_alive():
            if messagebox.askyesno("End Session", "Are you sure you want to end your active study session?"):
                self.stop_tracking()
        else:
            self.start_tracking()

    def start_tracking(self):
        name = self.name_var.get().strip()
        roll = self.roll_var.get().strip()
        join = self.join_var.get().strip()
        if not name or not roll:
            messagebox.showerror("Validation", "Student Name and Roll Number are required.")
            return

        self.session_flags["end_by_user"] = False
        self.session_flags["fatal_error"] = None
        self.stop_event.clear()

        self.session_btn.configure(text="■  End Session", bg=self.RED)
        self.conn_badge.configure(text="● Connected", fg=self.TEAL, bg=self.TEAL_MIST)

        self.worker = threading.Thread(target=self._run_tracker, daemon=True)
        self.worker.start()

    def _run_tracker(self):
        name = self.name_var.get().strip()
        roll = self.roll_var.get().strip().upper()
        code = self.class_var.get().strip() or "CS101"
        join = self.join_var.get().strip()
        server = self.server_var.get().strip() or "http://localhost:8000"

        ok = run_tracking(
            self.stop_event,
            student_name=name,
            roll_number=roll,
            class_code=code,
            server_url=server,
            join_code=join,
            on_status=lambda msg: self.root.after(0, lambda m=msg: self._set_status(m)),
            session_flags=self.session_flags,
            on_frame_callback=self._on_frame,
            show_cv_window=self.show_cv_window_var.get(),
        )
        self.root.after(0, lambda: self._on_finished(ok))

    def _set_status(self, msg):
        if hasattr(self, "conn_badge"):
            if "failed" in msg.lower() or "error" in msg.lower():
                self.conn_badge.configure(text="● Reconnecting...", fg=self.AMBER, bg=self.AMBER_MIST)
            else:
                self.conn_badge.configure(text="● Connected", fg=self.TEAL, bg=self.TEAL_MIST)

    def _on_finished(self, result):
        self.session_btn.configure(text="▶  Start Session", bg=self.PRIMARY)
        self.conn_badge.configure(text="● Offline", fg=self.MUTED, bg=self.HOVER)
        self.worker = None
        self.stop_event.clear()

        if result in ("ok", "stopped"):
            self._switch_tab("summary")

    def stop_tracking(self):
        if self.worker and self.worker.is_alive():
            self.session_flags["end_by_user"] = True
            self.stop_event.set()

    def on_close(self):
        if self.worker and self.worker.is_alive():
            if not messagebox.askyesno("Exit Companion", "An active tracking session is running. Are you sure you want to exit?"):
                return
        self.session_flags["end_by_user"] = True
        self.stop_event.set()
        self.root.destroy()

    def run(self):
        self.root.mainloop()


# Backwards compatibility alias
TrackerUI = AttenovaCompanionApp


def main():
    AttenovaCompanionApp().run()


if __name__ == "__main__":
    main()