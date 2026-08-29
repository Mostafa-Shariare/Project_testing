# Attention Monitor - Project Context & Documentation

This document contains the comprehensive technical details, architecture, and structural information about the **Attention Monitor** project. It is designed to provide full context to developers and AI assistants (like Antigravity) working on the codebase.

## 1. Executive Summary
**Attention Monitor** is a real-time classroom attention monitoring system. It uses a desktop student client for local webcam video processing (OpenCV, MediaPipe, YOLOv8) and a machine learning classifier (Random Forest) to estimate attention. The system transmits derived metrics to a FastAPI backend backed by MongoDB, which broadcasts live data to a React-based teacher dashboard via WebSockets. Video is never uploaded, preserving privacy.

## 2. Technology Stack
*   **Backend:** FastAPI (Python 3.11+), Uvicorn, PyJWT, bcrypt.
*   **Database:** MongoDB, PyMongo.
*   **Frontend:** React 19.x, Vite, Chart.js.
*   **Client (Desktop):** Python, Tkinter (UI), OpenCV (`cv2`), MediaPipe Tasks (Face, Hands), Ultralytics YOLOv8 (Phone detection).
*   **Machine Learning:** scikit-learn (Random Forest, StandardScaler), SHAP (Explainable AI), joblib.

## 3. System Architecture
The system employs a three-tier, event-driven architecture:
1.  **Student Tier (Local Edge Inference):** Webcam -> OpenCV/MediaPipe/YOLO -> ML Inference -> Tkinter UI. A background thread (StateReporter) POSTs telemetry at 1 Hz to the backend.
2.  **Application Tier (Server):** FastAPI handles REST APIs for authentication, class/roster management, and student telemetry. Maintains an in-memory live state of students. WebSockets (`/ws/teacher`) broadcast updates at 2 Hz to authenticated teachers.
3.  **Data Tier (Database):** MongoDB stores persistent records (`teachers`, `classes`, `students`, `sessions`). Writes are throttled (appended every 5 seconds per session) to prevent write amplification.
4.  **Teacher Tier (Frontend):** React dashboard displaying real-time metrics, historical analytics, and roster management.

## 4. Repository Structure
The project is strictly divided into four primary domains:
*   `backend/`: FastAPI server application.
    *   `app/main.py`: Entry point, routes, WebSockets.
    *   `app/auth.py`: JWT and password hashing.
    *   `app/database.py`: MongoDB connection and schema operations.
*   `client/`: Student desktop client for edge inference.
    *   `tracker.py`: Main tracking loop, Tkinter UI, CV pipeline.
*   `ml/`: Machine learning training and XAI pipeline.
    *   `model.py`: Inference API (predict, explain).
    *   `train_xai.py`: Training script for Random Forest and SHAP.
    *   `artifacts/`: Pickled models (`attention_model.pkl`, `attention_scaler.pkl`).
*   `frontend/`: React teacher dashboard.
    *   `src/components/`: React components (LiveMonitor, HistoryPanel, etc.).
    *   `src/api.js`: Axios and WebSocket wrappers.

## 5. Core Workflows
### 5.1 Telemetry Path
1.  Student client captures frame -> extracts features -> gets ML prediction & heuristic score.
2.  `StateReporter` POSTs to `/api/student/update` (1 Hz).
3.  FastAPI upserts in-memory state and appends to MongoDB `sessions.logs` (5s throttle).
4.  Background task broadcasts in-memory state to Teacher WebSockets (2 Hz).

### 5.2 Perception Pipeline (Client)
*   **MediaPipe Face Landmarker:** Extracts 478 points. Used for Eye Aspect Ratio (EAR) blink detection, geometric gaze estimation (Iris ratio), and Head Pose Estimation (via `cv2.solvePnP`).
*   **MediaPipe Hands:** Counts detected hands (`no_of_hand`).
*   **YOLOv8n:** Detects phones (COCO class 67) in a background thread every 6 frames.
*   **Attention Score:** A blend of a heuristic geometric score (55%) and the ML Random Forest probability (45%). Temporal smoothing prevents UI flicker.

## 6. Data Models (MongoDB)
*   `teachers`: `{ username, password_hash, registered_at }`
*   `classes`: `{ class_code, display_name, teacher_username, join_code }`
*   `students` (Roster): `{ class_code, roll_number, name }`
*   `sessions`: Stores live and historical sessions.
    *   Schema: `{ name, roll_number, class_code, teacher_username, start_time, end_time, status, logs: [{attention, alert, timestamp}], last_active }`

## 7. Machine Learning Features (16-dimensional vector)
The Random Forest model is trained on the following tabular features:
*   `no_of_face` (int)
*   `face_x, face_y, face_w, face_h` (float)
*   `face_con` (float)
*   `no_of_hand` (int)
*   `pose` (categorical: forward, up, down, left, right) -> one-hot encoded.
*   `pose_x, pose_y` (float: yaw/pitch)
*   `phone, phone_x, phone_y, phone_w, phone_h, phone_con` (YOLO outputs)

## 8. API Reference
*   **Auth:** `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
*   **Classes:** `GET/POST /api/classes`, `GET/POST/DELETE /api/classes/{code}/roster`
*   **Student:** `POST /api/student/update`, `POST /api/student/end`
*   **Analytics:** `GET /api/analytics/history`, `GET /api/analytics/session/{id}`
*   **WebSocket:** `GET /ws/teacher?token={JWT}&class_code={code}`

## 9. Local Development Setup
*   **Backend:** `python -m uvicorn backend.app.main:app --reload --port 8000`
*   **Frontend:** `cd frontend && npm run dev`
*   **Client:** `python -m client` (Requires `client/config.json`)
*   **ML:** `python -m ml` to generate missing `.pkl` artifacts.
*   **Environment Variables (`.env`):** `JWT_SECRET`, `MONGODB_URI`, `CORS_ORIGINS`.

## 10. Security & Privacy
*   **Edge Processing:** Raw video frames are NEVER transmitted or saved. Only numeric telemetry and categorical alerts leave the student machine.
*   **Data Isolation:** JWTs restrict teachers to viewing only their own `class_code` data.
*   **Consent:** Student client features a mandatory privacy consent gate before webcam activation.
