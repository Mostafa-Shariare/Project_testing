"""
attention_xai_pipeline.py
=========================
Research-grade Explainable AI (XAI) extension for the Attention Detection pipeline.

XAI Methods:
  - Global: Built-in Feature Importance, Permutation Importance, SHAP Summary
  - Local:  SHAP Waterfall / Force plots, LIME explanations
  - Visual: Publication-ready matplotlib/seaborn figures

Compatible with the original pipeline:
  prediction = model.predict(features)
New addition:
  explanation = explain_prediction(features)

Author: (your name)
"""

import os, warnings
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import seaborn as sns

from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, confusion_matrix, classification_report
)

import shap
from lime.lime_tabular import LimeTabularExplainer
import joblib

warnings.filterwarnings("ignore")

# ─── Paths ────────────────────────────────────────────────────────────────────
MODEL_PATH   = "attention_model.pkl"
SCALER_PATH  = "attention_scaler.pkl"
COLS_PATH    = "attention_columns.pkl"
DATASET_PATH = "attention_detection_dataset_v1.csv"
OUT_DIR      = "xai_outputs"
os.makedirs(OUT_DIR, exist_ok=True)

# ─── Publication style ────────────────────────────────────────────────────────
plt.rcParams.update({
    "figure.dpi":        150,
    "font.family":       "DejaVu Sans",
    "font.size":         11,
    "axes.titlesize":    13,
    "axes.labelsize":    11,
    "xtick.labelsize":   9,
    "ytick.labelsize":   9,
    "legend.fontsize":   10,
    "axes.spines.top":   False,
    "axes.spines.right": False,
    "axes.grid":         True,
    "grid.alpha":        0.3,
})
PALETTE = {"attentive": "#2563EB", "distracted": "#DC2626", "neutral": "#64748B"}


# ══════════════════════════════════════════════════════════════════════════════
# 1.  UTILITY HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def evaluate_model(name, y_true, y_pred):
    acc  = accuracy_score(y_true, y_pred)
    prec = precision_score(y_true, y_pred, zero_division=0)
    rec  = recall_score(y_true, y_pred, zero_division=0)
    f1   = f1_score(y_true, y_pred, zero_division=0)
    print(f"\n{'─'*50}")
    print(f"  {name}")
    print(f"{'─'*50}")
    print(f"  Accuracy : {acc:.4f}")
    print(f"  Precision: {prec:.4f}")
    print(f"  Recall   : {rec:.4f}")
    print(f"  F1-Score : {f1:.4f}")
    return acc, prec, rec, f1


def _save(fig, name):
    path = os.path.join(OUT_DIR, name)
    fig.savefig(path, bbox_inches="tight", dpi=150)
    plt.close(fig)
    print(f"  ✔  Saved → {path}")


# ══════════════════════════════════════════════════════════════════════════════
# 2.  ORIGINAL TRAINING PIPELINE  (unchanged model I/O)
# ══════════════════════════════════════════════════════════════════════════════

def preprocess(df):
    """Shared preprocessing used by both train and inference."""
    df = df.fillna(0)
    X = df.drop(columns=["label"], errors="ignore")
    X_enc = pd.get_dummies(X, columns=["pose"], drop_first=False)
    return X_enc


def train_pipeline():
    print("\n" + "═"*60)
    print("  TRAINING PIPELINE")
    print("═"*60)

    df = pd.read_csv(DATASET_PATH)
    y  = df["label"]
    X_enc = preprocess(df)

    expected_columns = list(X_enc.columns)
    joblib.dump(expected_columns, COLS_PATH)

    X_train, X_test, y_train, y_test = train_test_split(
        X_enc, y, test_size=0.2, random_state=42, stratify=y)

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s  = scaler.transform(X_test)
    joblib.dump(scaler, SCALER_PATH)

    # Baseline Logistic Regression
    print("\n[1/2] Logistic Regression (baseline)…")
    lr = LogisticRegression(max_iter=1000, random_state=42)
    lr.fit(X_train_s, y_train)
    evaluate_model("Logistic Regression", y_test, lr.predict(X_test_s))

    # Random Forest with grid search
    print("\n[2/2] Random Forest with GridSearchCV…")
    rf_params = {
        "n_estimators":    [50, 100, 200],
        "max_depth":       [None, 10, 20],
        "min_samples_split": [2, 5],
    }
    gs = GridSearchCV(
        RandomForestClassifier(random_state=42),
        rf_params, cv=3, scoring="f1", n_jobs=-1, verbose=0)
    gs.fit(X_train_s, y_train)
    best_rf = gs.best_estimator_
    print(f"  Best params: {gs.best_params_}")

    rf_preds = best_rf.predict(X_test_s)
    evaluate_model("Random Forest (best)", y_test, rf_preds)
    joblib.dump(best_rf, MODEL_PATH)

    print(f"\n  Artifacts saved: {MODEL_PATH}, {SCALER_PATH}, {COLS_PATH}")
    return best_rf, scaler, expected_columns, X_train, X_test, y_train, y_test, X_train_s, X_test_s


# ══════════════════════════════════════════════════════════════════════════════
# 3.  GLOBAL FEATURE IMPORTANCE
# ══════════════════════════════════════════════════════════════════════════════

def plot_builtin_importance(model, feature_names):
    """Built-in Gini impurity importance from the Random Forest."""
    imp = model.feature_importances_
    idx = np.argsort(imp)[::-1]
    names_sorted = np.array(feature_names)[idx]
    imp_sorted   = imp[idx]

    # Colour mapping: face/head features → blue, phone → red, hand → orange, pose → green
    def _col(n):
        if "phone" in n:    return "#DC2626"
        if "pose"  in n:    return "#16A34A"
        if "hand"  in n:    return "#D97706"
        return "#2563EB"
    colors = [_col(n) for n in names_sorted]

    fig, ax = plt.subplots(figsize=(10, 5))
    bars = ax.bar(range(len(imp)), imp_sorted, color=colors, edgecolor="white", linewidth=0.5)
    ax.set_xticks(range(len(imp)))
    ax.set_xticklabels(names_sorted, rotation=55, ha="right")
    ax.set_ylabel("Mean Decrease in Impurity")
    ax.set_title("(a) Random Forest Built-in Feature Importance\n(Gini Impurity Reduction)", pad=12)

    # Legend
    from matplotlib.patches import Patch
    legend_handles = [
        Patch(color="#2563EB", label="Face / Gaze"),
        Patch(color="#16A34A", label="Head Pose"),
        Patch(color="#D97706", label="Hand"),
        Patch(color="#DC2626", label="Phone"),
    ]
    ax.legend(handles=legend_handles, loc="upper right", framealpha=0.85)
    _save(fig, "01_builtin_feature_importance.png")


def plot_permutation_importance(model, X_test_s, y_test, feature_names):
    """Model-agnostic permutation importance on the held-out test set."""
    result = permutation_importance(
        model, X_test_s, y_test, n_repeats=30, random_state=42,
        scoring="f1", n_jobs=-1)

    perm_mean = result.importances_mean
    perm_std  = result.importances_std
    idx = np.argsort(perm_mean)[::-1]

    fig, ax = plt.subplots(figsize=(10, 5))
    ax.bar(range(len(perm_mean)), perm_mean[idx],
           yerr=perm_std[idx], capsize=3,
           color="#2563EB", alpha=0.85, edgecolor="white", linewidth=0.5)
    ax.set_xticks(range(len(perm_mean)))
    ax.set_xticklabels(np.array(feature_names)[idx], rotation=55, ha="right")
    ax.set_ylabel("Mean F1 Decrease (± std)")
    ax.set_title("(b) Permutation Feature Importance\n(Model-Agnostic, n=30 repeats)", pad=12)
    _save(fig, "02_permutation_importance.png")

    return result, idx


# ══════════════════════════════════════════════════════════════════════════════
# 4.  SHAP  –  GLOBAL EXPLANATIONS
# ══════════════════════════════════════════════════════════════════════════════

def compute_shap(model, X_train_s, X_test_s, feature_names, background_size=200):
    """
    Uses TreeExplainer (exact SHAP for tree models).
    Returns shap_values array and the explainer object.
    """
    print("\n  Computing SHAP values (TreeExplainer)…")
    # Use a stratified background sample for speed
    rng  = np.random.default_rng(42)
    idx  = rng.choice(len(X_train_s), size=min(background_size, len(X_train_s)), replace=False)
    bg   = X_train_s[idx]

    explainer   = shap.TreeExplainer(model, bg)
    shap_values = explainer(X_test_s)      # Explanation object (new shap API)
    print(f"  SHAP values shape: {shap_values.shape}")
    return explainer, shap_values


def plot_shap_summary(shap_values, feature_names):
    """Beeswarm / dot summary – shows feature impact direction and magnitude."""
    plt.figure(figsize=(9, 6))
    shap.plots.beeswarm(shap_values[..., 1], max_display=16,
                        color_bar=True, show=False)
    plt.title("(c) SHAP Summary Plot – Attentive Class\n(Each dot = one sample; colour = feature value)", pad=12)
    plt.xlabel("SHAP value (impact on model output)")
    plt.tight_layout()
    fig = plt.gcf()
    _save(fig, "03_shap_summary_beeswarm.png")


def plot_shap_bar(shap_values, feature_names):
    """Mean |SHAP| bar chart – clean global importance ranking."""
    mean_abs = np.abs(shap_values.values[..., 1]).mean(axis=0)
    idx = np.argsort(mean_abs)[::-1]

    fig, ax = plt.subplots(figsize=(9, 5))
    ax.barh(range(len(mean_abs)), mean_abs[idx][::-1],
            color="#2563EB", alpha=0.85, edgecolor="white")
    ax.set_yticks(range(len(mean_abs)))
    ax.set_yticklabels(np.array(feature_names)[idx][::-1])
    ax.set_xlabel("Mean |SHAP value|  (average impact on model output)")
    ax.set_title("(d) Global Feature Importance via SHAP\n(Mean absolute Shapley values)", pad=12)
    _save(fig, "04_shap_global_bar.png")
    return idx, mean_abs


def plot_shap_dependence(shap_values, X_test_s, feature_names, top_n=4):
    """
    Dependence plots for the top-N features.
    Shows how feature value affects SHAP contribution.
    """
    mean_abs = np.abs(shap_values.values[..., 1]).mean(axis=0)
    top_idx  = np.argsort(mean_abs)[::-1][:top_n]
    top_names= np.array(feature_names)[top_idx]

    fig, axes = plt.subplots(2, 2, figsize=(12, 8))
    axes = axes.flatten()

    for i, (feat_i, feat_name) in enumerate(zip(top_idx, top_names)):
        ax = axes[i]
        sv  = shap_values.values[:, feat_i, 1]
        fv  = X_test_s[:, feat_i]
        sc  = ax.scatter(fv, sv, c=fv, cmap="RdBu_r", s=12, alpha=0.65, rasterized=True)
        ax.axhline(0, color="black", linewidth=0.8, linestyle="--")
        ax.set_xlabel(f"{feat_name} (scaled)")
        ax.set_ylabel("SHAP value")
        ax.set_title(f"{feat_name}", fontsize=11)
        plt.colorbar(sc, ax=ax, label="Feature value")

    fig.suptitle("(e) SHAP Dependence Plots – Top-4 Features\n"
                 "(x-axis: feature value; y-axis: SHAP contribution)", y=1.01, fontsize=13)
    fig.tight_layout()
    _save(fig, "05_shap_dependence_plots.png")


# ══════════════════════════════════════════════════════════════════════════════
# 5.  SHAP  –  LOCAL EXPLANATIONS  (individual predictions)
# ══════════════════════════════════════════════════════════════════════════════

def plot_shap_waterfall_local(shap_values, feature_names, sample_indices, X_test_s, y_test):
    """Waterfall plot for specific test samples."""
    y_arr = np.array(y_test)
    for pos, si in enumerate(sample_indices):
        true_lbl  = y_arr[si]
        pred_lbl  = int(shap_values.values[si, :, 1].sum() + shap_values.base_values[si, 1] > 0.5)
        lbl_str   = "Attentive" if true_lbl == 1 else "Not Attentive"
        pred_str  = "Attentive" if pred_lbl == 1 else "Not Attentive"

        fig, ax = plt.subplots(figsize=(9, 5))
        shap.plots.waterfall(shap_values[si, :, 1], max_display=12, show=False)
        plt.title(
            f"(f{pos+1}) Local SHAP – Sample #{si}\n"
            f"True: {lbl_str}  |  Predicted: {pred_str}",
            pad=10, fontsize=12)
        plt.tight_layout()
        _save(plt.gcf(), f"06_shap_waterfall_sample{si}.png")


# ══════════════════════════════════════════════════════════════════════════════
# 6.  LIME  –  LOCAL EXPLANATIONS
# ══════════════════════════════════════════════════════════════════════════════

def lime_explain(model, scaler, X_train_s, X_test_s, feature_names, y_test, sample_indices):
    """
    LIME local explanation for selected samples.
    Wraps the scaled predict_proba so LIME works in the original feature space.
    """
    print("\n  Running LIME explanations…")

    explainer = LimeTabularExplainer(
        training_data   = X_train_s,
        feature_names   = feature_names,
        class_names     = ["Not Attentive", "Attentive"],
        mode            = "classification",
        discretize_continuous = True,
        random_state    = 42,
    )

    y_arr = np.array(y_test)
    lime_results = {}

    for si in sample_indices:
        instance = X_test_s[si]
        exp = explainer.explain_instance(
            instance,
            model.predict_proba,
            num_features=10,
            num_samples=500,
            labels=[0, 1],
        )
        lime_results[si] = exp

        true_lbl = "Attentive" if y_arr[si] == 1 else "Not Attentive"
        pred_prob = model.predict_proba([instance])[0]
        pred_lbl  = "Attentive" if pred_prob[1] >= 0.5 else "Not Attentive"

        # Extract feature contributions for the Attentive class (label=1)
        feat_contrib = exp.as_list(label=1)
        labels_lime  = [f[0] for f in feat_contrib]
        values_lime  = [f[1] for f in feat_contrib]
        colors_lime  = ["#2563EB" if v > 0 else "#DC2626" for v in values_lime]

        fig, ax = plt.subplots(figsize=(9, 5))
        ax.barh(range(len(labels_lime)), values_lime, color=colors_lime,
                edgecolor="white", linewidth=0.4)
        ax.set_yticks(range(len(labels_lime)))
        ax.set_yticklabels(labels_lime)
        ax.axvline(0, color="black", linewidth=0.8)
        ax.set_xlabel("LIME contribution to Attentive class")
        ax.set_title(
            f"(g) LIME Explanation – Sample #{si}\n"
            f"True: {true_lbl}  |  Predicted: {pred_lbl}  "
            f"(p_attentive={pred_prob[1]:.3f})",
            pad=10)
        fig.tight_layout()
        _save(fig, f"07_lime_sample{si}.png")

    return lime_results


# ══════════════════════════════════════════════════════════════════════════════
# 7.  SHAP vs LIME COMPARISON TABLE
# ══════════════════════════════════════════════════════════════════════════════

def plot_shap_lime_comparison(shap_values, lime_results, feature_names, sample_idx):
    """Side-by-side bar chart comparing SHAP and LIME rankings for one sample."""
    si = sample_idx
    # SHAP top-10
    sv = shap_values.values[si, :, 1]
    shap_order = np.argsort(np.abs(sv))[::-1][:10]
    shap_feats  = np.array(feature_names)[shap_order]
    shap_vals   = sv[shap_order]

    # LIME top-10
    lime_list = lime_results[si].as_list(label=1)
    lime_feats  = [f[0] for f in lime_list[:10]]
    lime_vals   = [f[1] for f in lime_list[:10]]

    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    # SHAP panel
    axes[0].barh(range(len(shap_feats)), shap_vals[::-1],
                 color=["#2563EB" if v > 0 else "#DC2626" for v in shap_vals[::-1]])
    axes[0].set_yticks(range(len(shap_feats)))
    axes[0].set_yticklabels(shap_feats[::-1])
    axes[0].axvline(0, color="black", linewidth=0.8)
    axes[0].set_title("SHAP (Shapley values)", fontsize=12)
    axes[0].set_xlabel("SHAP value (impact on log-odds)")

    # LIME panel
    axes[1].barh(range(len(lime_feats)), lime_vals[::-1],
                 color=["#2563EB" if v > 0 else "#DC2626" for v in lime_vals[::-1]])
    axes[1].set_yticks(range(len(lime_feats)))
    axes[1].set_yticklabels(lime_feats[::-1])
    axes[1].axvline(0, color="black", linewidth=0.8)
    axes[1].set_title("LIME (Local Linear Approximation)", fontsize=12)
    axes[1].set_xlabel("LIME contribution weight")

    fig.suptitle(f"(h) SHAP vs LIME – Sample #{si}\n"
                 "Blue = pushes toward Attentive | Red = pushes toward Not Attentive",
                 fontsize=12)
    fig.tight_layout()
    _save(fig, f"08_shap_vs_lime_sample{si}.png")


# ══════════════════════════════════════════════════════════════════════════════
# 8.  DEPLOY-COMPATIBLE FUNCTIONS  (unchanged API)
# ══════════════════════════════════════════════════════════════════════════════

def predict_attention(input_features: dict) -> int:
    """Original prediction function – unchanged."""
    if not all(os.path.exists(p) for p in [MODEL_PATH, SCALER_PATH, COLS_PATH]):
        raise FileNotFoundError("Model artifacts missing. Run train_pipeline() first.")
    model            = joblib.load(MODEL_PATH)
    scaler           = joblib.load(SCALER_PATH)
    expected_columns = joblib.load(COLS_PATH)

    df = pd.DataFrame([input_features]).fillna(0)
    if "pose" in df.columns:
        df = pd.get_dummies(df, columns=["pose"])

    df_aligned = pd.DataFrame(columns=expected_columns)
    for col in expected_columns:
        df_aligned[col] = df[col] if col in df.columns else 0
    df_aligned = df_aligned.astype(float)

    X_s = scaler.transform(df_aligned)
    return int(model.predict(X_s)[0])


def explain_prediction(input_features: dict, print_summary: bool = True) -> dict:
    """
    NEW: Returns a rich explanation dict for one prediction.

    Returns
    -------
    {
      "prediction":   int  (0 / 1),
      "probability":  float (P(attentive)),
      "shap_values":  dict  {feature: shap_value},
      "top_positive": list  [(feature, value), …],   # push toward attentive
      "top_negative": list  [(feature, value), …],   # push toward not attentive
      "explanation_text": str
    }
    """
    if not all(os.path.exists(p) for p in [MODEL_PATH, SCALER_PATH, COLS_PATH]):
        raise FileNotFoundError("Model artifacts missing. Run train_pipeline() first.")

    model            = joblib.load(MODEL_PATH)
    scaler           = joblib.load(SCALER_PATH)
    expected_columns = joblib.load(COLS_PATH)

    df = pd.DataFrame([input_features]).fillna(0)
    if "pose" in df.columns:
        df = pd.get_dummies(df, columns=["pose"])

    df_aligned = pd.DataFrame(columns=expected_columns)
    for col in expected_columns:
        df_aligned[col] = df[col] if col in df.columns else 0
    df_aligned = df_aligned.astype(float)

    X_s         = scaler.transform(df_aligned)
    prediction  = int(model.predict(X_s)[0])
    probability = float(model.predict_proba(X_s)[0][1])

    # SHAP (TreeExplainer – fast, exact)
    explainer   = shap.TreeExplainer(model)
    shap_obj    = explainer(X_s)
    sv          = shap_obj.values[0, :, 1]          # class-1 SHAP for attentive

    shap_dict = dict(zip(expected_columns, sv.tolist()))
    sorted_sv = sorted(shap_dict.items(), key=lambda x: x[1], reverse=True)
    top_pos   = [(k, round(v, 4)) for k, v in sorted_sv if v > 0][:5]
    top_neg   = [(k, round(v, 4)) for k, v in sorted_sv if v < 0][:5]

    # Human-readable text
    pred_str   = "Attentive" if prediction == 1 else "Not Attentive"
    lines      = [
        f"Prediction : {pred_str} (P_attentive = {probability:.3f})",
        "",
        "Factors supporting ATTENTION:",
    ]
    for f, v in top_pos:
        lines.append(f"  +{v:+.4f}  {f}")
    lines.append("\nFactors indicating DISTRACTION:")
    for f, v in top_neg:
        lines.append(f"  {v:+.4f}  {f}")
    explanation_text = "\n".join(lines)

    if print_summary:
        print("\n" + "─"*55)
        print("  PREDICTION EXPLANATION")
        print("─"*55)
        print(explanation_text)
        print("─"*55)

    return {
        "prediction":        prediction,
        "probability":       probability,
        "shap_values":       shap_dict,
        "top_positive":      top_pos,
        "top_negative":      top_neg,
        "explanation_text":  explanation_text,
    }


# ══════════════════════════════════════════════════════════════════════════════
# 9.  MASTER XAI RUNNER
# ══════════════════════════════════════════════════════════════════════════════

def run_xai_pipeline():
    # ── Train ──────────────────────────────────────────────────────────────
    (best_rf, scaler, feature_names,
     X_train, X_test, y_train, y_test,
     X_train_s, X_test_s) = train_pipeline()

    print("\n" + "═"*60)
    print("  XAI ANALYSIS")
    print("═"*60)

    # ── Global Importance ──────────────────────────────────────────────────
    print("\n[A] Built-in Feature Importance…")
    plot_builtin_importance(best_rf, feature_names)

    print("\n[B] Permutation Importance…")
    perm_result, perm_idx = plot_permutation_importance(
        best_rf, X_test_s, y_test, feature_names)

    # ── SHAP Global ────────────────────────────────────────────────────────
    print("\n[C] SHAP Global Explanations…")
    explainer, shap_values = compute_shap(
        best_rf, X_train_s, X_test_s, feature_names, background_size=200)

    print("  Plotting SHAP summary (beeswarm)…")
    plot_shap_summary(shap_values, feature_names)

    print("  Plotting SHAP global bar…")
    plot_shap_bar(shap_values, feature_names)

    print("  Plotting SHAP dependence plots…")
    plot_shap_dependence(shap_values, X_test_s, feature_names, top_n=4)

    # ── SHAP Local ─────────────────────────────────────────────────────────
    print("\n[D] SHAP Local Explanations (sample waterfall)…")
    y_arr = np.array(y_test)
    # Pick one attentive and one not-attentive sample
    att_idx  = np.where(y_arr == 1)[0][0]
    dist_idx = np.where(y_arr == 0)[0][0]
    local_samples = [att_idx, dist_idx]
    plot_shap_waterfall_local(shap_values, feature_names, local_samples, X_test_s, y_test)

    # ── LIME Local ─────────────────────────────────────────────────────────
    print("\n[E] LIME Local Explanations…")
    lime_results = lime_explain(
        best_rf, scaler, X_train_s, X_test_s,
        feature_names, y_test, local_samples)

    # ── SHAP vs LIME ───────────────────────────────────────────────────────
    print("\n[F] SHAP vs LIME comparison…")
    plot_shap_lime_comparison(shap_values, lime_results, feature_names, att_idx)

    # ── Example deploy call ────────────────────────────────────────────────
    print("\n" + "═"*60)
    print("  EXAMPLE: explain_prediction() on a live sample")
    print("═"*60)
    sample = {
        "no_of_face": 1,  "face_x": 256.6, "face_y": 144.1,
        "face_w": 169.0,  "face_h": 169.0, "face_con": 88.8,
        "no_of_hand": 0,  "pose": "forward",
        "pose_x": -2.1,   "pose_y": -0.8,
        "phone": 0,       "phone_x": 0,    "phone_y": 0,
        "phone_w": 0,     "phone_h": 0,    "phone_con": 0,
    }
    result = explain_prediction(sample)

    print("\n✅  All XAI outputs saved to:", OUT_DIR)
    return result


# ══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    run_xai_pipeline()