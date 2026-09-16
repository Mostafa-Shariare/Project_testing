# Visoria Electron Student Tracker

Modern dark SaaS desktop tracker application built with **Electron + Node.js** and backed by the **Visoria Multi-Feature Behavioral Attention Estimation Model** (`ml.model` + MediaPipe + YOLOv8).

---

## 1. Quick Start

Ensure your Visoria FastAPI backend is running (`http://localhost:8000`), then from the project root:

```powershell
cd electron-tracker
npm start
```

Or from the root directory:
```powershell
npm start --prefix electron-tracker
```

---

## 2. Key Features

- **Visoria Dark SaaS Interface**: Styled to match the Visoria Teacher Dashboard and Student Desktop (`#0F1115`, `#171A21`, `#1E222B`, `#2A2F3A`).
- **Real-Time Computer Vision HUD**:
  - Live webcam stream with toggleable overlays: Face bounding box, Mesh, Iris tracking, Head Pose angles (Pitch, Yaw, Roll), Hand landmarks, and YOLO phone detection.
  - **Privacy Mode**: Pause camera at any time with agency; displays a calm blurred privacy feed while maintaining session state.
- **Biometric & Behavioral Telemetry**:
  - Attention Stability Gauge with smoothed and raw ML probabilities.
  - Blink rate frequency monitor (BPM).
  - Head pose 3D rotation angles.
  - Mobile device presence alerts.
- **Socratic Intervention Auto-Detection**:
  - Background polling for live class activities and Socratic questions.
  - Non-intrusive in-app banner with a 1-click **"Join Socratic Session ➔"** action that launches the student web interface with deep-linked session tokens.
- **Direct Backend Integration**:
  - Pre-flight join verification: `POST /api/student/verify`
  - Periodic telemetry streaming: `POST /api/student/update` (1s intervals)
  - Clean session disconnection: `POST /api/student/end`
