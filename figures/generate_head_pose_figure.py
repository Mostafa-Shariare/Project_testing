"""
Generate Figure 3.3 — Head Pose Estimation Methodology Figure
==============================================================
Captures a single webcam frame, detects face landmarks via MediaPipe,
runs solvePnP with the same 6 landmarks used by the Visoria pipeline,
and renders:
  • The 6 pose-estimation landmarks (colour-coded, labelled)
  • Projected 3-D pitch / yaw / roll axis arrows from the nose tip
  • Angle annotations

Usage:
    python generate_head_pose_figure.py

Press SPACE to capture a frame, or wait 5 seconds for auto-capture.
The result is saved as  figures/head_pose_estimation.png
"""

import sys, os, time
from pathlib import Path

# Add project root so we can reuse the MediaPipe model path
REPO_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(REPO_ROOT))

import cv2
import numpy as np
import mediapipe as mp

# ── MediaPipe Face Landmarker setup (reuse project's downloaded model) ──────
from client.tracker import (
    FACE_MODEL_PATH,
    POSE_POINT_IDS,      # [1, 199, 33, 263, 61, 291]
    MODEL_3D,
)

BaseOptions           = mp.tasks.BaseOptions
FaceLandmarker        = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
VisionRunningMode     = mp.tasks.vision.RunningMode

# ── 3-D model points (same as tracker.py) ───────────────────────────────────
# POSE_POINT_IDS = [1, 199, 33, 263, 61, 291]
#   idx  0 → Nose tip          (landmark 1)
#   idx  1 → Chin              (landmark 199)
#   idx  2 → Left eye corner   (landmark 33)
#   idx  3 → Right eye corner  (landmark 263)
#   idx  4 → Left mouth corner (landmark 61)
#   idx  5 → Right mouth corner(landmark 291)

LANDMARK_LABELS = [
    "Nose Tip",
    "Chin",
    "Left Eye",
    "Right Eye",
    "Left Mouth",
    "Right Mouth",
]

# Distinct colours (BGR) for each landmark
LANDMARK_COLORS = [
    (0, 255, 255),   # Nose Tip     – yellow
    (0, 165, 255),   # Chin         – orange
    (255, 200, 0),   # Left Eye     – cyan-blue
    (255, 200, 0),   # Right Eye    – cyan-blue
    (147, 20, 255),  # Left Mouth   – pink
    (147, 20, 255),  # Right Mouth  – pink
]

# Axis colours (BGR): X = blue, Y = green, Z = red  (OpenCV convention)
AXIS_COLORS = {
    "Yaw":   (255, 80,  80),    # Blue  → X-axis (yaw)
    "Pitch": (80,  220, 80),    # Green → Y-axis (pitch)
    "Roll":  (80,  80,  255),   # Red   → Z-axis (roll)
}
AXIS_LENGTH = 80  # pixels


def build_face_landmarker():
    opts = FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=FACE_MODEL_PATH),
        running_mode=VisionRunningMode.IMAGE,
        num_faces=1,
        min_face_detection_confidence=0.5,
        min_face_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        output_face_blendshapes=False,
        output_facial_transformation_matrixes=True,
    )
    return FaceLandmarker.create_from_options(opts)


def estimate_head_pose(landmarks, w, h):
    """Run solvePnP with the project's exact 6 landmarks. Returns (pitch, yaw, roll, rot_vec, tvec, image_pts)."""
    image_pts = np.array(
        [(landmarks[i].x * w, landmarks[i].y * h) for i in POSE_POINT_IDS],
        dtype=np.float64,
    )
    focal      = float(w)
    cam_matrix = np.array(
        [[focal, 0, w / 2], [0, focal, h / 2], [0, 0, 1]], dtype=np.float64,
    )
    dist_coeffs = np.zeros((4, 1))
    ok, rot_vec, tvec = cv2.solvePnP(
        MODEL_3D, image_pts, cam_matrix, dist_coeffs,
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

    return pitch, yaw, roll, rot_vec, tvec, image_pts, cam_matrix, dist_coeffs


def draw_figure(frame, landmarks, w, h, pose_result):
    """Draw the 6 landmarks, axis arrows, and annotations onto the frame."""
    pitch, yaw, roll, rot_vec, tvec, image_pts, cam_matrix, dist_coeffs = pose_result

    # ── Draw the 6 landmarks with labels ────────────────────────────────
    for i, (lm_idx, label, color) in enumerate(
        zip(POSE_POINT_IDS, LANDMARK_LABELS, LANDMARK_COLORS)
    ):
        cx = int(landmarks[lm_idx].x * w)
        cy = int(landmarks[lm_idx].y * h)

        # Outer ring + filled center
        cv2.circle(frame, (cx, cy), 8, color, 2, cv2.LINE_AA)
        cv2.circle(frame, (cx, cy), 3, color, -1, cv2.LINE_AA)

        # Label with background for readability
        label_text = f"{label} (#{lm_idx})"
        (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)

        # Offset label to avoid overlap
        offsets = [
            (-tw // 2, -18),   # Nose – above
            (-tw // 2, 22),    # Chin – below
            (-tw - 12, 5),     # Left Eye – left
            (14, 5),           # Right Eye – right
            (-tw - 12, 5),     # Left Mouth – left
            (14, 5),           # Right Mouth – right
        ]
        ox, oy = offsets[i]
        tx, ty = cx + ox, cy + oy

        # Background rectangle
        cv2.rectangle(frame, (tx - 2, ty - th - 2), (tx + tw + 2, ty + 4), (30, 30, 30), -1)
        cv2.rectangle(frame, (tx - 2, ty - th - 2), (tx + tw + 2, ty + 4), color, 1)
        cv2.putText(frame, label_text, (tx, ty),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)

    # ── Draw 3-D axis arrows from the nose tip ──────────────────────────
    nose_tip = tuple(image_pts[0].astype(int))

    # Project axis endpoints
    axis_3d = np.float64([
        [AXIS_LENGTH, 0, 0],   # X → Yaw
        [0, AXIS_LENGTH, 0],   # Y → Pitch
        [0, 0, AXIS_LENGTH],   # Z → Roll (pointing out of face)
    ])
    axis_2d, _ = cv2.projectPoints(axis_3d, rot_vec, tvec, cam_matrix, dist_coeffs)

    axis_info = [
        ("Yaw",   axis_2d[0].ravel(), AXIS_COLORS["Yaw"],   yaw),
        ("Pitch", axis_2d[1].ravel(), AXIS_COLORS["Pitch"], pitch),
        ("Roll",  axis_2d[2].ravel(), AXIS_COLORS["Roll"],  roll),
    ]

    for label, end_pt, color, angle in axis_info:
        end = (int(end_pt[0]), int(end_pt[1]))
        # Thick arrow line
        cv2.arrowedLine(frame, nose_tip, end, color, 3, cv2.LINE_AA, tipLength=0.2)
        # Label at arrow tip
        lx = end[0] + 8
        ly = end[1] + 5
        cv2.putText(frame, f"{label}: {angle:+.1f} deg",
                    (lx, ly), cv2.FONT_HERSHEY_SIMPLEX, 0.50, color, 2, cv2.LINE_AA)

    # ── Title & legend ──────────────────────────────────────────────────
    # Semi-transparent title bar
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 38), (30, 30, 30), -1)
    cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
    cv2.putText(frame, "Figure 3.3: Head Pose Estimation  |  6 Facial Landmarks + solvePnP",
                (12, 26), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)

    # Bottom legend bar
    overlay2 = frame.copy()
    cv2.rectangle(overlay2, (0, h - 50), (w, h), (30, 30, 30), -1)
    cv2.addWeighted(overlay2, 0.7, frame, 0.3, 0, frame)

    legend_x = 14
    for label, color in AXIS_COLORS.items():
        cv2.arrowedLine(frame, (legend_x, h - 25), (legend_x + 30, h - 25), color, 2, cv2.LINE_AA, tipLength=0.3)
        cv2.putText(frame, label, (legend_x + 36, h - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.44, color, 1, cv2.LINE_AA)
        legend_x += 120

    # Landmark count note
    cv2.putText(frame, "Landmarks: Nose(1), Chin(199), Eyes(33,263), Mouth(61,291)",
                (legend_x + 20, h - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (200, 200, 200), 1, cv2.LINE_AA)

    return frame


def main():
    print("=" * 60)
    print("  Head Pose Estimation — Methodology Figure Generator")
    print("=" * 60)
    print()
    print("Opening webcam... Position your face naturally.")
    print("  • Press SPACE to capture")
    print("  • Or wait 5 seconds for auto-capture")
    print("  • Press Q to quit without saving")
    print()

    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW if sys.platform.startswith("win") else cv2.CAP_ANY)
    if not cap.isOpened():
        cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[ERROR] Cannot open webcam.")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    face_lmk = build_face_landmarker()
    print("[OK] MediaPipe Face Landmarker loaded.")

    start = time.time()
    captured = False

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[ERROR] Failed to read frame.")
            break

        frame = cv2.flip(frame, 1)
        H, W = frame.shape[:2]

        # Run detection on a copy for the preview
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = face_lmk.detect(mp_img)

        preview = frame.copy()
        if result.face_landmarks:
            lms = result.face_landmarks[0]
            # Light preview dots on the 6 landmarks
            for idx in POSE_POINT_IDS:
                cx, cy = int(lms[idx].x * W), int(lms[idx].y * H)
                cv2.circle(preview, (cx, cy), 5, (0, 255, 255), -1, cv2.LINE_AA)
            cv2.putText(preview, "Face detected — press SPACE to capture",
                        (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 100), 2, cv2.LINE_AA)
        else:
            cv2.putText(preview, "No face detected — adjust position",
                        (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2, cv2.LINE_AA)

        cv2.imshow("Head Pose Figure — Preview", preview)
        key = cv2.waitKey(30) & 0xFF

        if key == ord(' ') and result.face_landmarks:
            captured = True
            break
        elif key in (ord('q'), 27):
            break
        elif time.time() - start > 5 and result.face_landmarks:
            captured = True
            break

    cap.release()
    cv2.destroyAllWindows()

    if not captured:
        print("No frame captured. Exiting.")
        return

    # ── Generate the annotated figure ───────────────────────────────────
    lms = result.face_landmarks[0]
    pose_result = estimate_head_pose(lms, W, H)
    if pose_result is None:
        print("[ERROR] solvePnP failed. Try with better lighting.")
        return

    pitch, yaw, roll = pose_result[0], pose_result[1], pose_result[2]
    print(f"\n  Pitch: {pitch:+.1f}°   Yaw: {yaw:+.1f}°   Roll: {roll:+.1f}°\n")

    fig_frame = draw_figure(frame, lms, W, H, pose_result)

    # Save
    out_dir = Path(__file__).resolve().parent / "figures"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / "head_pose_estimation.png"
    cv2.imwrite(str(out_path), fig_frame)
    print(f"[SAVED] {out_path}")

    # Show result
    cv2.imshow("Figure 3.3 — Head Pose Estimation", fig_frame)
    print("Press any key to close...")
    cv2.waitKey(0)
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
