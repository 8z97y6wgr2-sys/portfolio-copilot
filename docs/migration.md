# Portfolio Copilot migration

## Source and destination

Source: `8z97y6wgr2-sys/project-invest`, commit `7dbb2403a7290df75392e830c7d4cd6a2ebc16f7`, directory `ea-inversion/`.

Destination: `8z97y6wgr2-sys/portfolio-copilot`, with the project at the repository root. This is a source snapshot migration; the original commit history remains in the legacy repository and is not presented as new authored implementation work.

## File coverage

All **40 application files** are accounted for in [migration-manifest.json](migration-manifest.json). Git blob SHA-1 values record the source and prepared destination bytes for every file. **31 files remain byte-identical**, including all backend application code, existing backend tests, both environment examples and both screenshots. Nine files change only for paths, project metadata, ignored artifacts or an archive notice.

| Source location | Destination / change |
| --- | --- |
| `apps/web/` | `frontend/` |
| `backend/tests/` | `tests/backend/` |
| Original project `README.md` | `docs/archive/readme-0.2.0.es.md`, with an archive notice |
| `docs/ENTREGA.md` | `docs/archive/delivery-2026-09-21.es.md`, with an archive notice |
| `docs/captura-escritorio.png` | `docs/screenshots/dashboard-desktop.png`, unchanged image bytes |
| `docs/captura-movil.png` | `docs/screenshots/dashboard-mobile.png`, unchanged image bytes |
| `scripts/dev.py` and `scripts/browser-smoke.mjs` | Frontend path updated |
| `frontend/package.json` | Package name and relative browser-test command updated |
| `frontend/package-lock.json` | Package name updated; dependency versions preserved |
| `pytest.ini` | Test directory updated |
| `.github/workflows/ci.yml` | Workflow name and frontend paths updated; checks retained |
| `.gitignore` | Environment, database, build/cache and OS metadata exclusions strengthened |

New English documentation includes the root README, methodology, migration manifest and current verification record. Archived Spanish documents retain their original content after the notice; their earlier test claims are historical source material, not new validation evidence.

## Legacy preservation

The original repositories are retained. Before replacing legacy root READMEs, the destination main branch must be re-read and all prepared file hashes compared to GitHub's stored blobs. The original application folder remains in `project-invest`; only unnecessary root `.DS_Store` metadata is eligible for removal. `copilot-investments-` and `ea-inversion` contained only title READMEs and are legacy pointers, not additional application implementations.

## Sensitive-file inspection

All source text files and paths were inspected for real environment files, private keys, common token patterns, credential-bearing URLs and credential literals. No real credentials were detected. The `.env.example` provider key is blank; the credential-like strings in tests are explicitly disposable fixtures. No database, session data, installed dependencies or real `.env` file is copied into this repository. This inspection is a recorded check, not a guarantee against every possible secret pattern.
