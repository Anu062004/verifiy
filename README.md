# Face Chain Verifier

A CLI pipeline for your own or a consenting teammate's public image: detect and encode one face, discover matching pages using live Google Cloud Vision Web Detection, verify returned images, confirm the evidence, store a canonical record on 0G Storage, and commit its Merkle root and SHA-256 commitments on 0G Galileo.

```text
runtime photo → local Facenet512 embedding → live Google Web Detection
  → public page candidates → face verification → human confirmation
  → canonical JSON → 0G Storage + proof-checked download
  → Galileo registry → contract read-back + commitment verification → SQLite history
```

Search discovers image reuse. Face comparison only verifies returned candidates. A matching page does not prove who owns an account. There is no identity database, scraper, frontend, account system, or bundled matching post.

## What is implemented and what needs live access

The source, environment templates, pinned dependencies, local contract tests, SDK Merkle checks, Python orchestration tests, model smoke check, read-back command, and recording guide are included. Installation and local checks were run on macOS ARM64 with Python 3.12 and Node 24. The real model weights are cached locally after the warm-up command.

A successful **live** search, paid testnet storage upload, Galileo deployment/transaction, and unedited screen recording require your consenting subject's photo, Google Cloud access, and a funded testnet wallet. No successful live match, transaction, or recording is bundled or fabricated. Track these separately in [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md).

## Install

Use Python **3.11 or 3.12** and Node **22 or 24**. The default Python 3.14 on this machine is incompatible with this pinned TensorFlow stack; this workspace already has a Python 3.12 `.venv`.

```bash
cd /Users/macavenue/Desktop/Goa
# For this prepared workspace:
source .venv/bin/activate

# For a fresh clone, create the environment first:
# python3.12 -m venv .venv
# source .venv/bin/activate

python -m pip install -r requirements.lock
npm ci
npm run compile
cp -n .env.example .env
```

If this prepared environment lacks pip, use `python -m ensurepip` first. `requirements.txt` pins direct Python dependencies; `requirements.lock` pins the resolved dependency graph. Root `package-lock.json` covers both npm workspaces. Run npm commands at the repository root unless a command explicitly says otherwise.

The environment in this workspace was created with a local Python manager under `.tools/`, which is ignored by Git. Neither `.venv`, `.tools`, model weights, nor credential files belong in your submission.

## Configure Google Cloud and Galileo

Enable Cloud Vision API in a Google Cloud project with billing. Use Application Default Credentials:

```bash
gcloud auth application-default login
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

Alternatively, put the absolute path to a local service-account credential file in `GOOGLE_APPLICATION_CREDENTIALS` in `.env`. Keep that credential outside the repository or in ignored `secrets/`. Never paste credential contents into source or terminal recordings. Google documents [local ADC setup](https://cloud.google.com/docs/authentication/set-up-adc-local-dev-environment) and [Web Detection requests](https://docs.cloud.google.com/vision/docs/detecting-web).

Edit root `.env` with a **testnet-only** `PRIVATE_KEY`. Use [the 0G faucet](https://faucet.0g.ai) to fund its public address, then deploy the registry:

```bash
python py/preflight.py --local --warm-model
python py/preflight.py --for-deploy
npm run deploy
```

Copy the printed `CONTRACT_ADDRESS` into `.env`, then run `python py/preflight.py`. Preflight checks dependency imports, Google credential refresh, chain ID, positive wallet balance, deployed contract code/interface, and storage-node availability. It does not guarantee enough funds for a particular upload, enabled Google API billing, or search-engine coverage; the live search command below checks the provider request.

| Setting | Default |
| --- | --- |
| Network | 0G Galileo Testnet |
| Chain ID | `16602` |
| Token | `0G` |
| RPC | `https://evmrpc-testnet.0g.ai` |
| Turbo indexer | `https://indexer-storage-testnet-turbo.0g.ai` |
| Explorer | `https://chainscan-galileo.0g.ai` |

Every live chain adapter checks `16602` and refuses other networks. Hardhat tests use an isolated local EVM. Use the same storage indexer for upload and download: Turbo and Standard are separate storage networks. The [official 0G starter kit](https://github.com/0gfoundation/0g-storage-ts-starter-kit) describes those network settings.

Environment precedence is shell variables, then root `.env`, then a component's `.env`. Use root `.env` for the integrated pipeline so both components share a wallet, RPC, and indexer. Component templates are included for standalone use. No command prints private keys.

## Run the pipeline

Place the consenting subject's photo at `demo/me.jpg`. Choose an older, public, indexed social post containing that photo. A light crop or resize may match; an unrelated portrait of the same person may not.

First check actual provider coverage without storage or chain writes:

```bash
python py/orchestrator.py demo/me.jpg --consent --search-only
```

Then run the full pipeline:

```bash
python py/orchestrator.py demo/me.jpg --consent
```

`--consent` attests that you have permission for the subject's image to be sent to Google and for the verification record to be published. If omitted, the CLI asks before search. It never skips the candidate review or the final publishing confirmation. There is deliberately no automatic `--yes` flag.

The terminal displays each returned page URL, provider, match type, raw face distance, model threshold, and availability status. Open the candidate page yourself and inspect it. Rejecting a candidate continues to the next. A failed face comparison is always skipped. A blocked or missing candidate image is `unavailable`, which still requires explicit human review. Unexpected model failures stop the run.

Social FULL matches come first, then social PARTIAL and PAGE_MATCH candidates, followed by other pages. Both full and partial images associated with a page are retained; normalized URLs are used only to deduplicate. Commitments hash the exact accepted URL bytes. Non-social pages are shown but cannot be committed by default. `--allow-non-social` permits only face-verified non-social candidates and explicitly records that the social-post requirement was not met.

The input must be a nonempty still image of at most 8 MiB and 20 megapixels, with exactly one face at least 64×64 pixels. Face-crop Laplacian variance must be at least 40. These conservative demo quality heuristics can reject usable photos. EXIF orientation is applied for local face analysis. The original file bytes are sent to Google and hashed; a temporary private snapshot keeps those bytes consistent throughout the run. Embeddings remain in memory and temporary input/candidate images are removed afterward.

## Results and verification

Every attempt gets a fresh `output/runs/<run-id>/` directory. There is no pre-generated successful `run_result.json`.

| File | Purpose |
| --- | --- |
| `reverse_search_response.json` | Actual provider response with provider and query time |
| `candidates.json` | Normalized/deduplicated candidates, preserving exact returned URLs |
| `candidate_evidence.json` | Face evidence and human selection decisions |
| `verification_record.json` | Exact canonical bytes uploaded to 0G Storage |
| `storage_readback.json` | First proof-checked download, before registry submission |
| `chain_transaction.json` | Broadcast hash immediately after sending, then mined receipt information |
| `readback.json` | Independent contract/storage/commitment checks |
| `run_result.json` | Status, commitments, storage/chain results, record ID, explorer URL, and errors |

`output/run_result.json` is the latest attempt, including failures. `output/verification_record.json` is the latest constructed record and can belong to an older attempt if a later attempt fails early. Always use `record_path` and `status` from the specific run result. Older run directories are preserved.

Verify the latest mined result:

```bash
python py/verify_record.py demo/me.jpg
# Or a specific historical run:
python py/verify_record.py demo/me.jpg --result output/runs/RUN_ID/run_result.json
```

Independent verification needs only the original image, public contract address, record ID, and correct indexer; it does not need Google credentials, the private key, or SQLite:

```bash
python py/verify_record.py demo/me.jpg --record-id 0 --contract YOUR_CONTRACT_ADDRESS
# Optionally also assert the exact URL:
python py/verify_record.py demo/me.jpg --record-id 0 --contract YOUR_CONTRACT_ADDRESS --url 'EXACT_RETURNED_PAGE_URL'
npm run chain:read -- 0 YOUR_CONTRACT_ADDRESS
```

The verifier reads the root, photo commitment, URL commitment, submitter, and timestamp from `getRecord()`. It downloads storage with SDK proof checking enabled, recomputes the downloaded bytes' Merkle root, verifies canonical JSON, compares SHA-256 photo and URL hashes, and compares local record bytes when supplied. Any discrepancy exits nonzero.

```text
SHA256(original photo bytes)       = photoCommitment
SHA256(exact page URL UTF-8 bytes)  = matchedUrlCommitment
0G Merkle root(canonical JSON)     = storageRootHash
```

Canonical JSON uses sorted keys, compact separators, literal Unicode encoded as UTF-8, and rejects NaN/infinity. This is a defined Python serialization convention, not an implementation of RFC 8785. SHA-256 of the record itself is separate from the 0G Merkle root. No raw photo, embedding, or URL is written directly to the registry.

SQLite (`db/records.db`) indexes runs after a mined transaction. It is only local history, not the proof layer:

```bash
sqlite3 -header -column db/records.db 'SELECT run_id, face_status, chain_record_id, readback_verified FROM records;'
```

## Manual reverse-image fallback

```bash
python py/orchestrator.py demo/me.jpg --consent --manual-fallback
```

The API search always runs first. If no candidate is confirmed, the CLI asks you to perform a fresh Google Lens or Yandex search with the same image in your browser. You attest to the live search, name the actual provider, and paste its returned social-page URL (plus image URL if available). Face verification and both human gates still apply. The record labels this as `manual_reverse_image_search` / `MANUAL_REVIEW`, retains the original API response hash, and saves a separate manual evidence file. This is operator-attested evidence; the program cannot independently prove what appeared in the browser. Show it in the recording. API errors stop visibly rather than being disguised as empty results.

## Failures and recovery

No/multiple/small/blurred faces stop before search. Provider errors are printed. Empty or rejected results stop without uploading. Network-only media failures are unavailable, never mislabeled as negative face matches. Downloads check public HTTP(S) addresses and each redirect, enforce size/type/time bounds, and remove temporary files; no cookies or login bypass are used.

Storage upload or proof failure prevents registry submission. Uploading may itself have consumed testnet gas before a later error; inspect the displayed storage root and transaction output. Registry timeouts can occur after broadcast: the saved transaction journal and explorer must be checked **before** retrying. The registry is append-only and intentionally permits duplicate commitments under new IDs, so blind retries can create duplicate records.

Recover a record ID from a mined transaction, read-only:

```bash
npm run chain:read -- --tx YOUR_TRANSACTION_HASH YOUR_CONTRACT_ADDRESS
python py/verify_record.py demo/me.jpg --record-id RECOVERED_ID --contract YOUR_CONTRACT_ADDRESS
```

If storage succeeded and the registry transaction definitely failed (or was never broadcast), the saved canonical record and storage root can be reused. First verify the root/download. Then explicitly submit the three commitments with the standalone command:

```bash
npm run storage:download -- SAVED_ROOT_HASH output/retry-download.json
# Compare retry-download.json with that run's verification_record.json before continuing.
npm run chain:write -- SAVED_ROOT_HASH SAVED_PHOTO_COMMITMENT SAVED_URL_COMMITMENT
```

These low-level write commands are explicit transactions and do not replay the interactive search workflow. Review the preserved evidence before using them. Downloads refuse existing destinations. Never edit an uploaded record in place; a changed record requires a new root and new human confirmation. If indexing/read-back fails after mining, the transaction remains on-chain, the run is marked failed with the mined result retained, and the independent verifier can be rerun.

## Test

```bash
npm test
python -m unittest discover -s tests -v
python py/preflight.py --local --warm-model
python tests/model_smoke.py
```

The contract tests deploy and transact on an actual local Hardhat EVM; they verify events, sequential IDs, submitters, timestamps, immutable earlier records, and invalid-input reverts. SDK tests use real local 0G Merkle computation. Python tests exercise provider request construction, candidate filtering, face quality gates, confirmation, failure ordering, canonical hashing, SQLite, and read-back tampering with explicitly synthetic, randomly generated test responses. Those offline responses are isolated to tests and cannot be selected by the CLI. The model smoke test runs real Facenet512 inference on synthetic pixels and checks production no-face rejection. It is not a real-person or live-search demo.

CI runs compilation, TypeScript checks, contract/SDK tests, and Python regression tests. Live Google/testnet operations are intentionally not run from CI with hidden fixtures or wallets. See [docs/VALIDATION.md](docs/VALIDATION.md) for this workspace's observed results.

## Known limitations

1. **Coverage:** private, login-gated, recent, robots-blocked, or non-indexed posts may never appear. Google may find no social match.
2. **Identity:** reused photos do not prove account ownership or legal identity. This records a matched page and accepted evidence.
3. **Model error:** face models have false positives and negatives, including performance differences between subjects and conditions. Raw cosine distance/threshold are retained, not converted into a made-up confidence percentage. Human review is required; this is not liveness detection or identity-document verification.
4. **Media access:** social CDNs may block downloads even when search indexes the page. `unavailable` explicitly means face comparison was not completed.
5. **Truth versus integrity:** the blockchain proves the commitments and submitter at a block time. It does not certify Google's truthfulness, the operator's honesty, consent, or future existence of the page. Local raw provider evidence is additionally committed by its SHA-256 in the storage record, but it is not a provider-signed attestation.
6. **Permanence/privacy:** the public storage JSON contains the selected URL, metadata, and operator label. Hashes are unsalted and are not anonymization for guessable inputs. Raw faces/embeddings are not uploaded to storage or the registry; Google still receives the input image for search. Use only the scoped consenting public content. Encrypt sensitive records and design appropriate consent/access/retention controls before any broader deployment.
7. **Demo scope:** this is a single-operator consenting-content demonstration, not an unrestricted face-search service. Candidate URL filtering is not proof that the page is publicly viewable; the human checks that. A CLI consent attestation is not a complete abuse-control system.
8. **Operations:** public RPCs/indexers can be slow or unavailable, finality takes time, transactions cost testnet tokens, and proof availability may lag. The adapter accepts records up to 1 MiB and rejects unexpected fragmented roots. The SDK download streams to a temporary file before the final size check; do not use it as a public untrusted-root download service.
9. **Recovery:** runs and transaction hashes are preserved, but there is no automatic rebroadcast/resume or distributed job queue. Local `output/run_result.json` is a convenience for one operator; concurrent runs should use different `--output` directories. Registry duplicates are possible after an uninformed manual retry.
10. **Development dependencies:** the pinned Hardhat 2 toolchain has npm audit advisories, including high-severity transitive findings. Runtime-only audit currently reports zero findings. This is a tested demo build, not a claim of a security-audited production deployment; see `docs/VALIDATION.md` for counts and scope.

## Project structure

```text
py/                       face encoding, live search, comparison, canonical record,
                          orchestration, preflight, independent verifier
storage-service/src/      0G upload/download/root adapter
contracts/contracts/      append-only VerificationRegistry.sol
contracts/scripts/        deploy, write, read, recover ID by transaction
contracts/test/           actual local EVM contract tests
scripts/                  shared TypeScript runtime and preflight
db/schema.sql             local history schema
tests/                    Python regression, real SDK Merkle, model smoke checks
docs/                     acceptance map, validation results, recording walkthrough
demo/                     ignored consenting-subject input photos
output/                   ignored per-run evidence and deployment information
recordings/               ignored actual recording files
```

## Compatibility choices

The supplied architecture's Solidity `0.8.20` plus Cancun example is not compilable. This project pins Solidity **0.8.26** with Cancun and Hardhat **2.29.1** using the compatible Hardhat 2 ethers plugin and configuration syntax. The compiler comes from pinned local `solc`, so compilation does not need a compiler download. The public network ID is still Galileo `16602`.

The architecture's old `@0gfoundation/0g-ts-sdk` npm package is deprecated in favor of **`@0gfoundation/0g-storage-ts-sdk`**, pinned here at **1.2.12**, as linked from the [official 0G SDK listing](https://build.0g.ai/sdks) and [SDK repository](https://github.com/0gfoundation/0g-ts-sdk). The adapter checks the actual typed return value, verifies the returned root against local computation, and refuses multi-root results rather than silently taking the first fragment. Explicit npm overrides update the SDK's transitive Axios dependency and share ethers 6.17.0; the lockfile, local tests, and a read-only SDK request to the live indexer cover those choices. Development-toolchain audit findings remain documented above.

For the submission recording and judge-facing explanation, follow [docs/DEMO.md](docs/DEMO.md).
