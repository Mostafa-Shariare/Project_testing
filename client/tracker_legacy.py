"""
attention_tracker.py
====================
Advanced Attention Tracker — MediaPipe FaceLandmarker Edition
Upgraded pipeline with XAI-aware model integration and redesigned UI.

Features
────────
  • Gaze direction  (Left / Center / Right via eye-corner geometry)
  • Head pose       (Pitch / Yaw / Roll — solvePnP)
  • Blink detection & rolling blink-rate (EAR state machine)
  • Drowsiness / distraction alerts
  • Random-Forest model classification (attention_model.py)
  • Model probability displayed as a live confidence ring
  • XAI quick-view: top SHAP reason shown on HUD
  • Dual-score: heuristic attention % + model probability %
  • Post-session dashboard (matplotlib)

Controls
────────
  M         — Toggle 478-point landmark mesh
  X         — Toggle XAI reason overlay
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
matplotlib.use("TkAgg")          # use TkAgg so plt.show() works inside tkinter session
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
from matplotlib.patches import FancyBboxPatch

from ml.model import (
    predict_attention,
    predict_proba_attention,
    explain_prediction,
)

# ══════════════════════════════════════════════════════════════════════════════
# MediaPipe setup
# ══════════════════════════════════════════════════════════════════════════════
BaseOptions           = mp.tasks.BaseOptions
FaceLandmarker        = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
VisionRunningMode     = mp.tasks.vision.RunningMode

MODEL_PATH = "face_landmarker.task"
MODEL_URL  = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
)

if not os.path.exists(MODEL_PATH):
    print("Downloading MediaPipe face landmarker model …")
    urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
    print("Done.")

_mp_options = FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=MODEL_PATH),
    running_mode=VisionRunningMode.IMAGE,
    num_faces=1,
    min_face_detection_confidence=0.5,
    min_face_presence_confidence=0.5,
    min_tracking_confidence=0.5,
    output_face_blendshapes=True,
    output_facial_transformation_matrixes=True,
)

_landmarker_instance = None

def get_landmarker():
    global _landmarker_instance
    if _landmarker_instance is None:
        _landmarker_instance = FaceLandmarker.create_from_options(_mp_options)
    return _landmarker_instance


# ══════════════════════════════════════════════════════════════════════════════
# Constants & geometry
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

# ── Colour palette ──────────────────────────────────────────────────────────
C_BG    = (18,  20,  28)        # near-black panel background
C_PANEL = (26,  29,  43)        # slightly lighter panel
C_GOOD  = (72, 200, 120)        # green
C_WARN  = (240, 165,  32)        # amber
C_BAD   = (220,  60,  60)        # red
C_BLUE  = (100, 160, 240)        # accent blue
C_WHITE = (235, 235, 240)
C_MUTED = (140, 142, 158)
C_RING_BG = (50, 54, 74)


# ══════════════════════════════════════════════════════════════════════════════
# Helper functions
# ══════════════════════════════════════════════════════════════════════════════

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


def pose_bucket(yaw, pitch):
    if pitch > 15:  return "up"
    if pitch < -15: return "down"
    if yaw   > 15:  return "right"
    if yaw   < -15: return "left"
    return "forward"


def heuristic_attention(yaw, pitch, gaze_dir, ear_avg):
    yaw_pen   = min(abs(yaw)   / 45.0, 1.0)
    pitch_pen = min(abs(pitch) / 30.0, 1.0)
    pose_sc   = 1.0 - 0.5 * (yaw_pen + pitch_pen)
    gaze_sc   = 1.0 if gaze_dir == "Center" else 0.5
    eye_sc    = min(ear_avg / 0.25, 1.0)
    score     = pose_sc * 0.5 + gaze_sc * 0.3 + eye_sc * 0.2
    return int(np.clip(score * 100, 0, 100))


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
# Feature extraction
# ══════════════════════════════════════════════════════════════════════════════

def extract_features(frame, landmarker):
    """
    Returns (feature_dict, mediapipe_result, pose_angles, ear_avg, gaze_dir).
    The landmarker is passed in explicitly (no global stash).
    """
    h, w   = frame.shape[:2]
    rgb    = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
    result = landmarker.detect(mp_img)

    pose_angles = None
    ear_avg     = 0.3
    gaze_dir    = "Center"

    if result.face_landmarks:
        lms = result.face_landmarks[0]
        xs  = [lm.x for lm in lms]
        ys  = [lm.y for lm in lms]
        min_x, max_x = max(0.0, min(xs)), min(1.0, max(xs))
        min_y, max_y = max(0.0, min(ys)), min(1.0, max(ys))

        face_x  = float(((min_x + max_x) * 0.5) * w)
        face_y  = float(((min_y + max_y) * 0.5) * h)
        face_w  = float((max_x - min_x) * w)
        face_h  = float((max_y - min_y) * h)
        face_con = 95.0
        no_of_face = 1

        pose_angles = estimate_head_pose(lms, w, h)
        if pose_angles:
            pitch, yaw, _ = pose_angles
            pose_x  = float(yaw)
            pose_y  = float(pitch)
            pose_str = pose_bucket(yaw, pitch)
        else:
            pose_x  = 0.0
            pose_y  = 0.0
            pose_str = "forward"

        ear_l   = eye_aspect_ratio(lms, LEFT_EYE_IDS,  w, h)
        ear_r   = eye_aspect_ratio(lms, RIGHT_EYE_IDS, w, h)
        ear_avg = (ear_l + ear_r) / 2.0

        # Gaze via eye-corner horizontal span
        le = (int(lms[33].x * w),  int(lms[33].y * h))
        re = (int(lms[263].x * w), int(lms[263].y * h))
        dx = re[0] - le[0]
        gaze_dir = "Center" if -55 <= dx <= 55 else ("Right" if dx > 55 else "Left")
    else:
        face_x = face_y = face_w = face_h = face_con = 0.0
        no_of_face = 0
        pose_x = pose_y = 0.0
        pose_str = "forward"

    feat = {
        "no_of_face": no_of_face,
        "face_x": face_x, "face_y": face_y,
        "face_w": face_w, "face_h": face_h,
        "face_con": face_con,
        "no_of_hand": 0,
        "pose": pose_str,
        "pose_x": pose_x, "pose_y": pose_y,
        "phone": 0,
        "phone_x": 0.0, "phone_y": 0.0,
        "phone_w": 0.0, "phone_h": 0.0,
        "phone_con": 0.0,
    }
    return feat, result, pose_angles, ear_avg, gaze_dir


# ══════════════════════════════════════════════════════════════════════════════
# Drawing — redesigned HUD
# ══════════════════════════════════════════════════════════════════════════════

FONT  = cv2.FONT_HERSHEY_SIMPLEX
FONTB = cv2.FONT_HERSHEY_DUPLEX

def _alpha_rect(frame, x1, y1, x2, y2, color, alpha=0.72):
    """Draw a semi-transparent filled rectangle."""
    roi     = frame[y1:y2, x1:x2]
    overlay = np.full_like(roi, color)
    cv2.addWeighted(overlay, alpha, roi, 1 - alpha, 0, roi)
    frame[y1:y2, x1:x2] = roi

def _pill_bar(frame, x, y, w, h, value, max_val=100,
              fg=C_GOOD, bg=C_RING_BG, radius=4):
    """Rounded progress bar."""
    # background
    cv2.rectangle(frame, (x + radius, y), (x + w - radius, y + h), bg, -1)
    cv2.circle(frame, (x + radius,     y + h // 2), h // 2, bg, -1)
    cv2.circle(frame, (x + w - radius, y + h // 2), h // 2, bg, -1)
    # fill
    fill = max(0, int(w * min(value, max_val) / max_val))
    if fill > radius * 2:
        cv2.rectangle(frame, (x + radius, y), (x + radius + fill - radius * 2, y + h), fg, -1)
        cv2.circle(frame, (x + radius, y + h // 2), h // 2, fg, -1)
        cv2.circle(frame, (x + radius + fill - radius * 2, y + h // 2), h // 2, fg, -1)

def _confidence_arc(frame, cx, cy, r, value, fg=C_GOOD, bg=C_RING_BG, thickness=6):
    """Draw a circular arc gauge (0-100%)."""
    cv2.ellipse(frame, (cx, cy), (r, r), -90, 0, 360, bg, thickness, cv2.LINE_AA)
    end_angle = int(360 * value / 100)
    if end_angle > 0:
        cv2.ellipse(frame, (cx, cy), (r, r), -90, 0, end_angle, fg, thickness, cv2.LINE_AA)

def _score_color(v):
    if v >= 70: return C_GOOD
    if v >= 40: return C_WARN
    return C_BAD

def draw_mesh(frame, landmarks, w, h):
    for lm in landmarks:
        cv2.circle(frame, (int(lm.x * w), int(lm.y * h)), 1, (60, 200, 100), -1)

def draw_hud(frame, info: dict, show_xai: bool = False):
    H, W = frame.shape[:2]

    # ── LEFT PANEL  (220 px wide) ────────────────────────────────────────
    PW = 230
    _alpha_rect(frame, 0, 0, PW, H, C_BG, alpha=0.78)

    # Title strip
    _alpha_rect(frame, 0, 0, PW, 36, C_PANEL, alpha=0.95)
    cv2.putText(frame, "ATTENTION TRACKER", (10, 24),
                FONT, 0.48, C_BLUE, 1, cv2.LINE_AA)

    row = 55
    dy  = 26

    # Session timer
    elapsed = info.get("elapsed", 0)
    m, s = divmod(int(elapsed), 60)
    cv2.putText(frame, f"Session  {m:02d}:{s:02d}", (10, row),
                FONT, 0.44, C_MUTED, 1, cv2.LINE_AA)
    row += dy

    # Gaze
    gaze     = info.get("gaze", "—")
    gaze_col = C_GOOD if gaze == "Center" else (C_WARN if gaze in ("Left","Right") else C_BAD)
    cv2.putText(frame, f"Gaze     {gaze}", (10, row),
                FONT, 0.44, gaze_col, 1, cv2.LINE_AA)
    row += dy

    # Head pose
    pose = info.get("pose")
    if pose:
        p, y, r = pose
        cv2.putText(frame, f"Pitch    {p:+.1f}\u00b0", (10, row),
                    FONT, 0.42, C_MUTED, 1, cv2.LINE_AA)
        row += 20
        cv2.putText(frame, f"Yaw      {y:+.1f}\u00b0", (10, row),
                    FONT, 0.42, C_MUTED, 1, cv2.LINE_AA)
        row += 20
        cv2.putText(frame, f"Roll     {r:+.1f}\u00b0", (10, row),
                    FONT, 0.42, C_MUTED, 1, cv2.LINE_AA)
        row += dy
    else:
        row += dy

    # EAR
    ear     = info.get("ear", 0.0)
    ear_col = C_BAD if ear < EAR_THRESH else C_GOOD
    cv2.putText(frame, f"EAR      {ear:.3f}", (10, row),
                FONT, 0.42, ear_col, 1, cv2.LINE_AA)
    row += dy

    # Blink count + rate
    blinks = info.get("blinks", 0)
    bpm    = info.get("blinks_per_min", 0.0)
    bpm_col = C_WARN if bpm > 25 else C_MUTED
    cv2.putText(frame, f"Blinks   {blinks}", (10, row),
                FONT, 0.42, C_MUTED, 1, cv2.LINE_AA)
    row += 20
    cv2.putText(frame, f"Rate     {bpm:.1f}/min", (10, row),
                FONT, 0.42, bpm_col, 1, cv2.LINE_AA)
    row += dy + 4

    # ── Heuristic attention bar ────────────────────────────────────────
    attn = info.get("attention", 0)
    a_col = _score_color(attn)
    cv2.putText(frame, "Heuristic Score", (10, row), FONT, 0.40, C_MUTED, 1, cv2.LINE_AA)
    row += 16
    _pill_bar(frame, 10, row, PW - 20, 12, attn, fg=a_col)
    cv2.putText(frame, f"{attn}%", (PW - 38, row + 10), FONT, 0.38, a_col, 1, cv2.LINE_AA)
    row += 22

    # ── Model probability bar ──────────────────────────────────────────
    prob = info.get("model_prob", 0.0)
    prob_pct  = int(prob * 100)
    prob_col  = _score_color(prob_pct)
    cv2.putText(frame, "Model Confidence", (10, row), FONT, 0.40, C_MUTED, 1, cv2.LINE_AA)
    row += 16
    _pill_bar(frame, 10, row, PW - 20, 12, prob_pct, fg=prob_col)
    cv2.putText(frame, f"{prob_pct}%", (PW - 38, row + 10), FONT, 0.38, prob_col, 1, cv2.LINE_AA)
    row += 28

    # ── Avg attention (rolling) ─────────────────────────────────────────
    avg = info.get("avg_attention", 0)
    cv2.putText(frame, f"Avg (10s)  {avg}%", (10, row),
                FONT, 0.42, _score_color(avg), 1, cv2.LINE_AA)
    row += dy

    # ── Model classification label ──────────────────────────────────────
    pred     = info.get("model_pred", -1)
    pred_lbl = "ATTENTIVE" if pred == 1 else ("DISTRACTED" if pred == 0 else "—")
    pred_col = C_GOOD if pred == 1 else C_BAD
    cv2.putText(frame, pred_lbl, (10, row),
                FONTB, 0.58, pred_col, 1, cv2.LINE_AA)
    row += dy

    # ── ALERT ─────────────────────────────────────────────────────────────
    alert = info.get("alert", "")
    if alert and int(time.time() * 2) % 2 == 0:
        _alpha_rect(frame, 0, row - 4, PW, row + 20, C_BAD, alpha=0.55)
        cv2.putText(frame, f"! {alert}", (8, row + 12),
                    FONT, 0.42, C_WHITE, 1, cv2.LINE_AA)
        row += 28

    # ── XAI REASON ────────────────────────────────────────────────────────
    if show_xai:
        xai_top = info.get("xai_top_reason", "")
        if xai_top:
            xai_y = min(row + 4, H - 60)
            _alpha_rect(frame, 0, xai_y, PW, xai_y + 44, C_PANEL, alpha=0.90)
            cv2.putText(frame, "XAI:", (10, xai_y + 15),
                        FONT, 0.38, C_BLUE, 1, cv2.LINE_AA)
            # Wrap long text manually
            words = xai_top.split()
            line1 = " ".join(words[:4])
            line2 = " ".join(words[4:])
            cv2.putText(frame, line1, (10, xai_y + 30),
                        FONT, 0.36, C_WHITE, 1, cv2.LINE_AA)
            if line2:
                cv2.putText(frame, line2, (10, xai_y + 44),
                            FONT, 0.36, C_MUTED, 1, cv2.LINE_AA)

    # ── RIGHT-CORNER arc gauge ─────────────────────────────────────────
    cx, cy, r = W - 56, 60, 42
    _alpha_rect(frame, W - 116, 8, W - 4, 118, C_BG, alpha=0.80)
    arc_col = _score_color(prob_pct)
    _confidence_arc(frame, cx, cy, r, prob_pct, fg=arc_col, thickness=7)
    cv2.putText(frame, f"{prob_pct}%", (cx - 18, cy + 6),
                FONT, 0.50, arc_col, 1, cv2.LINE_AA)
    cv2.putText(frame, "MODEL", (cx - 20, cy + 22),
                FONT, 0.30, C_MUTED, 1, cv2.LINE_AA)

    # ── Controls (bottom-right) ────────────────────────────────────────
    cv2.putText(frame, "M:mesh  X:xai  Q:quit",
                (W - 160, H - 10), FONT, 0.34, C_MUTED, 1, cv2.LINE_AA)


# ══════════════════════════════════════════════════════════════════════════════
# Post-session dashboard
# ══════════════════════════════════════════════════════════════════════════════

def show_dashboard(session_data: dict):
    """Render a polished post-session summary window."""
    dur         = session_data["duration_sec"]
    attn_s      = session_data["attention_series"]
    model_s     = session_data["model_attention_series"]
    prob_s      = session_data["model_prob_series"]
    blink_s     = session_data["blink_timeline"]

    avg_attn    = int(np.mean(attn_s))   if attn_s  else 0
    avg_prob    = float(np.mean(prob_s)) if prob_s  else 0.0
    attn_ratio  = 100.0 * sum(model_s) / len(model_s) if model_s else 0.0
    max_bpm     = max(blink_s) if blink_s else 0

    # ── Figure layout ──────────────────────────────────────────────────
    fig = plt.figure(figsize=(14, 8), facecolor="#12141C")
    gs  = gridspec.GridSpec(2, 3, figure=fig,
                            hspace=0.45, wspace=0.35,
                            left=0.07, right=0.97, top=0.88, bottom=0.10)

    DARK  = "#12141C"
    PANEL = "#1E2130"
    BLUE  = "#5AA0F0"
    GREEN = "#48C87A"
    AMBER = "#F0A530"
    RED   = "#E04040"
    WHITE = "#EAEAF2"
    MUTED = "#7A7C8E"

    plt.rcParams.update({
        "text.color": WHITE, "axes.labelcolor": MUTED,
        "xtick.color": MUTED, "ytick.color": MUTED,
        "axes.edgecolor": PANEL,
        "font.family": "monospace",
    })

    fig.suptitle("Attention Session Report", fontsize=17, fontweight="bold",
                 color=WHITE, y=0.96)

    # ── Panel 0,0 — KPI summary ─────────────────────────────────────────
    ax0 = fig.add_subplot(gs[0, 0])
    ax0.set_facecolor(PANEL)
    ax0.set_axis_off()
    m, s = divmod(int(dur), 60)
    kpis = [
        ("Duration",          f"{m:02d}:{s:02d}",       WHITE),
        ("Total Blinks",      str(session_data["total_blinks"]), WHITE),
        ("Avg Heuristic",     f"{avg_attn}%",            GREEN if avg_attn >= 70 else AMBER),
        ("Avg Model Conf",    f"{avg_prob*100:.1f}%",    GREEN if avg_prob >= 0.7 else AMBER),
        ("Attentive Ratio",   f"{attn_ratio:.1f}%",      GREEN if attn_ratio >= 70 else AMBER),
        ("Max Blink Rate",    f"{max_bpm:.0f}/min",      AMBER if max_bpm > 25 else WHITE),
    ]
    for i, (lbl, val, col) in enumerate(kpis):
        y = 0.88 - i * 0.16
        ax0.text(0.05, y, lbl, transform=ax0.transAxes,
                 fontsize=9,  color=MUTED,  va="top")
        ax0.text(0.95, y, val, transform=ax0.transAxes,
                 fontsize=11, color=col, va="top", ha="right", fontweight="bold")
    ax0.set_title("Session KPIs", color=WHITE, fontsize=10, pad=8)

    # ── Panel 0,1 — Heuristic attention timeline ─────────────────────────
    ax1 = fig.add_subplot(gs[0, 1])
    ax1.set_facecolor(PANEL)
    if attn_s:
        xs = np.linspace(0, dur / 60, len(attn_s))
        ax1.fill_between(xs, attn_s, alpha=0.18, color=GREEN)
        ax1.plot(xs, attn_s, color=GREEN, linewidth=1.2)
        ax1.axhline(70, color=AMBER, linewidth=0.7, linestyle="--", alpha=0.6)
        ax1.set_ylim(0, 105)
        ax1.set_xlabel("Minutes")
        ax1.set_ylabel("Score (%)")
    ax1.set_title("Heuristic Attention Score", color=WHITE, fontsize=10, pad=8)
    ax1.tick_params(colors=MUTED)
    for sp in ax1.spines.values(): sp.set_edgecolor(PANEL)

    # ── Panel 0,2 — Model probability timeline ──────────────────────────
    ax2 = fig.add_subplot(gs[0, 2])
    ax2.set_facecolor(PANEL)
    if prob_s:
        xp = np.linspace(0, dur / 60, len(prob_s))
        ax2.fill_between(xp, prob_s, alpha=0.18, color=BLUE)
        ax2.plot(xp, prob_s, color=BLUE, linewidth=1.2)
        ax2.axhline(0.70, color=AMBER, linewidth=0.7, linestyle="--", alpha=0.6)
        ax2.set_ylim(0, 1.05)
        ax2.set_xlabel("Minutes")
        ax2.set_ylabel("P(Attentive)")
    ax2.set_title("Model Confidence Over Time", color=WHITE, fontsize=10, pad=8)
    ax2.tick_params(colors=MUTED)
    for sp in ax2.spines.values(): sp.set_edgecolor(PANEL)

    # ── Panel 1,0 — Pie chart ────────────────────────────────────────────
    ax3 = fig.add_subplot(gs[1, 0])
    ax3.set_facecolor(PANEL)
    if model_s:
        ac = int(sum(model_s))
        dc = len(model_s) - ac
        wedges, texts, autotexts = ax3.pie(
            [ac, dc],
            labels=["Attentive", "Distracted"],
            autopct="%1.1f%%",
            colors=[GREEN, RED],
            startangle=90,
            wedgeprops=dict(edgecolor=DARK, linewidth=1.5),
            textprops=dict(color=WHITE, fontsize=9),
        )
        for at in autotexts: at.set_color(DARK); at.set_fontweight("bold")
    ax3.set_title("Classification Distribution", color=WHITE, fontsize=10, pad=8)

    # ── Panel 1,1 — Blink rate trend ────────────────────────────────────
    ax4 = fig.add_subplot(gs[1, 1])
    ax4.set_facecolor(PANEL)
    if blink_s:
        xb = np.linspace(0, dur / 60, len(blink_s))
        ax4.fill_between(xb, blink_s, alpha=0.18, color=AMBER)
        ax4.plot(xb, blink_s, color=AMBER, linewidth=1.2)
        ax4.axhline(25, color=RED, linewidth=0.7, linestyle="--", alpha=0.6,
                    label="Drowsiness threshold")
        ax4.legend(fontsize=7, labelcolor=MUTED, facecolor=PANEL, edgecolor=PANEL)
        ax4.set_xlabel("Minutes")
        ax4.set_ylabel("Blinks / min")
    ax4.set_title("Blink Rate Trend", color=WHITE, fontsize=10, pad=8)
    ax4.tick_params(colors=MUTED)
    for sp in ax4.spines.values(): sp.set_edgecolor(PANEL)

    # ── Panel 1,2 — Model vs Heuristic scatter ──────────────────────────
    ax5 = fig.add_subplot(gs[1, 2])
    ax5.set_facecolor(PANEL)
    if attn_s and prob_s:
        n    = min(len(attn_s), len(prob_s))
        xa   = np.array(attn_s[:n])
        ya   = np.array(prob_s[:n]) * 100
        cols = [GREEN if m == 1 else RED for m in model_s[:n]]
        ax5.scatter(xa, ya, c=cols, s=4, alpha=0.45, rasterized=True)
        # identity line
        lim = max(xa.max(), ya.max(), 100)
        ax5.plot([0, lim], [0, lim], color=MUTED, linewidth=0.6, linestyle="--")
        ax5.set_xlim(0, 105); ax5.set_ylim(0, 105)
        ax5.set_xlabel("Heuristic Score (%)")
        ax5.set_ylabel("Model Confidence (%)")
    ax5.set_title("Heuristic vs Model", color=WHITE, fontsize=10, pad=8)
    ax5.tick_params(colors=MUTED)
    for sp in ax5.spines.values(): sp.set_edgecolor(PANEL)

    plt.show()


# ══════════════════════════════════════════════════════════════════════════════
# XAI background worker
# ══════════════════════════════════════════════════════════════════════════════

class XAIWorker:
    """
    Runs explain_prediction() in a background thread every N frames
    so the main loop never blocks.
    """
    def __init__(self, every_n: int = 15):
        self.every_n  = every_n
        self.result   = {}
        self._lock    = threading.Lock()
        self._pending = False
        self._counter = 0

    def tick(self, features: dict):
        self._counter += 1
        if self._counter % self.every_n != 0:
            return
        if self._pending:
            return
        self._pending = True
        t = threading.Thread(target=self._run, args=(dict(features),), daemon=True)
        t.start()

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
            return f"▲ {f}: {v:+.3f}"
        if pred == 0 and r.get("top_negative"):
            f, v = r["top_negative"][0]
            return f"▼ {f}: {v:+.3f}"
        return ""


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

    landmarker   = get_landmarker()
    blink_det    = BlinkDetector()
    xai_worker   = XAIWorker(every_n=20)
    show_mesh    = False
    show_xai_hud = True
    start_time   = time.time()

    attn_hist       = []
    model_attn_hist = []
    model_prob_hist = []
    blink_rate_hist = []

    # Probe model availability
    _probe = {k: 0 for k in FEATURE_KEYS}
    _probe["pose"] = "forward"
    try:
        predict_attention(_probe)
        model_ok = True
    except Exception as e:
        model_ok = False
        print(f"[WARN] Model unavailable: {e}. Using heuristic only.")

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            break

        frame = cv2.flip(frame, 1)
        H, W  = frame.shape[:2]

        feat, mp_result, pose_angles, ear_avg, gaze_dir = extract_features(frame, landmarker)
        blink_det.update(ear_avg)

        info = {"elapsed": time.time() - start_time}

        if mp_result.face_landmarks:
            lms = mp_result.face_landmarks[0]
            if show_mesh:
                draw_mesh(frame, lms, W, H)

            # Key landmarks
            for idx, col in [(1, (0,255,255)), (33, (255,200,0)), (263, (255,200,0))]:
                cv2.circle(frame, (int(lms[idx].x * W), int(lms[idx].y * H)),
                           4, col, -1, cv2.LINE_AA)

            info["gaze"] = gaze_dir
            info["pose"] = pose_angles
            info["ear"]  = ear_avg
            info["blinks"]         = blink_det.total
            info["blinks_per_min"] = blink_det.blinks_per_minute()

            # Heuristic score
            if pose_angles:
                h_score = heuristic_attention(pose_angles[1], pose_angles[0], gaze_dir, ear_avg)
            else:
                h_score = heuristic_attention(0, 0, gaze_dir, ear_avg)

            # Model prediction + probability
            if model_ok:
                try:
                    model_pred = predict_attention(feat)
                    model_prob = predict_proba_attention(feat)
                except Exception:
                    model_pred = int(h_score >= 50)
                    model_prob = h_score / 100.0
            else:
                model_pred = int(h_score >= 50)
                model_prob = h_score / 100.0

            # Blended attention score
            blend = int(h_score * 0.55 + model_prob * 100 * 0.45)

            attn_hist.append(blend)
            model_attn_hist.append(model_pred)
            model_prob_hist.append(model_prob)
            blink_rate_hist.append(blink_det.blinks_per_minute())

            info["attention"]     = blend
            info["avg_attention"] = int(np.mean(attn_hist[-300:]))
            info["model_pred"]    = model_pred
            info["model_prob"]    = model_prob

            # XAI background
            xai_worker.tick(feat)
            info["xai_top_reason"] = xai_worker.top_reason()

            # Alerts
            bpm = blink_det.blinks_per_minute()
            if blink_det.eyes_closed:
                info["alert"] = "EYES CLOSED"
            elif bpm > 25:
                info["alert"] = "HIGH BLINK RATE"
            elif blend < 35:
                info["alert"] = "LOW ATTENTION"
            else:
                info["alert"] = ""

        else:
            info.update({
                "gaze": "No Face",   "pose": None,
                "ear":  0.0,         "blinks": blink_det.total,
                "blinks_per_min":    blink_det.blinks_per_minute(),
                "attention": 0,      "avg_attention": int(np.mean(attn_hist[-300:])) if attn_hist else 0,
                "model_pred": -1,    "model_prob": 0.0,
                "alert": "NO FACE",  "xai_top_reason": "",
            })
            model_attn_hist.append(0)
            model_prob_hist.append(0.0)
            blink_rate_hist.append(blink_det.blinks_per_minute())

        draw_hud(frame, info, show_xai=show_xai_hud)
        cv2.imshow("Attention Tracker", frame)

        key = cv2.waitKey(1) & 0xFF
        if key in (27, ord("q"), ord("Q")):
            stop_event.set()
            break
        elif key in (ord("m"), ord("M")):
            show_mesh = not show_mesh
        elif key in (ord("x"), ord("X")):
            show_xai_hud = not show_xai_hud

    cap.release()
    cv2.destroyAllWindows()

    # Print summary
    dur     = time.time() - start_time
    m_, s_  = divmod(int(dur), 60)
    avg_    = int(np.mean(attn_hist)) if attn_hist else 0
    print(f"\n── Session Summary ─────────────────────────────")
    print(f"  Duration      : {m_:02d}:{s_:02d}")
    print(f"  Total blinks  : {blink_det.total}")
    print(f"  Avg attention : {avg_}%")
    print(f"  Avg model conf: {np.mean(model_prob_hist)*100:.1f}%")
    print(f"────────────────────────────────────────────────\n")

    show_dashboard({
        "duration_sec":          dur,
        "total_blinks":          blink_det.total,
        "attention_series":      attn_hist,
        "model_attention_series": model_attn_hist,
        "model_prob_series":     model_prob_hist,
        "blink_timeline":        blink_rate_hist,
    })
    return True


# ══════════════════════════════════════════════════════════════════════════════
# Tkinter control panel
# ══════════════════════════════════════════════════════════════════════════════

class TrackerUI:
    """Minimal control panel — Start / Stop / Status."""

    DARK   = "#12141C"
    PANEL  = "#1E2130"
    ACCENT = "#5AA0F0"
    WHITE  = "#EAEAF2"
    MUTED  = "#5C5E72"
    GREEN  = "#48C87A"
    RED    = "#E04040"

    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Attention Tracker")
        self.root.geometry("480x280")
        self.root.resizable(False, False)
        self.root.configure(bg=self.DARK)

        self.stop_event = threading.Event()
        self.worker     = None
        self._build()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    # ── UI construction ──────────────────────────────────────────────────────

    def _build(self):
        # Header
        hdr = tk.Frame(self.root, bg=self.PANEL, height=52)
        hdr.pack(fill="x")
        tk.Label(
            hdr, text="ATTENTION TRACKER",
            font=("Courier New", 14, "bold"),
            fg=self.ACCENT, bg=self.PANEL,
        ).pack(pady=14)

        # Body
        body = tk.Frame(self.root, bg=self.DARK, padx=28, pady=18)
        body.pack(fill="both", expand=True)

        tk.Label(
            body,
            text="Press  Start  to begin webcam analysis.\n"
                 "Press  Stop  to end the session and view the dashboard.\n"
                 "Keys:  M = mesh   X = XAI overlay   Q = quit",
            font=("Courier New", 9),
            fg=self.MUTED, bg=self.DARK, justify="left",
        ).pack(anchor="w", pady=(0, 12))

        # Status
        self.status_var = tk.StringVar(value="● Idle")
        self._status_lbl = tk.Label(
            body, textvariable=self.status_var,
            font=("Courier New", 10, "bold"),
            fg=self.MUTED, bg=self.DARK,
        )
        self._status_lbl.pack(anchor="w", pady=(0, 16))

        # Buttons
        btn_row = tk.Frame(body, bg=self.DARK)
        btn_row.pack(anchor="w")

        def _btn(parent, text, cmd, fg, active_fg):
            return tk.Button(
                parent, text=text, command=cmd,
                font=("Courier New", 10, "bold"),
                fg=fg, bg=self.PANEL,
                activeforeground=active_fg,
                activebackground=self.PANEL,
                relief="flat", padx=20, pady=8,
                cursor="hand2", borderwidth=0,
            )

        self.start_btn = _btn(btn_row, "▶  Start", self.start_tracking, self.GREEN, self.GREEN)
        self.start_btn.grid(row=0, column=0, padx=(0, 10))

        self.stop_btn = _btn(btn_row, "■  Stop", self.stop_tracking, self.RED, self.RED)
        self.stop_btn.grid(row=0, column=1)
        self.stop_btn.config(state="disabled")

    # ── Logic ────────────────────────────────────────────────────────────────

    def _set_status(self, text, color):
        self.status_var.set(text)
        self._status_lbl.config(fg=color)

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
            messagebox.showerror("Error", "Cannot open webcam. Check camera permissions.")

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


# ══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    TrackerUI().run()