import nbformat as nbf

nb = nbf.v4.new_notebook()

nb['cells'] = [
    nbf.v4.new_markdown_cell('# Visoria Enhanced Attention Model Training\nThis notebook demonstrates how the improved machine learning model is trained using engineered relational and geometric features.'),
    
    nbf.v4.new_markdown_cell('## 1. Feature Engineering\nFirst, we load the raw dataset and engineer high-signal features like `face_area` and `face_phone_dist`.'),
    nbf.v4.new_code_cell('''import pandas as pd\nimport numpy as np\n\n# Load original dataset\ndf = pd.read_csv('data/attention_detection_dataset_v1.csv')\n\n# Engineer Features\ndf['face_area'] = df['face_w'] * df['face_h']\ndf['phone_area'] = df['phone_w'] * df['phone_h']\n\n# Distance between face and phone (if phone is present)\ndist = np.sqrt((df['face_x'] - df['phone_x'])**2 + (df['face_y'] - df['phone_y'])**2)\ndf['face_phone_dist'] = np.where(df['phone'] == 1, dist, 9999.0)\n\n# Phone proximity flag (is phone held near face?)\ndf['phone_near_face'] = np.where((df['phone'] == 1) & (df['face_phone_dist'] < df['face_w'] * 2.0), 1.0, 0.0)\n\n# Reorder label to the end\ncols = list(df.columns)\ncols.remove('label')\ncols.append('label')\ndf = df[cols]\n\n# Save enhanced dataset\ndf.to_csv('data/attention_detection_dataset_v2.csv', index=False)\nprint('Enhanced dataset shape:', df.shape)\ndf.head()'''),

    nbf.v4.new_markdown_cell('## 2. Model Training\nNow we train a Random Forest Classifier using the enhanced feature set.'),
    nbf.v4.new_code_cell('''from sklearn.model_selection import train_test_split, GridSearchCV\nfrom sklearn.ensemble import RandomForestClassifier\nfrom sklearn.preprocessing import StandardScaler\nfrom sklearn.metrics import classification_report\nimport joblib\n\ndf_v2 = pd.read_csv('data/attention_detection_dataset_v2.csv')\n\n# Prepare features and labels\nX = df_v2.drop(columns=['label'])\ny = df_v2['label']\n\n# One-hot encode categorical features (pose)\nX = pd.get_dummies(X, columns=['pose'])\n\n# Train-test split\nX_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)\n\n# Scale features\nscaler = StandardScaler()\nX_train_s = scaler.fit_transform(X_train)\nX_test_s = scaler.transform(X_test)\n\n# Train Random Forest\nrf = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42, class_weight='balanced')\nrf.fit(X_train_s, y_train)\n\n# Evaluate\ny_pred = rf.predict(X_test_s)\nprint('Model Evaluation:')\nprint(classification_report(y_test, y_pred))\n\n# Save artifacts\njoblib.dump(rf, 'artifacts/attention_model.pkl')\njoblib.dump(scaler, 'artifacts/attention_scaler.pkl')\njoblib.dump(list(X.columns), 'artifacts/attention_columns.pkl')\nprint('Model artifacts saved successfully!')'''),

    nbf.v4.new_markdown_cell("## 3. Explainability (SHAP)\nLet's see which features the model relies on the most. The new engineered features should rank highly!"),
    nbf.v4.new_code_cell('''import shap\nimport matplotlib.pyplot as plt\n\nexplainer = shap.TreeExplainer(rf)\nshap_values = explainer.shap_values(X_test_s)\n\n# Summary plot\nshap.summary_plot(shap_values, X_test, plot_type='bar')''')
]

with open('train_improved_model.ipynb', 'w') as f:
    nbf.write(nb, f)
print('Notebook created successfully.')
