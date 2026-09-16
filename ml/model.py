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

from ml.paths import COLUMNS_FILE, MODEL_FILE, SCALER_FILE

warnings.filterwarnings("ignore")

# ── Artifact paths ─────────────────────────────────────────────────────────────
_MODEL_PATH = MODEL_FILE
_SCALER_PATH = SCALER_FILE
_COLS_PATH = COLUMNS_FILE

# ── Lazy-loaded singletons ─────────────────────────────────────────────────────
_model            = None
_scaler           = None
_expected_columns = None
_shap_explainer   = None


def _load_artifacts():
    global _model, _scaler, _expected_columns
    if _model is None:
        if not all(p.exists() for p in [_MODEL_PATH, _SCALER_PATH, _COLS_PATH]):
            raise FileNotFoundError(
                "Model artifacts not found. Run: python -m ml.train_xai\n"
                f"  Expected: {_MODEL_PATH}, {_SCALER_PATH}, {_COLS_PATH}"
            )
        _model            = joblib.load(_MODEL_PATH)
        _scaler           = joblib.load(_SCALER_PATH)
        _expected_columns = joblib.load(_COLS_PATH)


def _preprocess(input_features: dict) -> np.ndarray:
    """Encode, align, and scale a raw feature dict → scaled numpy array."""
    _load_artifacts()
    df = pd.DataFrame([input_features]).fillna(0)

    # One-hot encode pose (same strategy as training)
    if "pose" in df.columns:
        df = pd.get_dummies(df, columns=["pose"])

    # Align to training column set (fill missing OHE cols with 0, drop extras)
    df_aligned = pd.DataFrame(0, index=[0], columns=_expected_columns)
    for col in _expected_columns:
        if col in df.columns:
            df_aligned[col] = df[col].values
    df_aligned = df_aligned.astype(float)

    return _scaler.transform(df_aligned)


# ── Public API ─────────────────────────────────────────────────────────────────

def predict_attention(input_features: dict) -> int:
    """
    Predict whether the subject is attentive.

    Parameters
    ----------
    input_features : dict
        Keys: no_of_face, face_x, face_y, face_w, face_h, face_con,
              no_of_hand, pose (str), pose_x, pose_y,
              phone, phone_x, phone_y, phone_w, phone_h, phone_con

    Returns
    -------
    int  –  1 = Attentive, 0 = Not Attentive
    """
    _load_artifacts()
    X_s = _preprocess(input_features)
    return int(_model.predict(X_s)[0])


def predict_proba_attention(input_features: dict) -> float:
    """
    Returns the probability of being attentive (class 1).

    Returns
    -------
    float in [0, 1]
    """
    _load_artifacts()
    X_s = _preprocess(input_features)
    return float(_model.predict_proba(X_s)[0][1])


def explain_prediction(input_features: dict, print_summary: bool = False) -> dict:
    """
    Lightweight SHAP-based explanation for a single prediction.

    Returns
    -------
    dict with keys:
        prediction       : int (0/1)
        probability      : float
        confidence_pct   : int (0-100, blended heuristic)
        top_positive     : list[(feature, shap_val)]  – push toward attentive
        top_negative     : list[(feature, shap_val)]  – push toward distracted
        explanation_text : str
    """
    global _shap_explainer
    _load_artifacts()

    try:
        import shap
        if _shap_explainer is None:
            _shap_explainer = shap.TreeExplainer(_model)

        X_s      = _preprocess(input_features)
        shap_obj = _shap_explainer(X_s)
        sv       = shap_obj.values[0, :, 1]          # Shapley vals for class 1
        shap_dict = dict(zip(_expected_columns, sv.tolist()))
        sorted_sv = sorted(shap_dict.items(), key=lambda x: x[1], reverse=True)
        top_pos   = [(k, round(v, 4)) for k, v in sorted_sv if v > 0][:5]
        top_neg   = [(k, round(v, 4)) for k, v in sorted_sv if v < 0][:5]
        shap_ok   = True
    except Exception:
        shap_dict = {}
        top_pos   = []
        top_neg   = []
        shap_ok   = False

    X_s         = _preprocess(input_features)
    prediction  = int(_model.predict(X_s)[0])
    probability = float(_model.predict_proba(X_s)[0][1])

    pred_str  = "Attentive" if prediction == 1 else "Not Attentive"
    lines     = [f"Prediction : {pred_str}  (P = {probability:.3f})"]
    if shap_ok:
        if top_pos:
            lines.append("\n▲ Factors supporting attention:")
            for f, v in top_pos:
                lines.append(f"   +{v:+.4f}  {f}")
        if top_neg:
            lines.append("\n▼ Factors indicating distraction:")
            for f, v in top_neg:
                lines.append(f"   {v:+.4f}  {f}")
    explanation_text = "\n".join(lines)

    if print_summary:
        print("\n" + "─" * 50)
        print("  PREDICTION EXPLANATION")
        print("─" * 50)
        print(explanation_text)
        print("─" * 50)

    return {
        "prediction":       prediction,
        "probability":      probability,
        "top_positive":     top_pos,
        "top_negative":     top_neg,
        "explanation_text": explanation_text,
        "shap_available":   shap_ok,
    }