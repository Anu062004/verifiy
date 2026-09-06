# Unedited end-to-end recording

This deliverable must show a real run with your own or a consenting teammate's public content. Offline tests are not a substitute. No recording is included until the live inputs and credentials are configured and the run is performed.

## Prepare before starting the recording

1. Install dependencies, activate `.venv`, and run the local tests in the README.
2. Configure Google Cloud Vision credentials, enable billing/API access, fund the Galileo testnet wallet, deploy the registry, and save its address in `.env`.
3. Put the consenting subject's image at `demo/me.jpg`. Check that the intended post is public in a logged-out browser and old enough to be indexed. Do not put its URL in source or fixtures.
4. Run `python py/preflight.py --warm-model` and `python py/orchestrator.py demo/me.jpg --consent --search-only` to establish actual provider coverage.
5. Close credential files and unrelated windows; keep one terminal, the input image, and the browser visible. Each recorded run gets a new output directory, so old evidence need not be deleted.
6. On macOS press **Shift–Command–5**, choose full-screen or a region that includes the terminal and browser, and start recording. If macOS requests Screen Recording permission, enable it yourself. Keep the complete recording, including confirmation and network waits, without edits.

## Record continuously

Show the input photo in Preview, then show its exact hash:

```bash
source .venv/bin/activate
ls -lh demo/me.jpg
shasum -a 256 demo/me.jpg
python py/orchestrator.py demo/me.jpg --consent
```

Show stages 1–3: face encoding, the live provider call, the number of returned results, the actual returned page URL, and model distance/threshold or the explicit unavailable status. Open the returned candidate page in your browser **before confirming**, showing that it contains the subject's photo. Return to the terminal and answer the candidate confirmation and final publication confirmation yourself.

Show stages 4–8: canonical record creation, storage root, proof-checked download, transaction hash/explorer URL, SQLite indexing, independent read-back, and the final `complete` status. Do not hide provider errors or replace a failed output with a saved successful run.

Open the printed explorer transaction URL and show it is mined. Display the record and recomputed commitments:

```bash
python -m json.tool output/run_result.json
python py/verify_record.py demo/me.jpg
```

Use the `chain.recordId` printed in the result for the separate contract read:

```bash
npm run chain:read -- ACTUAL_RECORD_ID
sqlite3 -header -column db/records.db 'SELECT run_id, face_status, chain_record_id, readback_verified FROM records;'
```

The verifier output must show successful photo and URL comparisons, proof verification, identical local/remote record bytes, and the on-chain submitter/timestamp. Stop the system recording and save the actual video under `recordings/`. Keep its original unedited file. A terminal text transcript alone does not satisfy the screen-recording requirement.

## If a fallback is necessary

Start the run with `--manual-fallback`. Keep the API's empty/unusable results visible. In the same recording, perform a real Lens/Yandex search in the browser with the same image, show its returned URL, and enter it into the explicit manual gate. Show that the resulting record names `manual_reverse_image_search`; never describe it as an API-discovered result. If the subject's post cannot be found, do not claim the social-result acceptance item is complete.

## Judge-facing explanation

“We encode one consenting subject's face locally, then send the photo to Google Web Detection for a real reverse-image search. Returned public pages are candidates; we independently compare the candidate face where the image can be downloaded. A human inspects and confirms the result. We store the canonical evidence on 0G Storage and put its Merkle root plus photo and URL commitments into a Galileo contract. Read-back checks prove the committed record and original inputs have not changed. They do not prove account ownership or that the search provider was truthful.”

## Final submission artifacts

- Source repository with README, pinned lockfiles, and passing checks.
- The actual unedited recording, shared by your chosen upload/submission channel.
- The live contract address, transaction hash, record ID, storage root, and matching public page from that recorded run.
- The explicit limitations and acceptance status. Exclude `.env`, credential JSON, private keys, local photo files, and raw embeddings from Git.
