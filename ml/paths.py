"""Canonical paths for ML data, artifacts, and training outputs."""
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parent
ARTIFACTS_DIR = ML_ROOT / "artifacts"
DATA_DIR = ML_ROOT / "data"
OUTPUTS_DIR = ML_ROOT / "outputs"
XAI_OUTPUT_DIR = OUTPUTS_DIR / "xai"

MODEL_FILE = ARTIFACTS_DIR / "attention_model.pkl"
SCALER_FILE = ARTIFACTS_DIR / "attention_scaler.pkl"
COLUMNS_FILE = ARTIFACTS_DIR / "attention_columns.pkl"
DATASET_FILE = DATA_DIR / "attention_detection_dataset_v1.csv"
