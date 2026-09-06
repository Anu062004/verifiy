"""One clear consenting subject, locally encoded with Facenet512."""
import warnings
from pathlib import Path

MODEL_NAME = "Facenet512"
DETECTOR_BACKEND = "opencv"
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 20_000_000
MIN_FACE_SIZE = 64
MIN_BLUR_SCORE = 40.0


class FaceInputError(ValueError):
    pass


def read_image(image_path: str):
    import numpy as np
    from PIL import Image, ImageOps, UnidentifiedImageError
    path = Path(image_path)
    if not path.is_file() or not 0 < path.stat().st_size <= MAX_IMAGE_BYTES:
        raise FaceInputError("Input must be an existing, nonempty image of at most 8 MiB")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(path) as image:
                if image.width * image.height > MAX_PIXELS:
                    raise FaceInputError("Image exceeds 20 megapixels")
                if getattr(image, "n_frames", 1) != 1:
                    raise FaceInputError("Use a still image, not an animation")
                # Feed the same EXIF-corrected BGR pixels to detection and quality checks.
                return np.asarray(ImageOps.exif_transpose(image).convert("RGB"))[:, :, ::-1].copy()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise FaceInputError("Cannot decode image safely; use a JPEG, PNG, or WebP still image") from exc


def get_face_embedding(image_path: str):
    from common import load_environment
    load_environment()
    import cv2
    import numpy as np
    from deepface import DeepFace
    pixels = read_image(image_path)
    try:
        reps = DeepFace.represent(img_path=pixels, model_name=MODEL_NAME,
                                  detector_backend=DETECTOR_BACKEND, enforce_detection=True)
    except ValueError as exc:
        if "face could not be detected" in str(exc).lower():
            raise FaceInputError("No face detected; use a clear single-subject image") from exc
        raise
    if len(reps) != 1:
        raise FaceInputError(f"Expected exactly one face; found {len(reps)}")
    area = reps[0]["facial_area"]
    x, y, w, h = (int(area[k]) for k in ("x", "y", "w", "h"))
    if min(w, h) < MIN_FACE_SIZE:
        raise FaceInputError(f"Face is too small; need at least {MIN_FACE_SIZE}×{MIN_FACE_SIZE} pixels")
    crop = pixels[max(y, 0):y+h, max(x, 0):x+w]
    if not crop.size:
        raise FaceInputError("Invalid face crop")
    blur = float(cv2.Laplacian(cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var())
    if blur < MIN_BLUR_SCORE:
        raise FaceInputError(f"Face is too blurred (Laplacian variance {blur:.1f} < {MIN_BLUR_SCORE})")
    embedding = np.asarray(reps[0]["embedding"], dtype=np.float32)
    if embedding.shape != (512,) or not np.isfinite(embedding).all():
        raise RuntimeError("Facenet512 returned an invalid embedding")
    return embedding
