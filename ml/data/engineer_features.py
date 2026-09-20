import pandas as pd
import numpy as np
import os
from pathlib import Path

def main():
    data_dir = Path(__file__).resolve().parent
    in_file = data_dir / "attention_detection_dataset_v1.csv"
    out_file = data_dir / "attention_detection_dataset_v2.csv"
    
    print(f"Reading dataset: {in_file}")
    df = pd.read_csv(in_file)
    
    # 1. face_area
    df["face_area"] = df["face_w"] * df["face_h"]
    
    # 2. phone_area
    df["phone_area"] = df["phone_w"] * df["phone_h"]
    
    # 3. face_phone_dist
    dist = np.sqrt((df["face_x"] - df["phone_x"])**2 + (df["face_y"] - df["phone_y"])**2)
    df["face_phone_dist"] = np.where(df["phone"] == 1, dist, 9999.0)
    
    # 4. phone_near_face
    df["phone_near_face"] = np.where((df["phone"] == 1) & (df["face_phone_dist"] < df["face_w"] * 2.0), 1.0, 0.0)
    
    # Move label to the end for consistency
    if "label" in df.columns:
        cols = list(df.columns)
        cols.remove("label")
        cols.append("label")
        df = df[cols]
    
    print(f"Engineered 4 new features. New dataset shape: {df.shape}")
    print("Preview of new features (distracted):")
    print(df[df["label"] == 1][["phone", "face_area", "phone_area", "face_phone_dist", "phone_near_face"]].head())
    
    df.to_csv(out_file, index=False)
    print(f"Saved to: {out_file}")

if __name__ == "__main__":
    main()
