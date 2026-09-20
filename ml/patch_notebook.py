import json

with open("d:/Capstone/Project_testing/ml/train_improved_model.ipynb", "r") as f:
    nb = json.load(f)

for cell in nb['cells']:
    if cell['cell_type'] == 'code':
        source = cell['source']
        for i, line in enumerate(source):
            if "import shap\n" in line:
                source.insert(i+1, "from IPython.display import display\n")
                break

with open("d:/Capstone/Project_testing/ml/train_improved_model.ipynb", "w") as f:
    json.dump(nb, f, indent=1)

print("Notebook patched successfully.")
