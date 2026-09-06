"""Input photo → live reverse-image search → human review → 0G Storage + Galileo."""
import argparse
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import uuid
from pathlib import Path

from common import ROOT, load_environment, run_node_json, safe_error
from embed import MAX_IMAGE_BYTES, get_face_embedding
from match import unavailable, verify_face
from record import sha256_bytes, sha256_file, sha256_text, utc_now, write_canonical_record
from reverse_search import Candidate, candidate_to_dict, is_social_url, public_web_url, search_web


class Cancelled(RuntimeError):
    pass


def ask(prompt: str) -> bool:
    try:
        return input(prompt).strip().lower() in {"y", "yes"}
    except EOFError as exc:
        raise Cancelled("Interactive human confirmation required; no automatic yes flag is supported") from exc


def select_candidate(embedding, candidates: list[Candidate], evidence_path: Path,
                     allow_non_social: bool = False) -> tuple[Candidate, dict] | None:
    evidence_log = []
    for position, candidate in enumerate(candidates, 1):
        print(f"\nCandidate {position}/{len(candidates)}", flush=True)
        # JSON escapes untrusted titles and terminal control characters.
        print(json.dumps(candidate_to_dict(candidate), ensure_ascii=True, indent=2))
        evidence = verify_face(embedding, candidate.image_url) if candidate.image_url else unavailable("Provider returned no retrievable image URL")
        entry = {"candidate": candidate_to_dict(candidate), "face_verification": evidence, "human_confirmed": False}
        evidence_log.append(entry)
        write_canonical_record({"candidates": evidence_log}, evidence_path)
        print("Face evidence:", json.dumps(evidence, allow_nan=False))
        if evidence["status"] == "not_verified":
            print("Face did not verify; continuing to the next candidate.")
            continue
        if not candidate.is_social and (not allow_non_social or evidence["status"] != "verified"):
            print("Non-social result: shown as evidence, but not eligible for this social-post run.")
            continue
        label = "social-media page/post" if candidate.is_social else "non-social page (does not satisfy the social-post requirement)"
        print(f"Open the returned page and check that it is public and contains the correct consenting subject's image.")
        if ask(f"Is this the correct {label}, and do you confirm this evidence? [y/N]: "):
            entry["human_confirmed"] = True
            write_canonical_record({"candidates": evidence_log}, evidence_path)
            return candidate, evidence
    return None


def manual_candidate() -> tuple[Candidate, dict]:
    print("\nMANUAL REVERSE-IMAGE FALLBACK: upload the SAME photo to Google Lens or Yandex in your browser.")
    if not ask("Have you just performed that live reverse-image search and inspected its returned result? [y/N]: "):
        raise Cancelled("Manual search not attested")
    provider = input("Search provider used (Google Lens / Yandex): ").strip()
    if provider.lower() not in {"google lens", "yandex"}:
        raise ValueError("Name the actual supported manual provider: Google Lens or Yandex")
    url = input("Paste the exact social page URL returned by that live search: ").strip()
    if not is_social_url(url):
        raise ValueError("Manual fallback requires a public HTTP(S) social-domain page URL")
    image_url = input("Public candidate image URL, if returned (Enter to omit): ").strip() or None
    if image_url and not public_web_url(image_url):
        raise ValueError("Candidate image URL must be public HTTP(S)")
    evidence = {"mode": "human_operated_reverse_image_search", "provider_name": provider,
                "attested_at_utc": utc_now(), "same_input_photo_attested": True}
    return Candidate(url, None, image_url, "MANUAL_REVIEW", "manual_reverse_image_search", True), evidence


def save_index(database: Path, image_path: str, record: dict, result: dict) -> None:
    database.parent.mkdir(parents=True, exist_ok=True)
    search, face, human, storage, chain = (record["reverse_search"], record["face_verification"],
                                         record["human_confirmation"], result["storage"], result["chain"])
    values = {
        "run_id": result["run_id"], "input_photo_path": image_path,
        "input_photo_sha256": record["input_photo_sha256"], "search_provider": search["provider"],
        "reverse_match_type": search["match_type"], "matched_page_url": search["page_url"],
        "candidate_image_url": search["candidate_image_url"], "is_social": int(search["is_social"]),
        "face_status": face["status"], "face_model": face["model"], "face_distance": face["distance"],
        "face_threshold": face["threshold"], "human_confirmed": 1, "confirmed_by": human["confirmed_by"],
        "storage_root_hash": storage["rootHash"], "storage_tx_hash": storage["txHash"],
        "chain_id": chain["chainId"], "contract_address": chain["contractAddress"],
        "chain_record_id": chain["recordId"], "chain_tx_hash": chain["txHash"],
        "chain_block_number": chain["blockNumber"], "readback_verified": int(result.get("readback_verified", False)),
        "created_at": record["created_at_utc"],
    }
    with sqlite3.connect(database) as connection:
        connection.executescript((ROOT / "db/schema.sql").read_text())
        columns = ",".join(values)
        placeholders = ",".join("?" for _ in values)
        connection.execute(f"INSERT INTO records ({columns}) VALUES ({placeholders}) ON CONFLICT(run_id) DO UPDATE SET readback_verified=excluded.readback_verified", list(values.values()))


def run(args: argparse.Namespace) -> dict:
    load_environment()
    image_path = Path(args.image).expanduser().resolve()
    if not image_path.is_file() or not 0 < image_path.stat().st_size <= MAX_IMAGE_BYTES:
        raise ValueError("Supply an existing nonempty image of at most 8 MiB")
    if not args.consent and not ask("Is this your own image or a consenting teammate's public content, with permission to send it to Google and publish the verification record? [y/N]: "):
        raise Cancelled("Subject consent is required before sending the photo to a provider")
    run_id = utc_now().replace(":", "").replace("-", "") + "-" + uuid.uuid4().hex[:8]
    output = args.output.resolve()
    directory = output / "runs" / run_id
    directory.mkdir(parents=True, exist_ok=False)
    result = {"run_id": run_id, "run_directory": str(directory), "status": "started", "started_at_utc": utc_now(),
              "input_photo_path": str(image_path), "record_path": str(directory / "verification_record.json")}

    def checkpoint(status: str) -> None:
        result["status"] = status
        write_canonical_record(result, directory / "run_result.json")
        write_canonical_record(result, output / "run_result.json")

    checkpoint("started")
    try:
        # A private snapshot keeps face/search/hash bytes identical even if the original is edited mid-run.
        with tempfile.TemporaryDirectory(prefix="face-chain-input-") as temporary:
            snapshot = Path(temporary) / "input.img"
            shutil.copyfile(image_path, snapshot)
            print("[1/8] Detecting and encoding face...", flush=True)
            embedding = get_face_embedding(str(snapshot))
            photo_hash = sha256_file(snapshot)
            print(f"Face detected; {len(embedding)}-dimension Facenet512 embedding generated (memory only).")
            result["photo_commitment"] = photo_hash
            checkpoint("face_encoded")

            print("[2/8] Running genuine reverse-image search...", flush=True)
            search_path = directory / "reverse_search_response.json"
            candidates = search_web(str(snapshot), search_path)
            print(f"Received {len(candidates)} live candidates; {sum(c.is_social for c in candidates)} social candidates", flush=True)
            write_canonical_record({"candidates": [candidate_to_dict(c) for c in candidates]}, directory / "candidates.json")
            checkpoint("search_complete")
            if args.search_only:
                print(json.dumps([candidate_to_dict(c) for c in candidates], indent=2))
                checkpoint("search_only")
                return result

            print("[3/8] Verifying candidates...", flush=True)
            selected = select_candidate(embedding, candidates, directory / "candidate_evidence.json", args.allow_non_social)
            manual = None
            if selected is None and args.manual_fallback:
                candidate, manual = manual_candidate()
                write_canonical_record({"candidate": candidate_to_dict(candidate), **manual}, directory / "manual_search_evidence.json")
                selected = select_candidate(embedding, [candidate], directory / "manual_candidate_evidence.json")
            if selected is None:
                raise Cancelled("No usable candidate confirmed. Try a better indexed consenting photo or --manual-fallback.")
            candidate, face = selected
            result["matched_page_url"] = candidate.page_url
            result["url_commitment"] = sha256_text(candidate.page_url)
            result["social_requirement_met"] = candidate.is_social
            print("The public storage record will contain the matched URL and evidence. The chain stores only commitments.")
            if not ask("Commit this verification to 0G Storage and Galileo? [y/N]: "):
                raise Cancelled("Commit cancelled by operator; no storage or chain write performed")

            print("[4/8] Writing canonical verification record...", flush=True)
            record = {
                "schema_version": "1.0", "pipeline_version": "1.0.0", "input_photo_sha256": photo_hash,
                "reverse_search": {"provider": candidate.reverse_provider, "match_type": candidate.reverse_match_type,
                                   "page_url": candidate.page_url, "page_title": candidate.page_title,
                                   "candidate_image_url": candidate.image_url, "is_social": candidate.is_social,
                                   "api_response_sha256": sha256_file(search_path), "manual_search": manual},
                "face_verification": face,
                "human_confirmation": {"confirmed": True, "confirmed_by": args.operator or os.getenv("CONFIRMED_BY", "demo_operator"),
                                       "subject_consent_attested": True, "public_page_reviewed": True, "confirmed_at_utc": utc_now()},
                "created_at_utc": utc_now(),
            }
            payload = write_canonical_record(record, result["record_path"])
            write_canonical_record(record, output / "verification_record.json")
            result["record_sha256"] = sha256_bytes(payload)
            checkpoint("record_created")

            print("[5/8] Uploading record to 0G Storage...", flush=True)
            run_node_json("scripts/preflight.ts", timeout=90)
            storage = run_node_json("storage-service/src/storage.ts", "upload", result["record_path"])
            result["storage"] = storage
            print("0G rootHash:", storage["rootHash"], flush=True)
            checkpoint("storage_uploaded")
            # Establish retrieval and proof validity BEFORE making the registry commitment.
            downloaded = directory / "storage_readback.json"
            proof = run_node_json("storage-service/src/storage.ts", "download", storage["rootHash"], downloaded)
            if proof.get("proofVerified") is not True or downloaded.read_bytes() != payload:
                raise RuntimeError("0G Storage read-back/proof failed; registry write blocked")
            checkpoint("storage_verified")

            print("[6/8] Writing commitments to 0G Chain...", flush=True)
            chain = run_node_json("contracts/scripts/writeRecord.ts", storage["rootHash"], photo_hash,
                                  result["url_commitment"], directory / "chain_transaction.json", timeout=240)
            result["chain"] = chain
            print("Chain txHash:", chain["txHash"], "\nExplorer:", chain["explorerUrl"], flush=True)
            checkpoint("chain_mined")

            print("[7/8] Saving local index and verifying the on-chain record...", flush=True)
            save_index(args.database, str(image_path), record, result)
            from verify_record import verify
            readback = verify(str(snapshot), chain["recordId"], chain["contractAddress"], Path(result["record_path"]), candidate.page_url)
            write_canonical_record(readback, directory / "readback.json")
            result["readback_verified"] = True
            save_index(args.database, str(image_path), record, result)
            checkpoint("complete")
            print("[8/8] DONE — storage proof, photo commitment, URL commitment, and contract read-back verified.", flush=True)
            print(json.dumps(result, indent=2, ensure_ascii=True))
            return result
    except (Exception, KeyboardInterrupt) as exc:
        result["failed_after"] = result["status"]
        result["error"] = safe_error(exc) or "Interrupted by operator"
        checkpoint("cancelled" if isinstance(exc, (Cancelled, KeyboardInterrupt)) else "failed")
        print(f"Run evidence retained at {directory}", file=sys.stderr)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image")
    parser.add_argument("--consent", action="store_true", help="Attest own/consenting subject's content; final human gate remains mandatory")
    parser.add_argument("--operator", help="Operator label stored in public record; avoid sensitive names")
    parser.add_argument("--search-only", action="store_true", help="Face encoding + live Google search, with no storage/chain writes")
    parser.add_argument("--manual-fallback", action="store_true", help="Offer a clearly attributed human-operated search if no API candidate is confirmed")
    parser.add_argument("--allow-non-social", action="store_true", help="Allow face-verified non-social pages; explicitly fails the social-post acceptance requirement")
    parser.add_argument("--output", type=Path, default=ROOT / "output")
    parser.add_argument("--database", type=Path, default=ROOT / "db/records.db")
    args = parser.parse_args()
    try:
        run(args)
    except (Exception, KeyboardInterrupt) as exc:
        print(f"STOPPED: {safe_error(exc) or 'Interrupted'}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
