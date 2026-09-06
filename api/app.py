"""Local-only HTTP API for the interactive face-chain verification workflow."""
from __future__ import annotations

import os
import re
import sqlite3
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path

from flask import Flask, jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge

ROOT = Path(__file__).resolve().parents[1]
PY_DIR = ROOT / "py"
if str(PY_DIR) not in sys.path:
    sys.path.insert(0, str(PY_DIR))

from common import load_environment, run_node_json, safe_error  # noqa: E402
from embed import MAX_IMAGE_BYTES, get_face_embedding  # noqa: E402
from match import unavailable, verify_face  # noqa: E402
from orchestrator import save_index  # noqa: E402
from record import sha256_bytes, sha256_file, sha256_text, utc_now, write_canonical_record  # noqa: E402
from reverse_search import Candidate, candidate_to_dict, search_web  # noqa: E402

load_environment()

JOB_TTL_SECONDS = 60 * 60
OUTPUT = ROOT / "output" / "web-runs"
DATABASE = ROOT / "db" / "records.db"
JOBS: dict[str, dict] = {}
STATE_LOCK = threading.Lock()
COMMIT_LOCK = threading.Lock()
OPERATOR_RE = re.compile(r"^[\w .@-]{1,80}$", re.UNICODE)


def _checkpoint(job: dict, status: str) -> None:
    job["status"] = status
    job["updated_monotonic"] = time.monotonic()
    public = _public_job(job)
    write_canonical_record(public, job["directory"] / "run_result.json")
    write_canonical_record(public, OUTPUT / "run_result.json")


def _public_job(job: dict) -> dict:
    result = {
        "runId": job["id"],
        "status": job["status"],
        "createdAt": job["created_at"],
        "photoCommitment": job.get("photo_hash"),
        "candidates": [],
    }
    for index, candidate in enumerate(job.get("candidates", [])):
        item = {"index": index, **candidate_to_dict(candidate)}
        evidence = job.get("face_evidence", {}).get(index)
        if evidence is not None:
            item["face_verification"] = evidence
        result["candidates"].append(item)
    for source, target in (
        ("error", "error"),
        ("storage", "storage"),
        ("chain", "chain"),
        ("readback_verified", "readbackVerified"),
        ("matched_page_url", "matchedPageUrl"),
        ("record_sha256", "recordSha256"),
    ):
        if source in job:
            result[target] = job[source]
    return result


def _remove_private_input(job: dict) -> None:
    path = job.pop("photo_path", None)
    if path:
        Path(path).unlink(missing_ok=True)
    job.pop("embedding", None)


def _expire_jobs() -> None:
    cutoff = time.monotonic() - JOB_TTL_SECONDS
    with STATE_LOCK:
        expired = [key for key, job in JOBS.items() if job["updated_monotonic"] < cutoff]
        for key in expired:
            _remove_private_input(JOBS.pop(key))


def _get_job(job_id: str) -> dict:
    _expire_jobs()
    with STATE_LOCK:
        job = JOBS.get(job_id)
    if job is None:
        raise LookupError("Run not found or expired")
    return job


def _configuration() -> dict:
    credential_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    adc_path = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"
    google_ready = bool((credential_path and Path(credential_path).expanduser().is_file()) or adc_path.is_file())
    checks = {
        "googleSearch": google_ready,
        "contract": bool(os.getenv("CONTRACT_ADDRESS")),
        "testnetWallet": bool(os.getenv("PRIVATE_KEY")),
        "faceModel": (ROOT / ".cache" / "weights" / "facenet512_weights.h5").is_file(),
    }
    return {"checks": checks, "searchReady": checks["googleSearch"] and checks["faceModel"],
            "commitReady": all(checks.values())}


def _error(message: str, status: int):
    return jsonify({"error": message}), status


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.update(MAX_CONTENT_LENGTH=MAX_IMAGE_BYTES + 256 * 1024)
    if test_config:
        app.config.update(test_config)

    @app.after_request
    def secure_local_response(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.errorhandler(RequestEntityTooLarge)
    def upload_too_large(_error):
        return _error_response("Image exceeds the 8 MiB limit", 413)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "online", "service": "face-chain-local-api", **_configuration()})

    @app.post("/api/search")
    def start_search():
        if request.form.get("consent") != "true":
            return _error("Consent is required before the photo can be sent to Google", 400)
        upload = request.files.get("photo")
        if upload is None or not upload.filename:
            return _error("Choose one JPEG, PNG, or WebP photo", 400)
        if not (upload.mimetype or "").lower().startswith("image/"):
            return _error("The uploaded file must be an image", 415)

        run_id = utc_now().replace(":", "").replace("-", "") + "-" + uuid.uuid4().hex[:8]
        directory = OUTPUT / run_id
        directory.mkdir(parents=True, exist_ok=False)
        handle, temporary = tempfile.mkstemp(prefix="face-chain-web-", suffix=".img")
        os.close(handle)
        photo_path = Path(temporary)
        job = {
            "id": run_id,
            "status": "started",
            "created_at": utc_now(),
            "updated_monotonic": time.monotonic(),
            "directory": directory,
            "photo_path": photo_path,
            "face_evidence": {},
        }
        try:
            upload.save(photo_path)
            if not 0 < photo_path.stat().st_size <= MAX_IMAGE_BYTES:
                raise ValueError("Image must be nonempty and at most 8 MiB")
            _checkpoint(job, "encoding_face")
            job["embedding"] = get_face_embedding(str(photo_path))
            job["photo_hash"] = sha256_file(photo_path)
            _checkpoint(job, "searching_web")
            search_path = directory / "reverse_search_response.json"
            job["search_path"] = search_path
            job["candidates"] = search_web(str(photo_path), search_path)
            write_canonical_record({"candidates": [candidate_to_dict(item) for item in job["candidates"]]},
                                   directory / "candidates.json")
            _checkpoint(job, "search_complete")
            with STATE_LOCK:
                JOBS[run_id] = job
            return jsonify(_public_job(job)), 201
        except Exception as exc:
            job["error"] = safe_error(exc)
            _checkpoint(job, "failed")
            _remove_private_input(job)
            return _error(job["error"], 422)

    @app.get("/api/jobs/<job_id>")
    def get_job(job_id: str):
        try:
            return jsonify(_public_job(_get_job(job_id)))
        except LookupError as exc:
            return _error(str(exc), 404)

    @app.post("/api/jobs/<job_id>/verify")
    def check_candidate(job_id: str):
        try:
            job = _get_job(job_id)
            data = request.get_json(silent=True) or {}
            index = data.get("candidateIndex")
            if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < len(job["candidates"]):
                return _error("Choose a valid candidate", 400)
            if job["status"] in {"committing", "complete", "failed"}:
                return _error("This run can no longer verify candidates", 409)
            candidate: Candidate = job["candidates"][index]
            evidence = (verify_face(job["embedding"], candidate.image_url)
                        if candidate.image_url else unavailable("Provider returned no retrievable image URL"))
            job["face_evidence"][index] = evidence
            write_canonical_record({
                "candidates": [
                    {"candidate": candidate_to_dict(item), "face_verification": job["face_evidence"].get(position)}
                    for position, item in enumerate(job["candidates"])
                ]
            }, job["directory"] / "candidate_evidence.json")
            _checkpoint(job, "face_checked")
            return jsonify({"candidateIndex": index, "faceVerification": evidence, "run": _public_job(job)})
        except LookupError as exc:
            return _error(str(exc), 404)
        except Exception as exc:
            return _error(safe_error(exc), 422)

    @app.post("/api/jobs/<job_id>/commit")
    def commit_candidate(job_id: str):
        try:
            job = _get_job(job_id)
            data = request.get_json(silent=True) or {}
            index = data.get("candidateIndex")
            operator = str(data.get("operator", "")).strip()
            if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < len(job["candidates"]):
                return _error("Choose a valid candidate", 400)
            if data.get("humanConfirmed") is not True or data.get("publishConfirmed") is not True:
                return _error("Both page review and public-record confirmations are required", 400)
            if not OPERATOR_RE.fullmatch(operator):
                return _error("Operator label must be 1–80 letters, numbers, spaces, dots, @, _ or -", 400)
            candidate: Candidate = job["candidates"][index]
            evidence = job["face_evidence"].get(index)
            if evidence is None:
                return _error("Run face verification for this candidate first", 409)
            if evidence["status"] == "not_verified":
                return _error("A failed face comparison cannot be committed", 409)
            if not candidate.is_social:
                return _error("Only a returned social-media page is eligible for this pipeline", 409)
            with STATE_LOCK:
                if job["status"] in {"committing", "complete"}:
                    return _error("This run is already committing or complete", 409)
                if job["status"] == "awaiting_signature" and "pending_commit" in job:
                    pending = job["pending_commit"]
                    return jsonify({"run": _public_job(job), "signing": {
                        "chainId": 16602,
                        "contractAddress": pending["contract_address"],
                        "storageRootHash": pending["storage_root_hash"],
                        "photoCommitment": pending["photo_commitment"],
                        "matchedUrlCommitment": pending["url_commitment"],
                    }})
                if job["status"] == "failed":
                    return _error("This failed run cannot be retried automatically; start a new run", 409)
                job["status"] = "committing"
            if not COMMIT_LOCK.acquire(blocking=False):
                job["status"] = "face_checked"
                return _error("Another commit is in progress; try again after it finishes", 409)
            try:
                return _commit(job, candidate, evidence, operator)
            finally:
                COMMIT_LOCK.release()
        except LookupError as exc:
            return _error(str(exc), 404)
        except Exception as exc:
            return _error(safe_error(exc), 500)

    @app.post("/api/jobs/<job_id>/settle")
    def settle_job(job_id: str):
        """Accept a user-signed registry transaction and finish the run.

        The browser wallet signs and pays submitRecord(); this endpoint only
        validates the mined transaction against the prepared commitments.
        """
        try:
            job = _get_job(job_id)
            data = request.get_json(silent=True) or {}
            with STATE_LOCK:
                if job["status"] == "complete":
                    return _error("This run is already complete", 409)
                if job["status"] != "awaiting_signature":
                    return _error("This run has no prepared commitments awaiting signature", 409)
                job["status"] = "settling"
            if not COMMIT_LOCK.acquire(blocking=False):
                job["status"] = "awaiting_signature"
                return _error("Another settlement is in progress; try again after it finishes", 409)
            try:
                response, status = _settle(job, str(data.get("txHash", "")))
                if status >= 400 and job.get("status") == "settling":
                    job["status"] = "awaiting_signature"
                return response, status
            finally:
                COMMIT_LOCK.release()
        except LookupError as exc:
            return _error(str(exc), 404)
        except Exception as exc:
            return _error(safe_error(exc), 500)

    @app.delete("/api/jobs/<job_id>")
    def delete_job(job_id: str):
        with STATE_LOCK:
            job = JOBS.get(job_id)
            if job is None:
                return _error("Run not found or expired", 404)
            if job["status"] in {"committing", "settling"}:
                return _error("A committing run cannot be discarded", 409)
            job = JOBS.pop(job_id)
        _remove_private_input(job)
        return ("", 204)

    @app.get("/api/history")
    def history():
        records = []
        if DATABASE.is_file():
            with sqlite3.connect(DATABASE) as connection:
                connection.row_factory = sqlite3.Row
                rows = connection.execute(
                    "SELECT run_id, face_status, matched_page_url, storage_root_hash, chain_record_id, "
                    "chain_tx_hash, readback_verified, created_at FROM records ORDER BY id DESC LIMIT 50"
                ).fetchall()
                records = [dict(row) for row in rows]
        return jsonify({"records": records})

    return app


def _error_response(message: str, status: int):
    return jsonify({"error": message}), status


def _commit(job: dict, candidate: Candidate, evidence: dict, operator: str):
    try:
        job["matched_page_url"] = candidate.page_url
        url_commitment = sha256_text(candidate.page_url)
        record = {
            "schema_version": "1.0",
            "pipeline_version": "1.0.0",
            "input_photo_sha256": job["photo_hash"],
            "reverse_search": {
                "provider": candidate.reverse_provider,
                "match_type": candidate.reverse_match_type,
                "page_url": candidate.page_url,
                "page_title": candidate.page_title,
                "candidate_image_url": candidate.image_url,
                "is_social": candidate.is_social,
                "api_response_sha256": sha256_file(job["search_path"]),
                "manual_search": None,
            },
            "face_verification": evidence,
            "human_confirmation": {
                "confirmed": True,
                "confirmed_by": operator,
                "subject_consent_attested": True,
                "public_page_reviewed": True,
                "confirmed_at_utc": utc_now(),
            },
            "created_at_utc": utc_now(),
        }
        record_path = job["directory"] / "verification_record.json"
        payload = write_canonical_record(record, record_path)
        write_canonical_record(record, ROOT / "output" / "verification_record.json")
        job["record_sha256"] = sha256_bytes(payload)
        _checkpoint(job, "record_created")

        run_node_json("scripts/preflight.ts", timeout=90)
        storage = run_node_json("storage-service/src/storage.ts", "upload", record_path)
        job["storage"] = storage
        _checkpoint(job, "storage_uploaded")
        downloaded = job["directory"] / "storage_readback.json"
        proof = run_node_json("storage-service/src/storage.ts", "download", storage["rootHash"], downloaded)
        if proof.get("proofVerified") is not True or downloaded.read_bytes() != payload:
            raise RuntimeError("0G Storage read-back/proof failed; registry write blocked")
        _checkpoint(job, "storage_verified")

        # Prepare phase ends here. The registry write is signed and paid by the
        # user's own wallet in the browser; settle() validates that transaction.
        contract_address = os.getenv("CONTRACT_ADDRESS", "")
        job["pending_commit"] = {
            "storage_root_hash": storage["rootHash"],
            "photo_commitment": job["photo_hash"],
            "url_commitment": url_commitment,
            "record_path": str(record_path),
            "contract_address": contract_address,
            "page_url": candidate.page_url,
        }
        _checkpoint(job, "awaiting_signature")
        return jsonify({"run": _public_job(job), "signing": {
            "chainId": 16602,
            "contractAddress": contract_address,
            "storageRootHash": storage["rootHash"],
            "photoCommitment": job["photo_hash"],
            "matchedUrlCommitment": url_commitment,
        }})
    except Exception as exc:
        job["error"] = safe_error(exc)
        _checkpoint(job, "failed")
        _remove_private_input(job)
        return _error_response(job["error"], 502)


TX_HASH_RE = re.compile(r"^0x[0-9a-fA-F]{64}$")


def _settle(job: dict, tx_hash: str):
    """Validate a user-signed registry transaction, then finish the run.

    The transaction must be mined, successful, emitted by our registry
    contract, and carry exactly the commitments prepared for this job.
    Anything else is rejected WITHOUT failing the job, so the user can
    submit the correct transaction.
    """
    from verify_record import verify
    if not TX_HASH_RE.fullmatch(tx_hash or ""):
        return _error_response("Transaction hash must be a 0x-prefixed 32-byte hash", 400)
    pending = job.get("pending_commit")
    if not pending:
        return _error_response("This run has no prepared commitments; commit it first", 409)
    try:
        onchain = run_node_json("contracts/scripts/readRecord.ts", "--tx", tx_hash.lower(),
                                pending["contract_address"], timeout=120)
    except Exception as exc:
        return _error_response(f"Transaction not usable: {safe_error(exc)}", 422)
    for key, field in (("storage_root_hash", "storageRootHash"), ("photo_commitment", "photoCommitment"),
                       ("url_commitment", "matchedUrlCommitment")):
        if str(onchain.get(field, "")).lower() != str(pending[key]).lower():
            return _error_response("Transaction commitments do not match this run; submit the transaction signing the prepared commitments", 409)
    if str(onchain.get("contractAddress", "")).lower() != str(pending["contract_address"]).lower():
        return _error_response("Transaction was sent to a different contract", 409)
    try:
        chain = {"recordId": str(onchain["recordId"]), "contractAddress": onchain["contractAddress"],
                 "chainId": int(onchain.get("chainId", 16602)), "txHash": tx_hash.lower(),
                 "blockNumber": int(onchain["blockNumber"]), "submitter": onchain.get("submitter")}
        job["chain"] = chain
        _checkpoint(job, "chain_mined")
        record_path = Path(pending["record_path"])
        import json as _json
        stored = _json.loads(record_path.read_bytes())
        result_for_index = {"run_id": job["id"], "storage": job["storage"], "chain": chain, "readback_verified": False}
        save_index(DATABASE, f"web-upload:{job['id']}", stored, result_for_index)
        readback = verify(str(job["photo_path"]), chain["recordId"], chain["contractAddress"],
                          record_path, pending["page_url"])
        write_canonical_record(readback, job["directory"] / "readback.json")
        job["readback_verified"] = True
        result_for_index["readback_verified"] = True
        save_index(DATABASE, f"web-upload:{job['id']}", stored, result_for_index)
        _checkpoint(job, "complete")
        _remove_private_input(job)
        return jsonify(_public_job(job)), 200
    except Exception as exc:
        job["error"] = safe_error(exc)
        _checkpoint(job, "failed")
        _remove_private_input(job)
        return _error_response(job["error"], 502)


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("BACKEND_PORT", "8000")), debug=False, threaded=True)
