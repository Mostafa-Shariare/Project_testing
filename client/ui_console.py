"""
AI Vision Analysis Console — UI rendering layer (OpenCV composite layout).
Does not perform inference; only draws the professional dashboard around the camera feed.
"""

from __future__ import annotations

import collections
import time

import cv2
import numpy as np

# Layout (pixels)
PANEL_W = 360
VIDEO_W = 880
VIDEO_H = 520
TIMELINE_H = 110
FOOTER_H = 44
HEADER_H = 48
PIPE_H = 88

CANVAS_W = VIDEO_W + PANEL_W
CANVAS_H = HEADER_H + VIDEO_H + TIMELINE_H + PIPE_H + FOOTER_H + 16

# Light theme — BGR
C_BG = (252, 250, 248)
C_SURFACE = (255, 255, 255)
C_BORDER = (240, 232, 226)
C_TEXT = (42, 23, 15)
C_MUTED = (139, 116, 100)
C_PRIMARY = (235, 99, 37)
C_GREEN = (74, 163, 22)
C_BLUE = (235, 99, 37)
C_ORANGE = (12, 88, 234)
C_RED = (38, 38, 220)

FONT = cv2.FONT_HERSHEY_SIMPLEX
FONT_B = cv2.FONT_HERSHEY_DUPLEX


def score_band_color(score: int) -> tuple:
    if score >= 90:
        return C_GREEN
    if score >= 70:
        return C_BLUE
    if score >= 50:
        return C_ORANGE
    return C_RED


def focus_label(score: int, face_ok: bool) -> str:
    if not face_ok:
        return "No Face"
    if score >= 90:
        return "Excellent Focus"
    if score >= 70:
        return "Good Focus"
    if score >= 50:
        return "Moderate"
    return "Distracted"


def _fill_round_rect(img, x1, y1, x2, y2, color, alpha=1.0):
    if alpha < 1.0:
        overlay = img.copy()
        cv2.rectangle(overlay, (x1, y1), (x2, y2), color, -1)
        cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0, img)
    else:
        cv2.rectangle(img, (x1, y1), (x2, y2), color, -1)


def _card(img, x1, y1, x2, y2):
    _fill_round_rect(img, x1, y1, x2, y2, C_SURFACE)
    cv2.rectangle(img, (x1, y1), (x2, y2), C_BORDER, 1)


def _text(img, text, x, y, scale=0.45, color=C_TEXT, thickness=1, bold=False):
    f = FONT_B if bold else FONT
    cv2.putText(img, text, (x, y), f, scale, color, thickness, cv2.LINE_AA)


def _badge(img, x, y, label, bg, fg=(255, 255, 255)):
    tw = cv2.getTextSize(label, FONT, 0.38, 1)[0][0]
    w, h = tw + 16, 22
    _fill_round_rect(img, x, y, x + w, y + h, bg)
    _text(img, label, x + 8, y + 15, scale=0.38, color=fg)
    return w


def _metric_row(img, x, y, label, value, badge_bg, badge_fg=(255, 255, 255)):
    _text(img, label, x, y, scale=0.38, color=C_MUTED)
    _badge(img, x + 112, y - 14, value, badge_bg, badge_fg)


def _draw_gauge(img, cx, cy, r, value, color):
    cv2.ellipse(img, (cx, cy), (r, r), -90, 0, 360, C_BORDER, 4, cv2.LINE_AA)
    end = int(360 * max(0, min(100, value)) / 100)
    if end > 0:
        cv2.ellipse(img, (cx, cy), (r, r), -90, 0, end, color, 4, cv2.LINE_AA)
    _text(img, f"{int(value)}%", cx - 22, cy + 6, scale=0.55, color=color, bold=True)


def _draw_ai_line(img, x, y, line, color=C_TEXT):
    cv2.circle(img, (x + 6, y - 4), 3, C_PRIMARY, -1, cv2.LINE_AA)
    _text(img, line, x + 16, y, scale=0.38, color=color)


def _ai_summaries(info: dict) -> list[str]:
    lines = []
    gaze = info.get("gaze", "-")
    if gaze == "No Face" or gaze == "Away":
        lines.append("Face not detected in frame")
    else:
        lines.append("Face detected and tracked")
    if gaze == "Center":
        lines.append("Looking forward at screen")
    elif gaze in ("Left", "Right"):
        lines.append(f"Gaze shifted {gaze.lower()}")
    else:
        lines.append("Gaze direction unavailable")

    if info.get("phone_detected"):
        lines.append("Phone detected - distraction risk")
    else:
        lines.append("No phone detected")

    alert = info.get("alert", "")
    if alert == "SUSTAINED DISTRACTION":
        lines.append("Attention declining - sustained distraction")
    elif alert:
        lines.append(f"Alert active: {alert}")
    else:
        attn = info.get("attention", 0)
        if attn >= 70:
            lines.append("Stable attention maintained")
        elif attn >= 50:
            lines.append("Attention fluctuating")
        else:
            lines.append("Low attention - refocus recommended")
    return lines[:4]


def _draw_timeline(img, x, y, w, h, series: collections.deque, color):
    _card(img, x, y, x + w, y + h)
    _text(img, "Live Attention Timeline (60s)", x + 14, y + 22, scale=0.42, color=C_MUTED)
    if len(series) < 2:
        _text(img, "Collecting samples...", x + 14, y + 58, scale=0.42, color=C_MUTED)
        return
    # ~30 fps × 60 s — show trailing window only
    data = list(series)[-1800:]
    pad_x, pad_y = 14, 32
    gw, gh = w - pad_x * 2, h - pad_y - 14
    gx, gy = x + pad_x, y + pad_y
    cv2.rectangle(img, (gx, gy), (gx + gw, gy + gh), C_BORDER, 1)
    pts = []
    for i, v in enumerate(data):
        px = gx + int(i * gw / max(len(data) - 1, 1))
        py = gy + gh - int(max(0, min(100, v)) * gh / 100)
        pts.append((px, py))
    for i in range(1, len(pts)):
        cv2.line(img, pts[i - 1], pts[i], color, 2, cv2.LINE_AA)
    for t in (50, 70, 90):
        ly = gy + gh - int(t * gh / 100)
        cv2.line(img, (gx, ly), (gx + gw, ly), (245, 245, 245), 1)


def _draw_pipeline(img, x, y, w, collapsed: bool):
    h = 36 if collapsed else PIPE_H
    _card(img, x, y, x + w, y + h)
    _text(img, "CV Pipeline", x + 12, y + 22, scale=0.42, color=C_TEXT, bold=True)
    if collapsed:
        _text(img, "[Press P to expand]", x + 120, y + 22, scale=0.36, color=C_MUTED)
        return h
    steps = [
        "Webcam",
        "Face Det.",
        "Landmarks",
        "Gaze Est.",
        "Head Pose",
        "RF Model",
        "Score",
    ]
    sx = x + 12
    sy = y + 48
    step_w = (w - 24) // len(steps)
    for i, step in enumerate(steps):
        cx = sx + i * step_w + step_w // 2
        cv2.circle(img, (cx, sy), 6, C_PRIMARY, -1, cv2.LINE_AA)
        _text(img, step, cx - step_w // 2 + 4, sy + 22, scale=0.32, color=C_MUTED)
        if i < len(steps) - 1:
            cv2.arrowedLine(
                img, (cx + 10, sy), (cx + step_w - 10, sy), C_BORDER, 1, tipLength=0.35
            )
    return h


def _draw_toggles(img, x, y, w, toggles: dict):
    _fill_round_rect(img, x, y, x + w, y + FOOTER_H, C_SURFACE)
    cv2.line(img, (x, y), (x + w, y), C_BORDER, 1)
    labels = [
        ("mesh", "Mesh [M]"),
        ("bbox", "BBox [Y]"),
        ("face", "Face [B]"),
        ("pose", "Pose [H]"),
        ("iris", "Iris [I]"),
        ("hands", "Hands [L]"),
        ("xai", "XAI [X]"),
        ("pipeline", "Pipe [P]"),
    ]
    tx = x + 12
    for key, lbl in labels:
        on = toggles.get(key, False)
        bg = C_PRIMARY if on else (241, 245, 249)
        fg = (255, 255, 255) if on else C_MUTED
        tw = cv2.getTextSize(lbl, FONT, 0.34, 1)[0][0]
        _fill_round_rect(img, tx, y + 10, tx + tw + 14, y + 32, bg)
        _text(img, lbl, tx + 7, y + 26, scale=0.34, color=fg)
        tx += tw + 22
    _text(img, "Quit [Q]", x + w - 70, y + 26, scale=0.34, color=C_MUTED)


def draw_hand_landmarks(frame, hand_landmarks_list, w, h):
    for hand in hand_landmarks_list or []:
        for lm in hand:
            cv2.circle(frame, (int(lm.x * w), int(lm.y * h)), 3, (255, 180, 80), -1, cv2.LINE_AA)


def draw_face_bbox(frame, landmarks, w, h):
    xs = [lm.x for lm in landmarks]
    ys = [lm.y for lm in landmarks]
    x1 = int(max(0, min(xs)) * w)
    y1 = int(max(0, min(ys)) * h)
    x2 = int(min(1, max(xs)) * w)
    y2 = int(min(1, max(ys)) * h)
    cv2.rectangle(frame, (x1, y1), (x2, y2), C_PRIMARY, 2, cv2.LINE_AA)


def draw_iris_markers(frame, landmarks, w, h):
    for idx in (468, 473):
        if idx < len(landmarks):
            lm = landmarks[idx]
            cv2.circle(frame, (int(lm.x * w), int(lm.y * h)), 5, (180, 80, 255), -1, cv2.LINE_AA)


def draw_head_pose_markers(frame, landmarks, w, h):
    for idx, col in [(1, (0, 255, 255)), (33, (255, 200, 0)), (263, (255, 200, 0))]:
        if idx < len(landmarks):
            lm = landmarks[idx]
            cv2.circle(frame, (int(lm.x * w), int(lm.y * h)), 5, col, -1, cv2.LINE_AA)


class AnalysisConsole:
    """Builds the composite AI vision console frame each tick."""

    def __init__(self):
        self.timeline = collections.deque(maxlen=1800)

    def compose(
        self,
        camera_frame: np.ndarray,
        info: dict,
        toggles: dict,
        *,
        pipeline_collapsed: bool,
    ) -> np.ndarray:
        self.timeline.append(int(info.get("attention", 0)))

        canvas = np.full((CANVAS_H, CANVAS_W, 3), C_BG, dtype=np.uint8)

        # ── Top header bar ─────────────────────────────────────────────
        _fill_round_rect(canvas, 0, 0, CANVAS_W, 40, C_SURFACE)
        cv2.line(canvas, (0, 40), (CANVAS_W, 40), C_BORDER, 1)
        _text(canvas, "AttentionAI", 16, 28, scale=0.52, color=C_PRIMARY, bold=True)
        _text(canvas, "Vision Analysis Console", 118, 28, scale=0.44, color=C_TEXT)
        _text(
            canvas,
            self._session_str(info),
            CANVAS_W - 90,
            28,
            scale=0.42,
            color=C_MUTED,
        )

        content_top = HEADER_H + 8
        video_bottom = content_top + VIDEO_H - 8

        # ── Video area ───────────────────────────────────────────────
        _card(canvas, 8, content_top, VIDEO_W - 8, video_bottom)
        vid = cv2.resize(camera_frame, (VIDEO_W - 24, VIDEO_H - 24))
        vy = content_top + 8
        canvas[vy : vy + vid.shape[0], 16 : 16 + vid.shape[1]] = vid
        _text(canvas, "Live Vision Feed", 20, vy + 20, scale=0.42, color=C_MUTED)

        # ── Right analytics panel ────────────────────────────────────
        px = VIDEO_W
        panel_bottom = CANVAS_H - FOOTER_H - 8
        _card(canvas, px + 8, HEADER_H + 8, CANVAS_W - 8, panel_bottom)

        score = int(info.get("attention", 0))
        col = score_band_color(score)
        face_ok = info.get("gaze") not in ("No Face", "Away", "-")

        gauge_cy = HEADER_H + 64
        _draw_gauge(canvas, px + PANEL_W // 2 + 8, gauge_cy, 50, score, col)
        _text(canvas, "Attention Score", px + 24, gauge_cy + 62, scale=0.42, color=C_MUTED)
        fl = focus_label(score, face_ok)
        _badge(canvas, px + 24, gauge_cy + 72, fl, col)

        row_y = gauge_cy + 118
        gaze = str(info.get("gaze", "-"))
        gaze_bg = C_GREEN if gaze == "Center" else (C_ORANGE if gaze in ("Left", "Right") else C_RED)
        _metric_row(canvas, px + 24, row_y, "Gaze", gaze[:14], gaze_bg)
        row_y += 30

        pose_str = self._pose_str(info)
        pose_bg = C_GREEN if pose_str != "-" and face_ok else C_MUTED
        _metric_row(canvas, px + 24, row_y, "Head Pose", pose_str[:20], pose_bg, C_TEXT)
        row_y += 30

        bpm = info.get("blinks_per_min", 0)
        blink_bg = C_ORANGE if bpm > 25 else (C_BLUE if bpm > 0 else C_MUTED)
        _metric_row(canvas, px + 24, row_y, "Blink Rate", f"{bpm:.1f}/min", blink_bg)
        row_y += 30

        phone_on = info.get("phone_detected")
        _metric_row(
            canvas,
            px + 24,
            row_y,
            "Phone",
            "Detected" if phone_on else "Clear",
            C_RED if phone_on else C_GREEN,
        )
        row_y += 30

        alert = info.get("alert", "")
        alert_bg = C_RED if alert else C_GREEN
        alert_lbl = alert[:18] if alert else "None"
        _metric_row(canvas, px + 24, row_y, "Active Alert", alert_lbl, alert_bg)
        row_y += 30

        _metric_row(canvas, px + 24, row_y, "Session", self._session_str(info), C_BLUE)
        row_y += 34

        # ── AI Analysis (right column, lower section) ───────────────
        ai_top = max(row_y + 8, HEADER_H + VIDEO_H // 2)
        _text(canvas, "AI Analysis", px + 24, ai_top, scale=0.44, color=C_TEXT, bold=True)
        for i, line in enumerate(_ai_summaries(info)):
            _draw_ai_line(canvas, px + 24, ai_top + 26 + i * 22, line)

        if info.get("xai_top_reason") and toggles.get("xai"):
            _text(
                canvas,
                f"XAI: {info['xai_top_reason'][:36]}",
                px + 24,
                panel_bottom - 16,
                scale=0.34,
                color=C_MUTED,
            )

        # ── Timeline (below video, left) ───────────────────────────
        ty = video_bottom + 4
        _draw_timeline(canvas, 8, ty + 4, VIDEO_W - 16, TIMELINE_H - 8, self.timeline, col)

        # ── Pipeline (collapsible, below timeline) ─────────────────
        pipe_y = ty + TIMELINE_H + 4
        _draw_pipeline(canvas, 8, pipe_y, VIDEO_W - 16, pipeline_collapsed)

        # ── Footer toggles ───────────────────────────────────────────
        fy = CANVAS_H - FOOTER_H
        _draw_toggles(canvas, 0, fy, CANVAS_W, toggles)

        return canvas

    @staticmethod
    def _pose_str(info: dict) -> str:
        pose = info.get("pose")
        if not pose:
            return "-"
        p, y, r = pose
        return f"P{p:+.0f} Y{y:+.0f} R{r:+.0f}"

    @staticmethod
    def _session_str(info: dict) -> str:
        elapsed = int(info.get("elapsed", 0))
        m, s = divmod(elapsed, 60)
        return f"{m:02d}:{s:02d}"
