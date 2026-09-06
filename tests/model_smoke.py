"""Actual Facenet512 inference on synthetic pixels; no person or web result is used."""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "py"))
from common import load_environment
load_environment()
import numpy as np
from PIL import Image
from deepface import DeepFace
from embed import FaceInputError, get_face_embedding

with tempfile.TemporaryDirectory(prefix="face-chain-model-test-") as directory:
    blank = Path(directory) / "blank.png"
    Image.new("RGB", (200, 200)).save(blank)
    try:
        get_face_embedding(str(blank))
        raise AssertionError("Production detection accepted an image without a face")
    except FaceInputError:
        pass

# Skip detection ONLY for this synthetic model-forward test; production always enforces it.
pixels = np.random.default_rng(42).integers(0, 255, (160, 160, 3), dtype=np.uint8)
vector = DeepFace.represent(pixels, model_name="Facenet512", detector_backend="skip", enforce_detection=False)[0]["embedding"]
assert len(vector) == 512 and np.isfinite(vector).all()
same = DeepFace.verify(vector, vector, model_name="Facenet512", distance_metric="cosine", silent=True)
different = DeepFace.verify(vector, [-x for x in vector], model_name="Facenet512", distance_metric="cosine", silent=True)
assert same["verified"] and same["distance"] <= same["threshold"]
assert not different["verified"] and different["distance"] > different["threshold"]
print("PASS: real Facenet512 inference (512 finite values), cosine verification, and no-face rejection")
print("Synthetic inference check only; this is not a consenting-photo or live-search demonstration.")
