# Observed validation — 2026-09-06

Environment: macOS ARM64, Python 3.12.11 in the local `.venv`, Node 24.18.0, npm 11.16.0. These are executed local checks, not a claim of live pipeline completion.

| Check | Observed result |
| --- | --- |
| Python dependency install | Completed; direct requirements and resolved lockfile included |
| `python -m pip check` | No broken requirements |
| Clean `npm ci` | Completed from the root workspace lockfile |
| `npm run typecheck` | Passed |
| `npm run compile` | Solidity 0.8.26 compiled successfully for Cancun |
| Hardhat contract tests | 2 passed on the real local EVM |
| TypeScript SDK/runtime tests | 3 passed; actual 0G Merkle calculation and wrong-chain rejection |
| Python regression tests | 13 passed; synthetic provider/model/transaction responses isolated to tests |
| `python py/preflight.py --local --warm-model` | Passed; real Facenet512 weights downloaded and model loaded |
| `python tests/model_smoke.py` | Passed; real 512-dimensional inference, cosine verification, and production no-face rejection |
| Live public RPC read | `eth_chainId` returned `0x40da` = 16602 |
| Live public indexer read | Returned 6 trusted storage nodes; also checked using the installed SDK |
| Cross-directory Node command | Storage root computation works when invoked from outside the repository |
| Python-to-Node boundary | Single JSON result parsed successfully; a forced timeout stops the child process group |
| Runtime npm audit | `npm audit --omit=dev`: 0 findings |
| Full npm audit | 19 findings: 11 low, 2 moderate, 6 high, all in development dependency paths |
| Live authenticated preflight | Stopped with “Your default credentials were not found” |
| Scrape-fallback probe (Bing kblob upload, 2026-09-06) | Upload accepted (HTTP 200, signed token from homepage, visual best-guess ran server-side), but the only redirect target is a keyword web search — no per-image match evidence; detail view 302-redirects home without an image id. Keyword results are not image-match evidence, so no scrape provider was added. |
| Scrape-fallback probe (Lens uploadbyurl, 2026-09-06) | Session issued (vsrid), but results sit behind a JS-redirect interstitial requiring a browser engine; by-URL flow would also require publishing the raw face publicly. Not pursued. |

The development advisories come through the pinned Hardhat 2 stack (including its archive, HTTP, serialization, temporary-file, and older cryptography dependencies). The compiler is loaded from pinned local `solc`; no remote compiler archive was used. The required live adapters use the patched runtime dependency graph. Do not interpret the runtime audit result as a full security assessment. Review or migrate the development toolchain before a production deployment.

## Still requires the user's live inputs

- A clear photo belonging to the developer or a consenting teammate, with a matching indexed public social post.
- Google Cloud Vision API access, billing, and locally configured ADC/service-account credentials.
- A funded Galileo-only wallet key configured locally, followed by registry deployment.
- A live returned social candidate, operator confirmation, storage upload/proof, mined commitment, and independent read-back.
- The actual unedited terminal/browser screen recording from that run.

No real matching social-media result, Galileo deployment, storage upload, or verification transaction was performed with fabricated credentials or test data. The local EVM and synthetic tests do not satisfy those live acceptance items. Follow `DEMO.md` and update `ACCEPTANCE.md` once the genuine recorded run succeeds.
