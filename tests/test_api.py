"""Offline HTTP API regression checks; no provider or testnet calls are made."""
from io import BytesIO
import importlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np

api_app = importlib.import_module("api.app")
from record import sha256_bytes
from reverse_search import Candidate


class ApiChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="face-chain-api-test-")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.output_patch = patch.object(api_app, "OUTPUT", self.directory / "output")
        self.database_patch = patch.object(api_app, "DATABASE", self.directory / "records.db")
        self.output_patch.start()
        self.database_patch.start()
        self.addCleanup(self.output_patch.stop)
        self.addCleanup(self.database_patch.stop)
        api_app.JOBS.clear()
        self.addCleanup(api_app.JOBS.clear)
        self.client = api_app.create_app({"TESTING": True}).test_client()
        self.candidate = Candidate(
            "https://reddit.com/comments/synthetic-test-only",
            "Synthetic test candidate",
            "https://example.org/synthetic-test-only.jpg",
            "FULL",
            is_social=True,
        )

    def search(self):
        def fake_search(_photo, evidence_path):
            Path(evidence_path).write_text('{"synthetic_test_only":true}')
            return [self.candidate]

        with patch.object(api_app, "get_face_embedding", return_value=np.ones(512)), \
             patch.object(api_app, "search_web", side_effect=fake_search):
            return self.client.post(
                "/api/search",
                data={"consent": "true", "photo": (BytesIO(b"synthetic-image"), "face.jpg", "image/jpeg")},
                content_type="multipart/form-data",
            )

    def test_health_and_consent_gate(self):
        health = self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json["status"], "online")
        rejected = self.client.post(
            "/api/search",
            data={"photo": (BytesIO(b"synthetic-image"), "face.jpg", "image/jpeg")},
            content_type="multipart/form-data",
        )
        self.assertEqual(rejected.status_code, 400)
        self.assertIn("Consent", rejected.json["error"])

    def test_search_and_face_check(self):
        searched = self.search()
        self.assertEqual(searched.status_code, 201)
        self.assertEqual(searched.json["status"], "search_complete")
        self.assertEqual(len(searched.json["candidates"]), 1)
        run_id = searched.json["runId"]
        face = {"status": "verified", "verified": True, "model": "Facenet512",
                "distance": 0.2, "threshold": 0.3, "metric": "cosine"}
        with patch.object(api_app, "verify_face", return_value=face):
            checked = self.client.post(f"/api/jobs/{run_id}/verify", json={"candidateIndex": 0})
        self.assertEqual(checked.status_code, 200)
        self.assertTrue(checked.json["faceVerification"]["verified"])
        saved = json.loads((self.directory / "output" / run_id / "candidate_evidence.json").read_text())
        self.assertEqual(saved["candidates"][0]["face_verification"]["status"], "verified")

    def test_commit_gates_and_offline_happy_path(self):
        run_id = self.search().json["runId"]
        rejected = self.client.post(
            f"/api/jobs/{run_id}/commit",
            json={"candidateIndex": 0, "operator": "test", "humanConfirmed": True, "publishConfirmed": True},
        )
        self.assertEqual(rejected.status_code, 409)

        face = {"status": "verified", "verified": True, "model": "Facenet512",
                "distance": 0.2, "threshold": 0.3, "metric": "cosine"}
        with patch.object(api_app, "verify_face", return_value=face):
            self.client.post(f"/api/jobs/{run_id}/verify", json={"candidateIndex": 0})

        root = sha256_bytes(b"synthetic-root")

        def fake_node(script, *args, **_kwargs):
            if script == "scripts/preflight.ts":
                return {"ready": True}
            if script.endswith("storage.ts") and args[0] == "upload":
                return {"rootHash": root, "txHash": root}
            if script.endswith("storage.ts"):
                record_path = self.directory / "output" / run_id / "verification_record.json"
                Path(args[2]).write_bytes(record_path.read_bytes())
                return {"rootHash": root, "proofVerified": True}
            return {"recordId": "0", "chainId": 16602, "contractAddress": "0x" + "12" * 20,
                    "txHash": root, "blockNumber": 1, "explorerUrl": "synthetic-test-only"}

        with patch.object(api_app, "run_node_json", side_effect=fake_node), \
             patch("verify_record.verify", return_value={"verified": True}):
            committed = self.client.post(
                f"/api/jobs/{run_id}/commit",
                json={"candidateIndex": 0, "operator": "test_operator",
                      "humanConfirmed": True, "publishConfirmed": True},
            )
        self.assertEqual(committed.status_code, 200)
        self.assertEqual(committed.json["status"], "complete")
        self.assertTrue(committed.json["readbackVerified"])
        duplicate = self.client.post(
            f"/api/jobs/{run_id}/commit",
            json={"candidateIndex": 0, "operator": "test_operator",
                  "humanConfirmed": True, "publishConfirmed": True},
        )
        self.assertEqual(duplicate.status_code, 409)
        history = self.client.get("/api/history")
        self.assertEqual(history.json["records"][0]["chain_record_id"], "0")


if __name__ == "__main__":
    unittest.main()
