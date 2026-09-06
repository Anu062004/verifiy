"""Offline regression checks. Synthetic provider responses are NEVER demo evidence."""
import argparse
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import socket
import sqlite3
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import uuid

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "py"))
from common import load_environment
load_environment()
import orchestrator
from embed import FaceInputError, get_face_embedding, read_image
from match import CandidateDownloadError, download_candidate_image, validate_download_url, verify_face
from record import canonical_json, sha256_bytes, sha256_file, sha256_text, write_canonical_record
from reverse_search import Candidate, candidates_from_web, is_social_url, public_web_url, search_web
from verify_record import check_commitments, verify


def candidate(kind="FULL", social=True, image=True):
    # Random synthetic URLs: no real post or identity fixture is bundled or used by the application.
    token = uuid.uuid4().hex
    base = "reddit.com" if social else "example.org"
    return Candidate(f"https://{base}/comments/{token}", None,
                     f"https://example.org/{token}.png" if image else None, kind, is_social=social)


FACE = {"status": "verified", "verified": True, "model": "Facenet512", "distance": .2, "threshold": .3, "metric": "cosine"}


class PipelineChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="face-chain-unit-")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)

    def test_canonical_hashes_and_tamper_detection(self):
        self.assertEqual(canonical_json({"b": "é", "a": 1}), canonical_json({"a": 1, "b": "é"}))
        with self.assertRaises(ValueError):
            canonical_json({"distance": float("nan")})
        photo = self.directory / "synthetic.bin"
        photo.write_bytes(uuid.uuid4().bytes)
        url = candidate().page_url
        record = {"schema_version": "1.0", "input_photo_sha256": sha256_file(photo),
                  "human_confirmation": {"confirmed": True}, "reverse_search": {"page_url": url}}
        chain = {"photoCommitment": sha256_file(photo), "matchedUrlCommitment": sha256_text(url)}
        self.assertTrue(check_commitments(str(photo), record, chain)["photo_commitment_matches"])
        record["reverse_search"]["page_url"] += "?changed=1"
        with self.assertRaisesRegex(RuntimeError, "URL commitment mismatch"):
            check_commitments(str(photo), record, chain)
        record["reverse_search"]["page_url"] = url
        photo.write_bytes(b"altered")
        with self.assertRaisesRegex(RuntimeError, "Photo commitment mismatch"):
            check_commitments(str(photo), record, chain)

    def test_candidate_normalization_and_domain_boundaries(self):
        full, partial, other = candidate(), candidate("PARTIAL"), candidate(social=False)
        def page(c, duplicate=False):
            return SimpleNamespace(url=c.page_url + ("#duplicate" if duplicate else ""), page_title=None,
                                   full_matching_images=[SimpleNamespace(url=c.image_url)] if c.reverse_match_type == "FULL" else [],
                                   partial_matching_images=[SimpleNamespace(url=c.image_url)] if c.reverse_match_type == "PARTIAL" else [])
        web = SimpleNamespace(pages_with_matching_images=[page(other), page(partial), page(full), page(full, True)])
        self.assertEqual([c.page_url for c in candidates_from_web(web)], [full.page_url, partial.page_url, other.page_url])
        self.assertTrue(is_social_url("https://www.reddit.com/comments/" + uuid.uuid4().hex))
        for url in ["https://reddit.com.evil.org/x", "https://reddit.com@evil.org/x", "file:///etc/passwd", "https://127.0.0.1/x", "https://reddit.com:9/x", "https://reddit.com/\nfoo"]:
            self.assertFalse(is_social_url(url), url)
        self.assertFalse(public_web_url("https://localhost/x"))

    def test_google_adapter_calls_sdk_and_retains_live_response(self):
        from google.cloud import vision
        c = candidate()
        photo = self.directory / "input"
        photo.write_bytes(uuid.uuid4().bytes)
        response = vision.AnnotateImageResponse(web_detection=vision.WebDetection(pages_with_matching_images=[
            vision.WebDetection.WebPage(url=c.page_url, full_matching_images=[vision.WebDetection.WebImage(url=c.image_url)])]))
        evidence = self.directory / "search.json"
        with patch.object(vision, "ImageAnnotatorClient") as factory:
            factory.return_value.web_detection.return_value = response
            result = search_web(str(photo), evidence)
            self.assertEqual(result[0].page_url, c.page_url)
            call = factory.return_value.web_detection.call_args
            self.assertEqual(call.kwargs["image"].content, photo.read_bytes())
            self.assertIn("response", json.loads(evidence.read_text()))
            factory.return_value.web_detection.return_value = vision.AnnotateImageResponse(error={"message": "quota exceeded"})
            with self.assertRaisesRegex(RuntimeError, "quota exceeded"):
                search_web(str(photo))

    def test_wrong_faces_are_skipped_and_unavailable_requires_human_review(self):
        a, b = candidate(), candidate(image=False)
        with patch.object(orchestrator, "verify_face", return_value={**FACE, "status": "not_verified", "verified": False}), patch("builtins.input", return_value="y") as prompt, redirect_stdout(io.StringIO()):
            selected = orchestrator.select_candidate(None, [a, b], self.directory / "evidence.json")
        self.assertEqual(selected[0], b)
        self.assertEqual(selected[1]["status"], "unavailable")
        self.assertEqual(prompt.call_count, 1)
        with patch("builtins.input", return_value="n"), redirect_stdout(io.StringIO()):
            self.assertIsNone(orchestrator.select_candidate(None, [b], self.directory / "reject.json"))

    def test_private_network_candidate_is_rejected(self):
        answer = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))]
        with patch("socket.getaddrinfo", return_value=answer):
            with self.assertRaises(CandidateDownloadError):
                validate_download_url("https://example.org/image.png")

    def test_download_bounds_and_blocked_image_status(self):
        import requests
        with patch("match.validate_download_url"), patch.object(requests, "Session") as session:
            response = session.return_value.__enter__.return_value.get.return_value.__enter__.return_value
            response.is_redirect = False
            response.headers = {"Content-Type": "image/png", "Content-Length": str(9 * 1024 * 1024)}
            with self.assertRaisesRegex(CandidateDownloadError, "exceeds"):
                download_candidate_image(candidate().image_url)
            response.headers = {"Content-Type": "text/html"}
            with self.assertRaisesRegex(CandidateDownloadError, "not an image"):
                download_candidate_image(candidate().image_url)
        with patch("match.download_candidate_image", side_effect=CandidateDownloadError("HTTP 403")):
            evidence = verify_face(None, candidate().image_url)
            self.assertEqual(evidence["status"], "unavailable")
            self.assertIsNone(evidence["verified"])

    def test_manual_fallback_is_explicitly_attributed(self):
        c = candidate(image=False)
        with patch("builtins.input", side_effect=["y", "Google Lens", c.page_url, ""]), redirect_stdout(io.StringIO()):
            selected, evidence = orchestrator.manual_candidate()
        self.assertEqual(selected.reverse_provider, "manual_reverse_image_search")
        self.assertEqual(selected.reverse_match_type, "MANUAL_REVIEW")
        self.assertTrue(evidence["same_input_photo_attested"])
        with patch("builtins.input", side_effect=EOFError):
            with self.assertRaises(orchestrator.Cancelled):
                orchestrator.ask("Confirm? ")

    def test_candidate_comparison_reuses_input_embedding_and_cleans_download(self):
        import numpy as np
        from deepface import DeepFace
        path = self.directory / "candidate-image"
        path.write_bytes(uuid.uuid4().bytes)
        vector = np.ones(512, dtype=np.float32)
        with patch("match.download_candidate_image", return_value=str(path)), patch("match.get_face_embedding", return_value=vector), patch.object(DeepFace, "verify", return_value={"verified": True, "distance": .1, "threshold": .3}) as compare:
            evidence = verify_face(vector, candidate().image_url)
        self.assertEqual(evidence["distance"], .1)
        self.assertEqual(compare.call_args.kwargs["img1_path"], vector.tolist())
        self.assertFalse(path.exists())

    def test_single_face_and_quality_validation(self):
        import numpy as np
        from PIL import Image
        from deepface import DeepFace
        photo = self.directory / "synthetic.png"
        pixels = np.random.default_rng(1).integers(0, 255, (120, 120, 3), dtype=np.uint8)
        Image.fromarray(pixels).save(photo)
        rep = {"embedding": [0.2] * 512, "facial_area": {"x": 0, "y": 0, "w": 100, "h": 100}}
        with patch.object(DeepFace, "represent", return_value=[rep]):
            self.assertEqual(get_face_embedding(str(photo)).shape, (512,))
        for reps in ([], [rep, rep]):
            with patch.object(DeepFace, "represent", return_value=reps), self.assertRaises(FaceInputError):
                get_face_embedding(str(photo))
        with patch.object(DeepFace, "represent", side_effect=ValueError("Face could not be detected")), self.assertRaises(FaceInputError):
            get_face_embedding(str(photo))
        with patch.object(DeepFace, "represent", return_value=[{**rep, "facial_area": {"x": 0, "y": 0, "w": 20, "h": 20}}]), self.assertRaisesRegex(FaceInputError, "small"):
            get_face_embedding(str(photo))
        Image.new("RGB", (120, 120)).save(photo)
        with patch.object(DeepFace, "represent", return_value=[rep]), self.assertRaisesRegex(FaceInputError, "blurred"):
            get_face_embedding(str(photo))
        photo.write_bytes(b"not an image")
        with self.assertRaises(FaceInputError):
            read_image(str(photo))

    def exercise_run(self, failure=None, confirm="y"):
        import numpy as np
        photo = self.directory / "synthetic-input"
        photo.write_bytes(uuid.uuid4().bytes)
        args = argparse.Namespace(image=str(photo), consent=True, operator="test_operator", search_only=False,
                                  manual_fallback=False, allow_non_social=False, output=self.directory / "output",
                                  database=self.directory / "history.db")
        c = candidate()
        root = sha256_bytes(b"synthetic storage root")
        calls = []

        def search(_path, evidence):
            write_canonical_record({"synthetic_test_only": True}, evidence)
            if failure == "search":
                raise RuntimeError("provider failed")
            return [c]

        def node(script, *params, **kwargs):
            calls.append((script, params))
            if script == "scripts/preflight.ts":
                return {"ready": True}
            if script.endswith("storage.ts") and params[0] == "upload":
                if failure == "upload":
                    raise RuntimeError("upload failed")
                return {"rootHash": root, "txHash": root}
            if script.endswith("storage.ts"):
                if failure == "proof":
                    raise RuntimeError("proof failed")
                Path(params[2]).write_bytes((args.output / "verification_record.json").read_bytes())
                return {"rootHash": root, "proofVerified": True}
            if failure == "chain":
                raise RuntimeError("chain failed")
            return {"recordId": "0", "chainId": 16602, "contractAddress": "0x" + "12" * 20,
                    "txHash": root, "blockNumber": 1, "explorerUrl": "synthetic-test-only"}

        with patch.object(orchestrator, "get_face_embedding", return_value=np.ones(512)), patch.object(orchestrator, "search_web", side_effect=search), patch.object(orchestrator, "verify_face", return_value=FACE), patch.object(orchestrator, "run_node_json", side_effect=node), patch("verify_record.verify", return_value={"verified": True}), patch("builtins.input", return_value=confirm), redirect_stdout(io.StringIO()):
            if failure or confirm == "n":
                with self.assertRaises(RuntimeError):
                    orchestrator.run(args)
            else:
                orchestrator.run(args)
        return json.loads((args.output / "run_result.json").read_text()), calls, args

    def test_offline_orchestration_through_index_and_readback(self):
        result, calls, args = self.exercise_run()
        self.assertEqual(result["status"], "complete")
        self.assertTrue(result["readback_verified"])
        with sqlite3.connect(args.database) as connection:
            self.assertEqual(connection.execute("SELECT human_confirmed, readback_verified FROM records").fetchone(), (1, 1))
        self.assertEqual(sum(script.endswith("writeRecord.ts") for script, _ in calls), 1)
        record = json.loads(Path(result["record_path"]).read_text())
        self.assertNotIn("embedding", record)

    def test_failures_and_rejection_do_not_write_the_registry(self):
        for failure in ("search", "upload", "proof"):
            with self.subTest(failure=failure):
                result, calls, _ = self.exercise_run(failure)
                self.assertEqual(result["status"], "failed")
                self.assertFalse(any(script.endswith("writeRecord.ts") for script, _ in calls))
        result, calls, _ = self.exercise_run(confirm="n")
        self.assertEqual(result["status"], "cancelled")
        self.assertEqual(calls, [])

    def test_chain_failure_retains_storage_and_canonical_evidence(self):
        result, _, _ = self.exercise_run("chain")
        self.assertEqual(result["status"], "failed")
        self.assertIn("storage", result)
        self.assertTrue(Path(result["record_path"]).is_file())

    def test_verifier_rejects_proof_failure_and_modified_local_record(self):
        photo = self.directory / "photo"
        photo.write_bytes(uuid.uuid4().bytes)
        url = candidate().page_url
        record = {"schema_version": "1.0", "input_photo_sha256": sha256_file(photo),
                  "human_confirmation": {"confirmed": True}, "reverse_search": {"page_url": url}}
        raw = canonical_json(record)
        chain = {"storageRootHash": sha256_bytes(raw), "photoCommitment": sha256_file(photo), "matchedUrlCommitment": sha256_text(url)}
        local = self.directory / "local.json"
        local.write_bytes(raw + b" ")
        def node(script, *params, **kwargs):
            if script.endswith("readRecord.ts"):
                return chain
            Path(params[2]).write_bytes(raw)
            return {"proofVerified": True, "rootHash": chain["storageRootHash"]}
        with patch("verify_record.run_node_json", side_effect=node):
            self.assertTrue(verify(str(photo), "0", "address")["verified"])
            with self.assertRaisesRegex(RuntimeError, "differs from the local"):
                verify(str(photo), "0", "address", local)
        with patch("verify_record.run_node_json", side_effect=[chain, {"proofVerified": False}]):
            with self.assertRaisesRegex(RuntimeError, "did not verify"):
                verify(str(photo), "0", "address")


if __name__ == "__main__":
    unittest.main()
