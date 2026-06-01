"""
Evaluate trained attention model on held-out data.
Run from repo root: python -m ml.evaluate
"""
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split

from ml.paths import COLUMNS_FILE, DATASET_FILE, MODEL_FILE, SCALER_FILE


def preprocess(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    """Match training preprocessing from ml.train_xai."""
    df = df.fillna(0)
    y = df["label"].astype(int)
    X = df.drop(columns=["label"], errors="ignore")
    X = pd.get_dummies(X, columns=["pose"], drop_first=False)
    return X, y


def main():
    if not DATASET_FILE.exists():
        print(f"Dataset not found: {DATASET_FILE}")
        return 1
    if not all(p.exists() for p in [MODEL_FILE, SCALER_FILE, COLUMNS_FILE]):
        print("Model artifacts missing. Run: python -m ml")
        return 1

    print(f"Loading dataset: {DATASET_FILE}")
    df = pd.read_csv(DATASET_FILE)
    X, y = preprocess(df)

    model = joblib.load(MODEL_FILE)
    scaler = joblib.load(SCALER_FILE)
    expected_cols = joblib.load(COLUMNS_FILE)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    def align(df_in: pd.DataFrame) -> pd.DataFrame:
        aligned = pd.DataFrame(0, index=df_in.index, columns=expected_cols)
        for col in expected_cols:
            if col in df_in.columns:
                aligned[col] = df_in[col].values
        return aligned.astype(float)

    X_test_aligned = align(X_test)
    X_test_scaled = scaler.transform(X_test_aligned)
    preds = model.predict(X_test_scaled)

    print("\n=== Evaluation (20% hold-out) ===")
    print(f"Accuracy: {accuracy_score(y_test, preds):.4f}")
    print("\nConfusion matrix:")
    print(confusion_matrix(y_test, preds))
    print("\nClassification report:")
    print(classification_report(y_test, preds, target_names=["Distracted", "Attentive"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
