# Migration validation

Recorded on 2026-10-02 for the prepared migration of source commit `7dbb2403a7290df75392e830c7d4cd6a2ebc16f7`.

## Executed locally

| Check | Observed result |
| --- | --- |
| Source download integrity | All 40 files matched GitHub's source blob hashes and sizes |
| Source-to-destination mapping | 40/40 accounted for; 31 byte-identical and nine documented layout/documentation changes |
| Backend dependency installation | Original pinned requirements installed successfully |
| `python -m pytest -q` | 31 passed; 35 subtests passed; two dependency deprecation warnings |
| `npm ci --prefix frontend` | Original locked dependency versions installed successfully |
| `npm --prefix frontend run typecheck` | Passed |
| `npm --prefix frontend run build` | Passed; Next.js production output generated |
| `npm --prefix frontend run test:e2e` | Passed with the existing Playwright smoke test and a supplied Chromium executable |

The backend tests cover financial calculations, input validation, authentication, ownership, persistence and controlled market-provider responses. The browser smoke test reported successful registration, sessions, demo exploration, period/risk views, saving/reloading, portfolios, holdings, CSV import, editing, provider-error preservation, export, mobile layout, deletion, logout and the CSV laboratory. It used disposable synthetic data and a temporary SQLite database.

## Runtime and browser limitation

Validation used Python 3.12.14, Node.js 24.19.0, the project's pinned Playwright 1.62.1 and Chromium 153.0.8010.0. The default Playwright browser download failed in this environment. A temporary `@sparticuz/chromium` 153.0.0 package supplied a Chromium executable; its binary was extracted without archive ownership changes because this filesystem rejected those operations. The successful run used the smoke script's existing `CHROMIUM_MODULE` and `CHROMIUM_EXECUTABLE` options and `PYTHON_BIN` pointing to the installed validation environment.

The temporary browser package is not an application dependency and is not committed. The default Playwright-installed browser and Node.js 22 were not tested locally. They were subsequently exercised successfully by the remote GitHub Actions job using the committed workflow. Backend warnings concern Starlette's httpx integration and an AnyIO alias; they did not cause test failures.

## Checks not established by these results

- A live Twelve Data account, real quota or entitlement behavior was not tested.
- A real PostgreSQL server was not tested.
- Production deployment, multi-process rate limiting and operational security were not validated.
- No expected-return forecast, optimization study or trading backtest was executed.


## Remote publication verification

GitHub's `main` ref matched migration commit `83065f63f2b1b2bf5897aad0276e72ae4ff346bc`. All 45 remote files matched the prepared blob hashes, with no missing or unexpected files and an untruncated tree response. All 40 original application files remained unchanged in `project-invest/ea-inversion/` after the legacy notices were committed. The pre-migration commit is retained on `legacy/portfolio-copilot-source`.

GitHub confirmed [workflow run 37078515559](https://github.com/8z97y6wgr2-sys/portfolio-copilot/actions/runs/37078515559) completed successfully for the migration commit. The `verify` job and its backend tests, TypeScript check, production build, default Chromium installation and browser smoke step all reported success. This document-only follow-up records those observed results; it does not create a new application validation run.
