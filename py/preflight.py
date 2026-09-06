"""Read-only readiness checks; never prints keys or credential contents."""
import argparse
import importlib.metadata
import json
import sys
from common import load_environment, run_node_json, safe_error


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--for-deploy", action="store_true", help="Do not require an already deployed contract")
    parser.add_argument("--local", action="store_true", help="Check installed dependencies without credentials or network")
    parser.add_argument("--warm-model", action="store_true", help="Download/load Facenet512 weights before the demo")
    args = parser.parse_args()
    load_environment()
    checks = {"python": sys.version.split()[0]}
    if sys.version_info[:2] not in {(3, 11), (3, 12)}:
        raise RuntimeError("Use Python 3.11 or 3.12 for the pinned TensorFlow/DeepFace stack")
    for package in ("deepface", "tensorflow", "tf-keras", "numpy", "opencv-python", "Pillow", "google-cloud-vision"):
        checks[package] = importlib.metadata.version(package)
    from deepface import DeepFace
    from google.cloud import vision
    if args.warm_model:
        DeepFace.build_model("Facenet512")
        checks["facenet512_weights"] = "loaded"
    if not args.local:
        import google.auth
        from google.auth.transport.requests import Request
        credentials, project = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        credentials.refresh(Request())
        checks["google_credentials"] = "authenticated"
        checks["google_project"] = project
        checks["network"] = run_node_json("scripts/preflight.ts", *(["--for-deploy"] if args.for_deploy else []), timeout=90)
    checks["ready"] = True
    checks["scope"] = "local dependencies only" if args.local else "credentials and network; API enablement/search coverage still require --search-only"
    print(json.dumps(checks, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"PREFLIGHT FAILED: {safe_error(exc)}", file=sys.stderr)
        raise SystemExit(1)
