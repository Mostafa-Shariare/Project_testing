import sys
sys.path.append('d:/Capstone/Project_testing')
from ml.model import explain_prediction

feat = {
    'no_of_face': 1.0,
    'face_x': 320.0, 'face_y': 240.0,
    'face_w': 200.0, 'face_h': 200.0,
    'face_con': 95.0,
    'no_of_hand': 0.0,
    'pose_x': 2.2, 'pose_y': 3.1,
    'pose': 'forward',
    'phone': 0.0, 'phone_x': 0.0, 'phone_y': 0.0, 'phone_w': 0.0, 'phone_h': 0.0, 'phone_con': 0.0
}

explain_prediction(feat, print_summary=True)
