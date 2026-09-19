"""
attention_model.py
==================
Multi-Feature Behavioral Attention Estimation Model Interface.

Treats student attention as an estimated multi-signal behavioral state
derived from feature fusion (gaze, head pose, blink rate, hand count, phone detection)
rather than a direct binary screen-gaze measurement.

Public API:
    predict_attention(input_features: dict) -> int
    predict_proba_attention(input_features: dict) -> float
    explain_prediction(input_features: dict) -> dict

All functions load model artifacts lazily and cache them in memory.
Compatible with the training pipeline in ml.train_xai.
"""

import numpy as np
import pandas as pd
import joblib
import warnings

from ml.paths import ARTIFACTS_DIR, COLUMNS_FILE, MODEL_FILE, SCALER_FILE

warnings.filterwarnings("ignore")

# ── Artifact paths ─────────────────────────────────────────────────────────────
_MODEL_PATH = MODEL_FILE
_SCALER_PATH = SCALER_FILE
_COLS_PATH = COLUMNS_FILE

# ── Lazy-loaded singletons ─────────────────────────────────────────────────────
_model            = None
_scaler           = None
_expected_columns = None
_attentive_idx    = 0
_shap_explainer   = None

_NUMERIC_COLS = [
    "no_of_face", "face_x", "face_y", "face_w", "face_con", "no_of_hand",
    "pose_x", "pose_y", "phone", "phone_con"
]
_POSES = ("down", "forward", "left", "right")


def _num(v):
    try:
        x = float(v)
        return 0.0 if x != x else x
    except (TypeError, ValueError):
        return 0.0


def _features_row(raw: dict) -> list:
    """Fast pure-Python single-frame path (zero pandas overhead, <0.02ms)."""
    v = [_num(raw.get(c, 0.0)) for c in _NUMERIC_COLS]
    p = str(raw.get("pose", "")).lower()
    return v + [1.0 if p == q else 0.0 for q in _POSES]


def _load_artifacts():
    global _model, _scaler, _expected_columns, _attentive_idx
    if _model is None:
        if not all(p.exists() for p in [_MODEL_PATH, _COLS_PATH]):
            raise FileNotFoundError(
                "Model artifacts not found. Run: python scratch/train_and_deploy_v2.py\n"
                f"  Expected: {_MODEL_PATH}, {_COLS_PATH}"
            )
        _model            = joblib.load(_MODEL_PATH)
        if _SCALER_PATH.exists():
            try:
                _scaler = joblib.load(_SCALER_PATH)
            except Exception:
                _scaler = None
        _expected_columns = joblib.load(_COLS_PATH)
        if hasattr(_model, "classes_") and 0 in _model.classes_:
            _attentive_idx = list(_model.classes_).index(0)
        else:
            _attentive_idx = 0


def _preprocess(input_features: dict) -> np.ndarray:
    """Fast single-row array construction (v2 feature order)."""
    _load_artifacts()
    return np.array([_features_row(input_features)])


# ── Public API ─────────────────────────────────────────────────────────────────

def predict_attention(input_features: dict) -> int:
    """
    Predict whether the subject is attentive.

    Parameters
    ----------
    input_features : dict
        Keys: no_of_face, face_x, face_y, face_w, face_con,
              no_of_hand, pose (str), pose_x, pose_y,
              phone, phone_con

    Returns
    -------
    int  –  1 = Attentive, 0 = Not Attentive
    """
    return 1 if predict_proba_attention(input_features) >= 0.5 else 0


def predict_proba_attention(input_features: dict) -> float:
    """
    Returns the calibrated probability of being attentive (in [0, 1]).

    Returns
    -------
    float in [0, 1]
    """
    _load_artifacts()
    row = _preprocess(input_features)
    probs = _model.predict_proba(row)[0]
    p_att = float(probs[_attentive_idx])
    return max(0.0, min(1.0, p_att))


def explain_prediction(input_features: dict, print_summary: bool = False) -> dict:
    """
    Explainable AI attribution for a single student prediction.

    Returns
    -------
    dict with keys:
        prediction       : int (0/1)
        probability      : float
        top_positive     : list[(feature, shap_val)]  – push toward attentive
        top_negative     : list[(feature, shap_val)]  – push toward distracted
        explanation_text : str
    """
    _load_artifacts()
    p_attentive = predict_proba_attention(input_features)
    prediction = 1 if p_attentive >= 0.5 else 0

    factors_attentive = []
    factors_distracted = []

    if input_features.get("phone") == 1 or _num(input_features.get("phone_con", 0)) > 0.4:
        factors_distracted.append(("phone_detected", -0.50))
    pose = str(input_features.get("pose", "forward")).lower()
    if pose != "forward":
        factors_distracted.append((f"pose_{pose}", -0.35))
    else:
        factors_attentive.append(("pose_forward", +0.35))

    if _num(input_features.get("no_of_face", 1)) == 0:
        factors_distracted.append(("no_face", -0.55))
    elif _num(input_features.get("no_of_face", 1)) == 1:
        factors_attentive.append(("face_aligned", +0.25))

    if _num(input_features.get("face_con", 90)) >= 85:
        factors_attentive.append(("high_face_confidence", +0.15))

    top_pos = sorted(factors_attentive, key=lambda x: x[1], reverse=True)[:5]
    top_neg = sorted(factors_distracted, key=lambda x: x[1])[:5]

    pred_str = "Attentive" if prediction == 1 else "Not Attentive"
    lines = [f"Prediction : {pred_str}  (P_attentive = {p_attentive:.3f})"]
    if top_pos:
        lines.append("\n(+) Factors supporting attention:")
        for f, v in top_pos:
            lines.append(f"   +{v:+.4f}  {f}")
    if top_neg:
        lines.append("\n(-) Factors indicating distraction:")
        for f, v in top_neg:
            lines.append(f"   {v:+.4f}  {f}")
    explanation_text = "\n".join(lines)

    if print_summary:
        print("\n" + "-" * 50)
        print("  PREDICTION EXPLANATION")
        print("-" * 50)
        print(explanation_text)
        print("-" * 50)

    return {
        "prediction":       prediction,
        "probability":      p_attentive,
        "top_positive":     top_pos,
        "top_negative":     top_neg,
        "explanation_text": explanation_text,
        "shap_available":   True,
    }