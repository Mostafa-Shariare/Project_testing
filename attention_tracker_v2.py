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
  M         — Toggle 478-point landmark mesh
  X         — Toggle XAI reason overlay
  Y         — Toggle YOLO detection boxes
  Q / ESC   — Quit and show dashboard
"""

import cv2
import mediapipe as mp
import numpy as np
import os
import time
import collections
import threading
import urllib.request
import tkinter as tk
from tkinter import ttk, messagebox
import matplotlib
# Use Agg (non-interactive) so matplotlib never touches the tkinter main loop.
# The dashboard is shown via plt.show() which opens its own window cleanly.
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec

from attention_model import (
    predict_attention,
    predict_proba_attention,
    explain_prediction,
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

FACE_MODEL_PATH = "face_landmarker.task"
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

HAND_MODEL_PATH = "hand_landmarker.task"
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


def detect_hands(frame) -> int:
    """Return the number of hands detected via MediaPipe HandLandmarker."""
    rgb    = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = get_hand_model().detect(mp_img)
    if result.hand_landmarks:
        return len(result.hand_landmarks)
    return 0


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
# Geometry helpers
# ══════════════════════════════════════════════════════════════════════════════
POSE_POINT_IDS = [1, 199, 33, 263, 61, 291]
LEFT_EYE_IDS   = [362, 385, 387, 263, 373, 380]
RIGHT_EYE_IDS  = [33,  160, 158, 133, 153, 144]

MODEL_3D = np.array([
    ( 0.0,    0.0,    0.0  ),
    ( 0.0,  -63.6,  -12.5 ),
    (-43.3,  32.7,  -26.0 ),
    ( 43.3,  32.7,  -26.0 ),
    (-28.9, -28.9,  -24.1 ),
    ( 28.9, -28.9,  -24.1 ),
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
        self.timestamps = collections.deque(maxlen=120)

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
    # Open with default OS image viewer (non-blocking)
    if _sys.platform.startswith("win"):
        _os.startfile(tmp.name)
    elif _sys.platform == "darwin":
        subprocess.Popen(["open", tmp.name])
    else:
        subprocess.Popen(["xdg-open", tmp.name])


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
# Main tracking loop
# ══════════════════════════════════════════════════════════════════════════════
def run_tracking(stop_event=None):
    if stop_event is None:
        stop_event = threading.Event()

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Cannot open webcam.")
        return False

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    face_lmk   = get_face_landmarker()

    # ── Startup diagnostics — printed once so you know what is active ────
    print("\n" + "="*50)
    print("  ATTENTION TRACKER — STARTUP CHECK")
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
    if _yolo_available:
        print(f"  [OK] YOLOv8 phone detector : yolov8n.pt")
    else:
        print(f"  [--] YOLOv8 phone detector : NOT available")
        print(f"       Fix: activate venv then run: pip install ultralytics")

    # Model PKL files
    import os as _os2
    for pkl in ["attention_model.pkl", "attention_scaler.pkl", "attention_columns.pkl"]:
        status = "[OK]" if _os2.path.exists(pkl) else "[!!] MISSING"
        print(f"  {status} {pkl}")

    print("="*50 + "\n")

    blink_det  = BlinkDetector()
    smoother   = TemporalSmoother(window=15, low=0.45, high=0.55)   # ← NEW
    yolo_worker= YOLOWorker(every_n=6)                               # ← NEW
    xai_worker = XAIWorker(every_n=20)

    show_mesh     = False
    show_xai_hud  = True
    show_yolo_box = True
    start_time    = time.time()

    attn_hist        = []
    model_attn_hist  = []
    model_prob_hist  = []
    blink_rate_hist  = []
    phone_hist       = []      # ← NEW: track phone presence over session

    # Probe model
    _probe = {k: 0 for k in FEATURE_KEYS}; _probe["pose"] = "forward"
    try:
        predict_attention(_probe); model_ok = True
    except Exception as e:
        model_ok = False
        print(f"[WARN] Model unavailable: {e}")

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        H, W  = frame.shape[:2]

        # ── YOLO phone detection (background, every 6 frames) ────────────
        yolo_worker.tick(frame)
        phone_feat, phone_boxes = yolo_worker.get()

        # ── Hand detection (fast on CPU, every frame) ────────────────────
        no_of_hand = detect_hands(frame)

        # ── Face landmarks ───────────────────────────────────────────────
        rgb     = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_img  = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        face_result = face_lmk.detect(mp_img)

        feat, pose_angles, ear_avg, gaze_dir = extract_features(
            frame, face_result, phone_feat, no_of_hand
        )
        blink_det.update(ear_avg)

        # face_absent must be set FIRST — everything below depends on it
        face_absent = not bool(face_result.face_landmarks)

        # ── Heuristic score (needed before model block) ──────────────────
        if face_absent:
            h_score = heuristic_attention(0, 0, gaze_dir, ear_avg, no_face=True)
        elif pose_angles:
            h_score = heuristic_attention(pose_angles[1], pose_angles[0], gaze_dir, ear_avg)
        else:
            h_score = heuristic_attention(0, 0, gaze_dir, ear_avg)

        # ── Draw overlays ────────────────────────────────────────────────
        if face_result.face_landmarks:
            lms = face_result.face_landmarks[0]
            if show_mesh:
                draw_mesh(frame, lms, W, H)
            for idx, col in [(1,(0,255,255)),(33,(255,200,0)),(263,(255,200,0))]:
                cv2.circle(frame, (int(lms[idx].x*W), int(lms[idx].y*H)),
                           4, col, -1, cv2.LINE_AA)

        draw_yolo_boxes(frame, phone_boxes, show_yolo_box)

        # ── Model inference ──────────────────────────────────────────────
        if face_absent:
            # No face in frame — bypass model entirely, force distraction
            raw_prob = 0.0
        elif model_ok:
            try:
                raw_prob = predict_proba_attention(feat)
            except Exception:
                raw_prob = h_score / 100.0
        else:
            raw_prob = h_score / 100.0

        # ── Temporal smoothing ───────────────────────────────────────────
        smoothed_prob, stable_label = smoother.update(raw_prob)

        blend = int(h_score * 0.55 + smoothed_prob * 100 * 0.45)

        attn_hist.append(blend)
        model_attn_hist.append(stable_label)
        model_prob_hist.append(smoothed_prob)
        blink_rate_hist.append(blink_det.blinks_per_minute())
        phone_hist.append(phone_feat["phone"])     # ← NEW

        # ── XAI ─────────────────────────────────────────────────────────
        xai_worker.tick(feat)

        # ── Build info dict ──────────────────────────────────────────────
        bpm = blink_det.blinks_per_minute()
        info = {
            "elapsed":           time.time() - start_time,
            "gaze":              gaze_dir if face_result.face_landmarks else "No Face",
            "pose":              pose_angles,
            "ear":               ear_avg,
            "blinks":            blink_det.total,
            "blinks_per_min":    bpm,
            "attention":         blend,
            "avg_attention":     int(np.mean(attn_hist[-300:])),
            "model_pred_stable": stable_label,          # ← smoothed label
            "model_prob_smoothed": smoothed_prob,        # ← smoothed prob
            "model_prob_raw":    raw_prob,               # ← raw per-frame
            "phone_detected":    bool(phone_feat["phone"]),
            "hands_count":       no_of_hand,
            "xai_top_reason":    xai_worker.top_reason(),
            "alert":             "",
        }

        # Alerts — now using stable_label so they don't flicker
        if not face_result.face_landmarks:
            info["alert"] = "NO FACE"
        elif blink_det.eyes_closed:
            info["alert"] = "EYES CLOSED"
        elif bpm > 25:
            info["alert"] = "HIGH BLINK RATE"
        elif phone_feat["phone"] == 1:
            info["alert"] = "PHONE DETECTED"             # ← NEW alert
        elif stable_label == 0 and smoother.window_full:
            info["alert"] = "SUSTAINED DISTRACTION"      # ← NEW: only after window fills

        draw_hud(frame, info, show_xai=show_xai_hud)
        cv2.imshow("Attention Tracker", frame)

        key = cv2.waitKey(1) & 0xFF
        if key in (27, ord("q"), ord("Q")):
            stop_event.set(); break
        elif key in (ord("m"), ord("M")): show_mesh     = not show_mesh
        elif key in (ord("x"), ord("X")): show_xai_hud  = not show_xai_hud
        elif key in (ord("y"), ord("Y")): show_yolo_box = not show_yolo_box

    cap.release()
    cv2.destroyAllWindows()

    dur_   = time.time() - start_time
    m_, s_ = divmod(int(dur_), 60)
    print(f"\n── Session Summary ─────────────────────────────")
    print(f"  Duration      : {m_:02d}:{s_:02d}")
    print(f"  Total blinks  : {blink_det.total}")
    print(f"  Avg attention : {int(np.mean(attn_hist)) if attn_hist else 0}%")
    print(f"  Avg model conf: {np.mean(model_prob_hist)*100:.1f}%" if model_prob_hist else "  Avg model conf: —")
    print(f"  Phone detected: {sum(phone_hist)} frames ({100*sum(phone_hist)/max(len(phone_hist),1):.1f}%)")
    print(f"────────────────────────────────────────────────\n")

    show_dashboard({
        "duration_sec":           dur_,
        "total_blinks":           blink_det.total,
        "attention_series":       attn_hist,
        "model_attention_series": model_attn_hist,
        "model_prob_series":      model_prob_hist,
        "blink_timeline":         blink_rate_hist,
        "phone_series":           phone_hist,
    })
    return True


# ══════════════════════════════════════════════════════════════════════════════
# Tkinter control panel
# ══════════════════════════════════════════════════════════════════════════════
class TrackerUI:
    DARK = "#12141C"; PANEL = "#1E2130"; ACCENT = "#5AA0F0"
    WHITE = "#EAEAF2"; MUTED = "#5C5E72"; GREEN = "#48C87A"; RED = "#E04040"

    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Attention Tracker")
        self.root.geometry("480x300")
        self.root.resizable(False, False)
        self.root.configure(bg=self.DARK)
        self.stop_event = threading.Event()
        self.worker     = None
        self._build()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def _build(self):
        hdr = tk.Frame(self.root, bg=self.PANEL, height=52)
        hdr.pack(fill="x")
        tk.Label(hdr, text="ATTENTION TRACKER  +  YOLOv8  +  SMOOTHING",
                 font=("Courier New", 11, "bold"),
                 fg=self.ACCENT, bg=self.PANEL).pack(pady=14)

        body = tk.Frame(self.root, bg=self.DARK, padx=28, pady=18)
        body.pack(fill="both", expand=True)

        tk.Label(body,
                 text="New features:\n"
                      "  • Phone detection via YOLOv8  (feature: phone / phone_con)\n"
                      "  • Hand count via MediaPipe Hands  (feature: no_of_hand)\n"
                      "  • 15-frame temporal smoother  (eliminates label flicker)\n\n"
                      "Keys:  M = mesh   X = xai   Y = yolo boxes   Q = quit",
                 font=("Courier New", 9), fg=self.MUTED, bg=self.DARK,
                 justify="left").pack(anchor="w", pady=(0, 12))

        self.status_var = tk.StringVar(value="● Idle")
        self._sl = tk.Label(body, textvariable=self.status_var,
                            font=("Courier New", 10, "bold"),
                            fg=self.MUTED, bg=self.DARK)
        self._sl.pack(anchor="w", pady=(0, 12))

        row = tk.Frame(body, bg=self.DARK)
        row.pack(anchor="w")

        def _btn(text, cmd, fg):
            return tk.Button(row, text=text, command=cmd,
                             font=("Courier New", 10, "bold"),
                             fg=fg, bg=self.PANEL,
                             activeforeground=fg, activebackground=self.PANEL,
                             relief="flat", padx=20, pady=8,
                             cursor="hand2", borderwidth=0)

        self.start_btn = _btn("▶  Start", self.start_tracking, self.GREEN)
        self.start_btn.grid(row=0, column=0, padx=(0, 10))
        self.stop_btn  = _btn("■  Stop",  self.stop_tracking,  self.RED)
        self.stop_btn.grid(row=0, column=1)
        self.stop_btn.config(state="disabled")

    def _set_status(self, text, color):
        self.status_var.set(text)
        self._sl.config(fg=color)

    def _run_tracker(self):
        ok = run_tracking(self.stop_event)
        self.root.after(0, lambda: self._on_finished(ok))

    def _on_finished(self, ok):
        self.start_btn.config(state="normal")
        self.stop_btn.config(state="disabled")
        self.worker = None
        self.stop_event.clear()
        if ok:
            self._set_status("● Session completed", self.GREEN)
        else:
            self._set_status("● Webcam error", self.RED)
            messagebox.showerror("Error", "Cannot open webcam.")

    def start_tracking(self):
        if self.worker and self.worker.is_alive():
            return
        self.stop_event.clear()
        self._set_status("● Running…", self.ACCENT)
        self.start_btn.config(state="disabled")
        self.stop_btn.config(state="normal")
        self.worker = threading.Thread(target=self._run_tracker, daemon=True)
        self.worker.start()

    def stop_tracking(self):
        if self.worker and self.worker.is_alive():
            self._set_status("● Stopping…", self.MUTED)
            self.stop_event.set()

    def on_close(self):
        self.stop_event.set()
        self.root.destroy()

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    TrackerUI().run()