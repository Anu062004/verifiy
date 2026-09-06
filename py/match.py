"""Download a public candidate with bounds, then reuse the input face embedding."""
import ipaddress
import socket
import tempfile
import time
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from embed import FaceInputError, MAX_IMAGE_BYTES, MODEL_NAME, get_face_embedding
from reverse_search import public_web_url


class CandidateDownloadError(RuntimeError):
    pass


def validate_download_url(url: str) -> None:
    if not public_web_url(url):
        raise CandidateDownloadError("Candidate URL must be public HTTP(S)")
    parsed = urlsplit(url)
    try:
        addresses = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except OSError as exc:
        raise CandidateDownloadError("Candidate hostname could not be resolved") from exc
    if not addresses or any(not ipaddress.ip_address(address[4][0]).is_global for address in addresses):
        raise CandidateDownloadError("Candidate resolves to a non-public network address")


def download_candidate_image(url: str) -> str:
    import requests
    started = time.monotonic()
    data = bytearray()
    try:
        with requests.Session() as session:
            session.trust_env = False
            for _ in range(6):
                validate_download_url(url)
                with session.get(url, timeout=(5, 12), stream=True, allow_redirects=False,
                                 headers={"User-Agent": "FaceChainVerifier/1.0 (consenting-content demo)"}) as response:
                    if response.is_redirect:
                        url = urljoin(url, response.headers["Location"])
                        continue
                    response.raise_for_status()
                    if not response.headers.get("Content-Type", "").lower().startswith("image/"):
                        raise CandidateDownloadError("Candidate response is not an image")
                    length = response.headers.get("Content-Length")
                    if length and int(length) > MAX_IMAGE_BYTES:
                        raise CandidateDownloadError("Candidate image exceeds 8 MiB")
                    for chunk in response.iter_content(64 * 1024):
                        data.extend(chunk)
                        if len(data) > MAX_IMAGE_BYTES:
                            raise CandidateDownloadError("Candidate image exceeds 8 MiB")
                        if time.monotonic() - started > 45:
                            raise CandidateDownloadError("Candidate download exceeded 45 seconds")
                    break
            else:
                raise CandidateDownloadError("Too many candidate redirects")
    except (requests.RequestException, ValueError) as exc:
        raise CandidateDownloadError(f"Public candidate image unavailable: {type(exc).__name__}") from exc
    if not data:
        raise CandidateDownloadError("Candidate image is empty")
    with tempfile.NamedTemporaryFile(delete=False, suffix=".img") as stream:
        stream.write(data)
        return stream.name


def unavailable(reason: str) -> dict:
    return {"status": "unavailable", "verified": None, "model": MODEL_NAME,
            "distance": None, "threshold": None, "metric": "cosine", "reason": reason}


def verify_face(input_embedding, candidate_image_url: str) -> dict:
    from deepface import DeepFace
    from record import sha256_file
    temporary = None
    try:
        try:
            temporary = download_candidate_image(candidate_image_url)
        except CandidateDownloadError as exc:
            return unavailable(str(exc))
        digest = sha256_file(temporary)
        try:
            candidate_embedding = get_face_embedding(temporary)
        except FaceInputError as exc:
            return {"status": "not_verified", "verified": False, "model": MODEL_NAME,
                    "distance": None, "threshold": None, "metric": "cosine",
                    "reason": str(exc), "candidate_image_sha256": digest}
        result = DeepFace.verify(img1_path=input_embedding.tolist(), img2_path=candidate_embedding.tolist(),
                                 model_name=MODEL_NAME, distance_metric="cosine", silent=True)
        verified = bool(result["verified"])
        return {"status": "verified" if verified else "not_verified", "verified": verified,
                "model": MODEL_NAME, "distance": float(result["distance"]),
                "threshold": float(result["threshold"]), "metric": "cosine",
                "candidate_image_sha256": digest}
    finally:
        if temporary:
            Path(temporary).unlink(missing_ok=True)
