"""Independent read-only verification: on-chain record → proof-checked storage → hashes."""
import argparse
import json
import sys
import tempfile
from pathlib import Path

from common import ROOT, load_environment, run_node_json, safe_error
from record import canonical_json, sha256_file, sha256_text, utc_now, write_canonical_record


def check_commitments(image_path: str, record: dict, chain: dict, expected_url: str | None = None) -> dict:
    if record.get("schema_version") != "1.0" or record.get("human_confirmation", {}).get("confirmed") is not True:
        raise RuntimeError("Stored record has an unsupported schema or lacks human confirmation")
    page_url = record["reverse_search"]["page_url"]
    if expected_url is not None and page_url != expected_url:
        raise RuntimeError("Stored page URL differs from the expected exact URL")
    photo = sha256_file(image_path)
    url = sha256_text(page_url)
    if photo != record["input_photo_sha256"] or photo.lower() != chain["photoCommitment"].lower():
        raise RuntimeError("Photo commitment mismatch: input photo was changed or is the wrong file")
    if url.lower() != chain["matchedUrlCommitment"].lower():
        raise RuntimeError("URL commitment mismatch: stored URL disagrees with the chain")
    return {"photo_commitment_matches": True, "url_commitment_matches": True, "matched_page_url": page_url}


def verify(image_path: str, record_id: str, contract_address: str, local_record: Path | None = None,
           expected_url: str | None = None) -> dict:
    chain = run_node_json("contracts/scripts/readRecord.ts", record_id, contract_address, timeout=90)
    with tempfile.TemporaryDirectory(prefix="face-chain-readback-") as directory:
        downloaded = Path(directory) / "record.json"
        storage = run_node_json("storage-service/src/storage.ts", "download", chain["storageRootHash"], downloaded)
        if storage.get("proofVerified") is not True or storage["rootHash"].lower() != chain["storageRootHash"].lower():
            raise RuntimeError("Storage download did not verify the on-chain Merkle root")
        raw = downloaded.read_bytes()
        record = json.loads(raw)
        if canonical_json(record) != raw:
            raise RuntimeError("Downloaded JSON does not follow the canonical serialization convention")
        if local_record is not None and raw != local_record.read_bytes():
            raise RuntimeError("Downloaded record differs from the local record used during the run")
        api_hash = record.get("reverse_search", {}).get("api_response_sha256")
        if local_record is not None and api_hash:
            response_path = local_record.parent / "reverse_search_response.json"
            if not response_path.is_file() or sha256_file(response_path) != api_hash:
                raise RuntimeError("Local reverse-search response differs from the evidence committed in storage")
        checks = check_commitments(image_path, record, chain, expected_url)
    return {"verified": True, **checks, "storage_proof_verified": True,
            "local_record_matches": True if local_record is not None else None,
            "local_search_evidence_matches": True if local_record is not None and api_hash else None,
            "record": record, "chain": chain, "verified_at_utc": utc_now()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", help="Original input image; exact bytes must match")
    parser.add_argument("--result", type=Path, default=ROOT / "output/run_result.json")
    parser.add_argument("--record-id", help="Use with --contract for independent verification without local output")
    parser.add_argument("--contract", help="Registry contract address on Galileo")
    parser.add_argument("--url", help="Optional exact expected URL to compare")
    args = parser.parse_args()
    load_environment()
    if args.record_id is not None:
        if not args.contract:
            parser.error("--record-id requires --contract")
        result = verify(args.image, args.record_id, args.contract, expected_url=args.url)
    else:
        saved = json.loads(args.result.read_text())
        chain = saved.get("chain")
        if not chain:
            raise RuntimeError("This run has no mined registry record; check its status and transaction journal")
        result = verify(args.image, chain["recordId"], chain["contractAddress"],
                        Path(saved["record_path"]), args.url or saved["matched_page_url"])
        output = Path(saved["run_directory"]) / "readback.json"
        write_canonical_record(result, output)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (Exception, KeyboardInterrupt) as exc:
        print(f"VERIFICATION FAILED: {safe_error(exc)}", file=sys.stderr)
        raise SystemExit(1)
