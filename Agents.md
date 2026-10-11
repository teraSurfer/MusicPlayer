# Agents.md

A guide for humans and coding agents working in this repository: how the code base fits together, and how to run every part on **macOS** and **Windows**.

> **Verification note:** everything here was run and tested on macOS. The Windows commands follow the same tools (Node, pnpm, uv) and were adjusted for PowerShell, but were **not run on a Windows machine**. If one fails, treat it as a bug in this file and fix it.

---

## 1. What this is

A local music player. Users upload songs (or pick from the shared pool) into a collection, play them with full controls, and organise them into playlists.

| Part | Folder | Stack |
|---|---|---|
| Frontend | `frontend/` | React 19, TypeScript (strict), Vite, Tailwind 4, shadcn/ui, TanStack Query, Zustand |
| Backend | `backend/` | Python 3.13+, FastAPI, SQLAlchemy 2, Alembic, SQLite, mutagen |
| End-to-end tests | `e2e/` | Playwright (Chromium), axe-core |
| Docs | `docs/` | PRD, requirement status, trainer questions |

Related reading: [docs/PRD.md](docs/PRD.md) (requirements and test plan), [docs/REQUIREMENTS-STATUS.md](docs/REQUIREMENTS-STATUS.md) (what is built vs. planned), [Prompts.md](Prompts.md) (how it was built, step by step).

---

## 2. Prerequisites

| Tool | Version | macOS | Windows (PowerShell) |
|---|---|---|---|
| Node.js | 22.13 or newer (see `frontend/.nvmrc`) | `brew install nvm`, then `nvm install 22` | `winget install CoreyButler.NVMforWindows`, then `nvm install 22` and `nvm use 22` |
| pnpm | 8 or newer | `npm install -g pnpm` | `npm install -g pnpm` |
| Python | 3.13 or newer | `brew install python@3.13` | `winget install Python.Python.3.13` |
| uv | recent | `brew install uv` | `winget install --id astral-sh.uv` |
| ffmpeg | only to regenerate audio test fixtures | `brew install ffmpeg` | `winget install Gyan.FFmpeg` |

Node 20 does **not** work: the current Vitest and jsdom need Node 22.

---

## 3. How it works

```
Browser ──HTTP/JSON, audio stream──▶ FastAPI ──▶ SQLite (metadata)
 React app      /api/v1/...                  └──▶ local folder (audio and cover files)
```

### Backend layering (`backend/app/`)

Requests flow in one direction. A layer may only call the layer below it, and a test enforces parts of this (`tests/unit/architecture`).

```
api/v1/        HTTP only: routers, status codes, request and response shapes
  ↓
services/      business rules; no FastAPI imports; raises domain errors
  ↓
repositories/  all SQL; one class per aggregate
storage/       StorageBackend protocol + LocalFileStorage (files addressed by opaque keys)
db/            engine, session, ORM models (songs, collection_items, playlists, playlist_songs)
core/          config (MUSIC_* env vars), error envelope, logging, request IDs, dependencies
```

Key design points:

- **Cloud-ready seams.** Files are referenced by `storage_key`, never by path, behind a `StorageBackend` interface. The DB is configured by `MUSIC_DATABASE_URL`. Auth is one dependency (`core/current_user.py`) that returns a fixed local user today.
- **Pool vs. collection.** The *pool* is every uploaded song. A user's *collection* is the subset they added. Playlists may only contain collection songs; removing a song from the collection also removes it from playlists.
- **Uploads** stream to storage while hashing (SHA-256), reject non-audio by parsing it with mutagen, reuse an existing song when the hash matches, and clean up files if the database write fails.
- **Streaming** supports HTTP `Range` (`api/ranges.py`) so seeking works.
- **Errors** always use `{ "error": { "code", "message", "details" } }`.
- **Migrations** are Alembic, with SQLite batch mode and named constraints.

### Frontend layout (`frontend/src/`)

```
app/                 App routes, layout (sidebar + player bar), providers
features/
  library/           collection and pool pages, upload, edit dialog, API hooks
  playlists/         list and detail pages, drag-to-reorder, add-to-playlist menu
  player/            queue.ts (pure rules) · store.ts (state) · htmlAudioEngine.ts (browser audio)
                     PlayerBar, keyboard shortcuts, Media Session
shared/              API client (zod-validated), query keys, formatting, hooks
components/ui/       shadcn/ui components (generated; edit sparingly)
test/                MSW fake backend, fake audio engine, render helpers
```

Key design points:

- **The player is three separate layers.** `queue.ts` holds pure next/previous/shuffle rules, `store.ts` holds state and depends only on a `PlayerEngine` interface, and `htmlAudioEngine.ts` wraps the real `<audio>`. Tests swap in a fake engine.
- **Server state** lives in TanStack Query; **player state** in Zustand.
- **API base URL:** empty by default (same origin, using the Vite dev proxy to port 8000). Set `VITE_API_BASE_URL` for a separate API origin.
- **Queue source.** The player remembers where its queue came from (e.g. `playlist:<id>`), so the owning page can keep it in sync.

### Ports

| Service | Port | Used by |
|---|---|---|
| Backend (dev) | 8000 | `uvicorn` |
| Frontend (dev) | 5173 | `vite` (proxies `/api` to 8000) |
| Backend (E2E) | 8100 | Playwright |
| Frontend (E2E) | 5273 | Playwright |

---

## 4. Run the backend

### macOS / Linux
```bash
cd backend
uv sync                                   # create .venv and install dependencies
uv run alembic upgrade head               # create the SQLite database (data/musicplayer.db)
uv run uvicorn app.main:app --reload --port 8000
```

### Windows (PowerShell)
```powershell
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --port 8000
```

Check it: open <http://localhost:8000/api/v1/health> (expect `{"status":"ok"}`) or the interactive docs at <http://localhost:8000/docs>.

If `uv` warns that `VIRTUAL_ENV` does not match, another project's virtual environment is active. Deactivate it, or on macOS prefix commands with `env -u VIRTUAL_ENV`. On Windows run `deactivate` first, or `Remove-Item Env:VIRTUAL_ENV`.

### Configuration

All settings are environment variables with the `MUSIC_` prefix (a `backend/.env` file also works).

| Variable | Default | Meaning |
|---|---|---|
| `MUSIC_DATABASE_URL` | `sqlite:///./data/musicplayer.db` | Database |
| `MUSIC_STORAGE_DIR` | `./data/songs` | Where audio and covers are stored |
| `MUSIC_CORS_ORIGINS` | `["http://localhost:5173"]` | Allowed browser origins (JSON list) |
| `MUSIC_MAX_UPLOAD_BYTES` | `104857600` (100 MB) | Per-file upload limit |
| `MUSIC_APP_ENV` | `local` | `test` enables `POST /api/v1/test/reset`; never set it in production |

Set one for a single run:

```bash
# macOS / Linux
MUSIC_STORAGE_DIR=/tmp/songs uv run uvicorn app.main:app --reload
```
```powershell
# Windows (PowerShell)
$env:MUSIC_STORAGE_DIR = "C:\temp\songs"; uv run uvicorn app.main:app --reload
```

### Backend tests and checks
```bash
cd backend
uv run pytest                          # 171 tests
uv run pytest --cov=app                # with coverage
uv run ruff check . && uv run ruff format --check .
uv run mypy
```
The same commands work in PowerShell. Tests use a temporary database and storage folder per test and generate no files in `data/`.

### Database changes
```bash
uv run alembic revision --autogenerate -m "describe the change"   # then review the file
uv run alembic upgrade head
```
Add new models to `app/db/models.py` and always check the generated migration by hand.

---

## 5. Run the frontend

### macOS / Linux
```bash
cd frontend
nvm use                                   # reads .nvmrc (Node 22)
pnpm install
pnpm dev                                  # http://localhost:5173
```

### Windows (PowerShell)
```powershell
cd frontend
nvm use 22
pnpm install
pnpm dev
```

The backend must be running on port 8000 for the app to show data.

### Frontend tests and checks
```bash
cd frontend
pnpm test            # 116 tests (Vitest, Testing Library, MSW)
pnpm test:watch      # re-run on change
pnpm typecheck
pnpm lint
pnpm build           # production build into dist/
```
These are identical on Windows. Component tests use an in-memory fake API (`src/test/fakeBackend.ts`), so they do not need the backend.

### Adding a shadcn component
```bash
pnpm dlx shadcn@latest add <component>
```

---

## 6. Run the end-to-end tests

Playwright starts its own backend (port 8100) and frontend (port 5273) with a throwaway database in `e2e/.data/`, so it does not touch your dev data and does not need your dev servers.

### First time (macOS and Windows)
```bash
cd e2e
pnpm install
pnpm exec playwright install chromium
```

### Run
```bash
pnpm test                 # headless, 12 tests, about 40 seconds
pnpm test:headed          # watch the browser
pnpm exec playwright test --ui    # interactive runner
```

After a failure, traces and screenshots are in `e2e/test-results/`; open a trace with `pnpm exec playwright show-trace <path>/trace.zip`.

Both the backend and the frontend dev ports (8100 and 5273) must be free. The E2E tests use `POST /api/v1/test/reset`, which only exists when `MUSIC_APP_ENV=test` (Playwright sets this itself).

---

## 7. Working in this repository

### Conventions
- **Plan first.** Behaviour is specified in [docs/PRD.md](docs/PRD.md) with numbered requirements (`UC1-4`) and test cases (`B-UP-11`). Reference those IDs in tests and commit messages.
- **Test first for logic.** New rules go in pure functions or services with unit tests; HTTP behaviour gets an integration test; user journeys get an E2E test.
- **Keep layers honest.** No SQL in routers, no FastAPI in services, no `fetch` in components (use the hooks in each feature's `queries.ts`).
- **Validate at the boundary.** Request bodies use Pydantic; API responses are parsed with zod on the frontend.
- **Accessible names are unique.** The player bar already owns "Play", "Next", "Previous", so feature buttons use specific names such as "Play playlist".

### Before finishing a change
```bash
# backend
cd backend && uv run ruff check . && uv run mypy && uv run pytest
# frontend
cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build
# end-to-end (when behaviour in the browser changed)
cd e2e && pnpm test
```

### Common tasks
| Task | Where |
|---|---|
| Add an API endpoint | schema in `backend/app/schemas/`, logic in `services/`, SQL in `repositories/`, route in `api/v1/`, mount in `api/v1/router.py`; add an integration test |
| Change the database | edit `db/models.py`, generate and review an Alembic migration, update `tests/unit/db` |
| Use a different file store | implement the `StorageBackend` protocol in `backend/app/storage/`, switch it in `core/deps.py` (`get_storage`) |
| Add a page | component in `frontend/src/features/<area>/`, route in `app/App.tsx`, link in `app/AppLayout.tsx`; extend `src/test/fakeBackend.ts` for new endpoints |
| Change playback rules | `features/player/queue.ts` (pure) first, then `store.ts`; tests in `queue.test.ts` and `store.test.ts` |
| Regenerate audio fixtures | needs ffmpeg; see `backend/tests/fixtures/audio/` and `e2e/fixtures/` (short sine-wave files) |

### Known limitations
See [docs/REQUIREMENTS-STATUS.md](docs/REQUIREMENTS-STATUS.md). The main ones: bitrate is not stored, upload progress is per batch, add-to-playlist is one song at a time in the UI, and Media Session has only been tested with a fake.

### Troubleshooting
| Symptom | Likely cause and fix |
|---|---|
| `pnpm test` fails with "Failed to start forks worker" | Node is older than 22.13. Run `nvm use 22`. |
| Frontend shows errors loading data | Backend is not running on port 8000, or CORS origin does not match (`MUSIC_CORS_ORIGINS`). |
| Upload rejected with "unsupported" | Only mp3, wav, flac, ogg and m4a are accepted, and the content must really be audio. |
| M4A will not play in E2E | Chromium builds used by Playwright lack AAC; the E2E fixtures are MP3 for that reason. |
| `alembic` says the database is not up to date | Run `uv run alembic upgrade head`. |
| Port already in use | Stop the other process, or pass `--port` to uvicorn and `--port` to vite (and update the proxy with `VITE_PROXY_TARGET`). |
| Symlink test skipped on Windows | Expected without Developer Mode; it is skipped, not failed. |
