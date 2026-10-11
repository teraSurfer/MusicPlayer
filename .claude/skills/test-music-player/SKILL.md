---
name: test-music-player
description: Test and verify the Music Player app (FastAPI backend, React frontend, Playwright end-to-end). Use when asked to test, verify, check, or validate the app or a change to it, to run the test suites, to confirm a bug is fixed, or before finishing any code change in this repository.
---

# Test the Music Player

Run the right checks for what changed, report the result faithfully, and diagnose failures using this project's known pitfalls.

## 1. Decide the scope

Look at what changed before running anything (`git status --short` and `git diff --stat`).

| Changed | Run |
|---|---|
| Only `backend/` | `backend` |
| Only `frontend/src` (logic or components) | `frontend` |
| API contract (schemas, routes), or both sides | `backend` + `frontend` + `e2e` |
| Anything about playback, upload, drag-and-drop, routing, or layout | include `e2e` |
| Docs only | nothing; say so |
| User asked to "test the app" with no detail | `all` |

When unsure, run `all`. Never claim a suite passed that you did not run; list anything skipped as **NOT RUN**.

## 2. Run the checks

One command runs everything and prints a summary (works on macOS and Windows; standard library only):

```bash
python .claude/skills/test-music-player/scripts/run_checks.py all          # everything
python .claude/skills/test-music-player/scripts/run_checks.py backend      # lint, types, pytest
python .claude/skills/test-music-player/scripts/run_checks.py frontend     # types, lint, vitest, build
python .claude/skills/test-music-player/scripts/run_checks.py e2e          # Playwright, about 40 s
python .claude/skills/test-music-player/scripts/run_checks.py all --skip-e2e
```

On Windows use `py` or `python` as installed. The script exits non-zero if any step fails and prints the last lines of each failing step.

Run the underlying commands directly when you need more detail:

| Suite | Commands (from the folder) |
|---|---|
| `backend/` | `uv run ruff check .` · `uv run mypy` · `uv run pytest -q` (add `-k name` or a path to narrow) |
| `frontend/` | `pnpm typecheck` · `pnpm lint` · `pnpm test` (add a file path to narrow) · `pnpm build` |
| `e2e/` | `pnpm test` (add `tests/music-player.spec.ts -g "E-05"` to narrow; `pnpm test:headed` to watch) |

## 3. Preflight problems (fix before blaming the code)

| Symptom | Cause and fix |
|---|---|
| Vitest: "Failed to start forks worker" | Node is below 22.13. `nvm use 22`. The script tries to find an nvm Node 22 itself. |
| `uv` warns `VIRTUAL_ENV ... does not match` | Another project's venv is active. Ignore, or unset it. The script removes it for you. |
| E2E: port 8100 or 5273 in use | A previous run did not exit. Stop that process. |
| E2E: `Executable doesn't exist` | Run `pnpm exec playwright install chromium` in `e2e/` once. |
| Frontend: `node_modules` missing | `pnpm install` in the folder. |
| Frontend tests can't reach the API | They never should: the tests use an in-memory fake API (MSW). A real request means a handler is missing in `frontend/src/test/fakeBackend.ts`. |

## 4. Diagnose failures

Read the failing output first; do not change a test just to make it pass. Decide whether the **test** or the **code** is wrong.

Patterns seen in this project:

- **Order assumptions.** The Library lists newest first. A test that expects upload order fails for the wrong reason.
- **Duplicate text.** Toasts, headings and the player bar repeat words ("Play", "2 songs"). Use exact matches, roles with specific names, or `.last()`.
- **Passing for the wrong reason.** A test that only checks a filename appeared can pass while the upload failed. Assert the outcome (status text, a row, a stored record).
- **Base UI menus in jsdom.** A click straight after a menu opens is ignored; activate the item with the keyboard (focus it, press Enter).
- **Accessible-name clashes.** The player bar owns "Play", "Next", "Previous". Feature buttons need specific names ("Play playlist").
- **Toast animations in the axe scan.** Wait for `[data-sonner-toast]` to disappear before scanning.
- **SQLite and NULL.** `UNIQUE(owner_id, ...)` does not stop duplicates when `owner_id` is NULL.
- **Upload failures in the browser tests.** jsdom XHR uploads need the test page to share the API's origin (set in `frontend/vite.config.ts`).

If a failure is flaky, re-run only that test three times and report the pass rate. Do not add retries or sleeps to hide it.

## 5. Manual smoke test (when the request is "run the app")

Only when asked to run or demo the app, or when browser behaviour cannot be covered by tests:

```bash
# terminal 1
cd backend && uv run alembic upgrade head && uv run uvicorn app.main:app --port 8000
# terminal 2 (Node 22)
cd frontend && pnpm dev
```

Then verify, and report each as seen or not seen:

1. `GET http://localhost:8000/api/v1/health` returns `{"status":"ok"}`, and so does `http://localhost:5173/api/v1/health` (the proxy).
2. Upload a small audio file through `POST /api/v1/songs/upload` or the UI; it appears in Library and Pool.
3. `GET /api/v1/songs/{id}/stream` with `Range: bytes=0-99` returns `206` and 100 bytes.
4. In the browser: play a song, seek, create a playlist, add a song, play the playlist.

State clearly that API checks are not the same as clicking through a browser. Stop any server you started unless the user wants it left running.

## 6. Report

Finish with a short, factual summary:

```
Scope: <what changed and why these suites>
Backend:  171 passed, ruff clean, mypy clean
Frontend: 116 passed, types/lint/build clean
E2E:      12 passed
NOT RUN:  <anything skipped, and why>
Failures: <name, cause, whether test or code was wrong, what you changed>
```

Use real numbers from the output. If anything failed or was skipped, say so first, not last.

## Reference

- Requirements and test-case IDs: `docs/PRD.md` (section 9) and `docs/REQUIREMENTS-STATUS.md`
- How to run each part on macOS and Windows: `Agents.md`
- Known gaps (no CORS, OpenAPI-snapshot, 10k-song performance tests): `docs/REQUIREMENTS-STATUS.md`
