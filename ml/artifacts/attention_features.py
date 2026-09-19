# Auto-generated shared feature builder for Attenova Attention Model (v2)
import pandas as pd

POSES = ("down", "forward", "left", "right")
NUMERIC = [
    "no_of_face", "face_x", "face_y", "face_w", "face_con", "no_of_hand",
    "pose_x", "pose_y", "phone", "phone_con"
]
FEATURE_NAMES = NUMERIC + [f"pose_{p}" for p in POSES]


def build_features(raw) -> pd.DataFrame:
    d = pd.DataFrame([raw]) if isinstance(raw, dict) else raw
    out = pd.DataFrame(index=d.index)
    for c in NUMERIC:
        out[c] = pd.to_numeric(d[c], errors="coerce") if c in d.columns else 0.0
    out = out.fillna(0.0)
    pose = d["pose"].astype(str).str.lower() if "pose" in d.columns else pd.Series("", index=d.index)
    for p in POSES:
        out[f"pose_{p}"] = (pose == p).astype(float)
    return out[FEATURE_NAMES].astype(float)


def _num(v):
    try:
        x = float(v)
        return 0.0 if x != x else x
    except (TypeError, ValueError):
        return 0.0


def features_row(raw: dict) -> list:
    """Fast pure-Python single-frame path (no pandas overhead)."""
    v = [_num(raw.get(c, 0)) for c in NUMERIC]
    p = str(raw.get("pose", "")).lower()
    return v + [1.0 if p == q else 0.0 for q in POSES]
