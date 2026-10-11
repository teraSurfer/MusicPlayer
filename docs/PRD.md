# Music Player — Product Requirements Document

| | |
|---|---|
| **Status** | Draft v1 |
| **Date** | 2026-10-11 |
| **Scope** | Local-only today; architected so cloud deployment is a configuration/adapter change, not a rewrite |

---

## 1. Overview

A web-based music player. Users build a personal **collection** of songs (by uploading files or picking from the shared **pool**), play them with full transport controls, and organize them into **playlists**.

The app runs entirely on the user's machine today (React frontend, FastAPI backend, SQLite, local filesystem). Nothing in the design may assume "local" in a way that blocks a later move to cloud (object storage, managed DB, auth, containers).

### 1.1 Goals
- Deliver the five use cases in §3 end to end.
- Modular codebase with clear seams (storage, database, API client, player engine) so each can be swapped or tested independently.
- High confidence via a layered automated test suite (unit, integration, E2E).

### 1.2 Non-goals (this release)
- Authentication, multiple users, sharing, social features.
- Any cloud service or deployment.
- Streaming from third-party catalogs (Spotify etc.), lyrics, recommendations, equalizer, transcoding.
- Mobile-native apps (the UI must be responsive, but is web only).

### 1.3 Decisions already made
| Topic | Decision |
|---|---|
| Users | Single user, no auth. Schema carries a nullable `owner_id` on user-scoped tables so multi-user can be added without a destructive migration. |
| Pool | The pool is **every song file uploaded to the system**. A user's *collection* is the subset they have added to it. |
| Audio | MP3, WAV, FLAC, OGG, M4A. Tags (title/artist/album/duration/cover art) auto-extracted on upload and editable. |
| PRD location | This file, `docs/PRD.md`. |

### 1.4 Assumptions (flag if wrong)
1. **Uploading a song also adds it to the collection.** Uploads are the primary way songs enter the pool.
2. **Duplicate detection** is by SHA-256 of file content. Uploading an existing file does not create a second copy; it reuses the pool song and adds it to the collection.
3. **Playlists may contain only songs in the collection.** Removing a song from the collection removes it from all playlists. The file stays in the pool.
4. **A song appears at most once per playlist.**
5. **Deleting a song from the pool entirely** (file + row) is out of scope for v1. "Remove" always means remove from collection.
6. **Max upload size** 100 MB per file, configurable.
7. **Uploader is recorded once.** `songs.uploaded_by` is set to the uploading user on first upload and never changed. A duplicate upload by someone else does not overwrite it. With no auth today it is set to a fixed local user ID (the same value `get_current_user` returns), so it is populated but not yet a foreign key to a users table.

---

## 2. Users & Personas

**Listener (single local user).** Has a folder of music files, wants to import them, play them without friction, and group them into playlists.

---

## 3. Use Cases & Functional Requirements

### UC1 — Add songs to the collection
| ID | Requirement |
|---|---|
| UC1-1 | User can upload one or more audio files via file picker or drag-and-drop. |
| UC1-2 | Backend validates extension **and** content (magic bytes via mutagen parse), size limit, and rejects non-audio. |
| UC1-3 | Metadata (title, artist, album, duration, bitrate, cover art) is extracted. Title falls back to filename. |
| UC1-4 | Uploaded songs are stored in the pool and added to the collection. Duplicates (same hash) reuse the existing pool song. The uploading user is recorded as `uploaded_by` (first uploader wins). |
| UC1-5 | User can browse/search the pool (title, artist, album) and see which songs are already in their collection. |
| UC1-6 | User can add one or many pool songs to the collection. Adding an already-present song is a no-op, not an error. |
| UC1-7 | User sees per-file upload progress and per-file success/failure when uploading several files. |
| UC1-8 | User can edit a song's title/artist/album. |
| UC1-9 | User can remove a song from the collection (see assumption 3). |

### UC2 — Play a song with full controls
| ID | Requirement |
|---|---|
| UC2-1 | User can play any collection song. Audio streams from the backend with HTTP Range support (seeking works without full download). |
| UC2-2 | Controls: play/pause, next, previous, seek bar with elapsed/total time, volume, mute. |
| UC2-3 | Repeat modes: off → repeat-all → repeat-one (cycled). Shuffle toggle. |
| UC2-4 | Player bar persists across navigation. Shows title, artist, cover art. |
| UC2-5 | Previous: if >3 s elapsed restarts the song, otherwise goes to the previous track. |
| UC2-6 | Keyboard shortcuts: Space (play/pause), ←/→ (seek ±5 s), Shift+←/→ (prev/next), M (mute). Disabled while typing in inputs. |
| UC2-7 | Volume, repeat and shuffle settings persist across reloads (localStorage). |
| UC2-8 | Playback errors (missing file, unsupported codec) show a toast and skip to the next track rather than stalling. |
| UC2-9 | Media Session API integration (OS media keys / now-playing metadata). |

### UC3 — Create / delete playlists
| ID | Requirement |
|---|---|
| UC3-1 | User can create a playlist with a name (1–100 chars, trimmed) and optional description. |
| UC3-2 | Playlist names are unique (case-insensitive). Violation returns a clear validation error. |
| UC3-3 | User can rename/edit a playlist. |
| UC3-4 | User can delete a playlist after confirmation. Songs are untouched. |
| UC3-5 | Playlist list shows name, song count and total duration. |

### UC4 — Add / remove songs from a playlist
| ID | Requirement |
|---|---|
| UC4-1 | User can add one or many collection songs to a playlist (from song row menu or a picker). |
| UC4-2 | Adding a song already in the playlist is ignored and reported ("already in playlist"). |
| UC4-3 | User can remove a song from a playlist without affecting the collection. |
| UC4-4 | User can reorder songs in a playlist by drag-and-drop; order persists. |
| UC4-5 | Songs not in the collection cannot be added (400/409). |

### UC5 — Play a playlist
| ID | Requirement |
|---|---|
| UC5-1 | "Play" starts the playlist from the first song; clicking a song starts from that song with the rest of the playlist queued. |
| UC5-2 | All UC2 controls (repeat, shuffle, next/prev) operate within the playlist queue. |
| UC5-3 | Repeat-all loops back to first song at end; repeat-off stops after the last. |
| UC5-4 | Currently playing song is highlighted in the list. |
| UC5-5 | Empty playlist disables Play. |
| UC5-6 | If the queue's playlist is modified during playback, the queue updates without interrupting the current track. |

---

## 4. Non-Functional Requirements

| Area | Requirement |
|---|---|
| Performance | List endpoints paginated (default 50, max 200). Time-to-first-audio < 500 ms locally. Collection of 10k songs remains responsive. |
| Reliability | Upload is atomic: file write + DB insert succeed together or the file is cleaned up. Orphan detection script for storage vs DB. |
| Security | Filename sanitized; files stored under generated keys, never user paths (no path traversal). CORS restricted to configured origins. Size/type limits enforced server side. |
| Accessibility | WCAG 2.1 AA target: keyboard operable, ARIA labels on controls, visible focus, `aria-live` for track changes. |
| Observability | Structured JSON logs, request ID per request, `/health` endpoint. |
| Portability | All config via env vars (12-factor). Backend containerizable; no absolute paths in code. |
| Browser support | Latest Chrome, Firefox, Safari, Edge. |

---

## 5. Architecture

```
┌──────────────────────────┐        HTTP/JSON + audio stream        ┌─────────────────────────────┐
│ Frontend (React + Vite)  │ ─────────────────────────────────────▶ │ Backend (FastAPI)           │
│                          │                                        │                             │
│  features/ (library,     │                                        │  api/v1 (routers, schemas)  │
│   playlists, player,     │                                        │     │                       │
│   upload)                │                                        │  services/ (business logic) │
│  shared/ (api client,    │                                        │     │            │          │
│   ui, hooks)             │                                        │  repositories/  storage/    │
└──────────────────────────┘                                        │     │            │          │
                                                                    │  SQLite     LocalFileStorage│
                                                                    └─────────────────────────────┘
```

### 5.1 Cloud-readiness seams
Each seam is an interface with one local implementation today:

| Concern | Today | Cloud later | Seam |
|---|---|---|---|
| File storage | Local filesystem | S3 / GCS / Azure Blob | `StorageBackend` protocol (`save`, `open`, `stream(range)`, `delete`, `exists`, `url`). Songs referenced by opaque `storage_key`, never a path. |
| Database | SQLite | PostgreSQL | SQLAlchemy 2.x ORM + Alembic migrations, no SQLite-specific SQL, `DATABASE_URL` env var. |
| Audio delivery | Backend streams with Range | Pre-signed URLs / CDN | `StorageBackend.url()` can return a signed URL; frontend only consumes `stream_url` from the API. |
| Auth | None | OAuth/JWT | `get_current_user` FastAPI dependency returns a fixed local user today; `owner_id` and `uploaded_by` columns reserved. |
| Config | `.env` | Secret manager | `pydantic-settings` single `Settings` class. |
| API | `/api/v1` | Same, versioned | Versioned prefix from day one. |
| Background work | Inline | Queue/worker | Metadata extraction behind a `MetadataExtractor` service so it can move async. |

### 5.2 Tech stack
Use the latest stable release of each at scaffold time (`pnpm add <pkg>@latest`, `uv add <pkg>`), then pin via lockfiles. Run `pnpm outdated` / `uv lock --upgrade` as part of dependency upkeep.

**Frontend**
- React, TypeScript (strict), Vite
- Tailwind CSS + shadcn/ui (Radix primitives), lucide-react icons
- TanStack Query (server state), Zustand (player/queue state), React Router
- react-hook-form + zod (forms/validation), dnd-kit (reordering), sonner (toasts)
- pnpm; ESLint + Prettier

**Backend**
- Python (latest stable), FastAPI, Uvicorn, Pydantic v2, pydantic-settings
- SQLAlchemy 2.x + Alembic, SQLite
- mutagen (tags/duration/cover), python-multipart
- uv for dependency management; Ruff (lint+format), mypy

**Testing**
- Backend: pytest, pytest-asyncio, pytest-cov, httpx (`AsyncClient`/`TestClient`), factory-boy or hand-rolled factories, Hypothesis (validation/ordering properties)
- Frontend: Vitest, React Testing Library, user-event, MSW (API mocking), jest-dom
- E2E: Playwright

### 5.3 Repository layout
```
MusicPlayer/
├── docs/PRD.md
├── frontend/
│   └── src/
│       ├── app/               # providers, router, layout
│       ├── features/
│       │   ├── library/       # collection + pool browsing, upload
│       │   ├── playlists/
│       │   └── player/        # audio engine, store, controls
│       ├── shared/
│       │   ├── api/           # typed client, query keys, zod schemas
│       │   ├── components/ui/ # shadcn
│       │   └── hooks/
│       └── test/              # setup, MSW handlers, fixtures
├── backend/
│   ├── app/
│   │   ├── api/v1/            # routers: songs, collection, playlists, stream, health
│   │   ├── core/              # config, logging, errors, deps
│   │   ├── db/                # engine, session, base, models
│   │   ├── repositories/      # DB access, one per aggregate
│   │   ├── services/          # business logic (upload, collection, playlist)
│   │   ├── storage/           # StorageBackend protocol + LocalFileStorage
│   │   ├── schemas/           # Pydantic request/response models
│   │   └── main.py
│   ├── migrations/            # Alembic
│   └── tests/{unit,integration}/
├── e2e/                       # Playwright
└── README.md
```
Rule: routers → services → repositories/storage. Routers never touch the DB or filesystem directly; services never import FastAPI.

### 5.4 Frontend player design
The audio engine is a plain TypeScript class wrapping `HTMLAudioElement`, exposing events and commands. The Zustand store owns queue, index, repeat, shuffle, volume. React components only read the store and dispatch actions. This keeps playback logic (next/prev/repeat/shuffle) pure and unit-testable without a DOM audio implementation.

---

## 6. Data Model

```
songs
  id            UUID PK
  title         TEXT NOT NULL
  artist        TEXT
  album         TEXT
  duration_ms   INTEGER NOT NULL
  format        TEXT NOT NULL           -- mp3|wav|flac|ogg|m4a
  mime_type     TEXT NOT NULL
  size_bytes    INTEGER NOT NULL
  sha256        TEXT NOT NULL UNIQUE
  storage_key   TEXT NOT NULL
  cover_key     TEXT NULL
  uploaded_by   UUID NULL               -- user who first uploaded the file; reserved FK to users
  created_at    TIMESTAMP NOT NULL      -- upload time

collection_items
  id            UUID PK
  owner_id      UUID NULL               -- reserved for multi-user
  song_id       UUID FK songs.id
  added_at      TIMESTAMP NOT NULL
  UNIQUE (owner_id, song_id)

playlists
  id            UUID PK
  owner_id      UUID NULL
  name          TEXT NOT NULL           -- unique case-insensitive (per owner)
  description   TEXT NULL
  created_at / updated_at TIMESTAMP

playlist_songs
  playlist_id   UUID FK playlists.id ON DELETE CASCADE
  song_id       UUID FK songs.id
  position      INTEGER NOT NULL
  added_at      TIMESTAMP NOT NULL
  PRIMARY KEY (playlist_id, song_id)
  UNIQUE (playlist_id, position)
```
UUID primary keys (not autoincrement) so records can be created in any environment and merged/migrated safely.

---

## 7. API (v1)

Base: `/api/v1`. Errors use a single envelope: `{ "error": { "code": "...", "message": "...", "details": {...} } }`.

| Method | Path | Purpose | UC |
|---|---|---|---|
| GET | `/health` | Liveness | — |
| POST | `/songs/upload` | Multipart, one or many files. Returns per-file result (`created` / `existing` / `rejected` + reason). Adds to collection. | UC1 |
| GET | `/songs` | Pool. `q`, `limit`, `offset`, `sort`, optional `uploaded_by` filter; each item has `in_collection` and `uploaded_by`. | UC1 |
| GET | `/songs/{id}` | Song detail | UC1 |
| PATCH | `/songs/{id}` | Edit title/artist/album | UC1 |
| GET | `/songs/{id}/stream` | Audio with `Range` → 206. Sets `Accept-Ranges`, `Content-Type`. | UC2 |
| GET | `/songs/{id}/cover` | Cover art | UC2 |
| GET | `/collection` | Collection songs, `q`, paging, sort | UC1/2 |
| POST | `/collection` | `{ song_ids: [] }` add (idempotent) | UC1 |
| DELETE | `/collection/{song_id}` | Remove (cascades to playlists) | UC1 |
| GET | `/playlists` | List with `song_count`, `total_duration_ms` | UC3 |
| POST | `/playlists` | Create | UC3 |
| GET | `/playlists/{id}` | Detail incl. ordered songs | UC5 |
| PATCH | `/playlists/{id}` | Rename/describe | UC3 |
| DELETE | `/playlists/{id}` | Delete | UC3 |
| POST | `/playlists/{id}/songs` | `{ song_ids: [] }` append | UC4 |
| DELETE | `/playlists/{id}/songs/{song_id}` | Remove, compacts positions | UC4 |
| PUT | `/playlists/{id}/songs/order` | `{ song_ids: [] }` full reorder | UC4 |

Status codes: 201 create, 200 ok, 204 delete, 206 range, 400 invalid, 404 missing, 409 conflict (duplicate name), 413 too large, 415 unsupported type, 416 bad range, 422 schema validation.

---

## 8. UI Structure

- **Layout:** sidebar (Library, Pool, Playlists), main content, persistent bottom player bar.
- **Library:** collection table (cover, title, artist, album, duration), search, row actions (play, add to playlist, edit, remove), upload button + drop zone.
- **Pool:** browse/search all songs with "Add" / "In collection" state, multi-select add.
- **Playlists:** grid/list, create dialog, detail page with Play, reorder, remove.
- **Player bar:** cover + meta, transport, seek, volume, repeat, shuffle.
- shadcn components: Button, Dialog, AlertDialog, DropdownMenu, Slider, Table, Input, Tabs, Toast (Sonner), Tooltip, Skeleton, Progress.
- Every list has loading (skeleton), empty and error states.

---

## 9. Testing Plan

### 9.1 Strategy
| Layer | Scope | Tooling | Where |
|---|---|---|---|
| Backend unit | Services, repositories (in-memory SQLite), storage backend, validators, metadata extraction — no HTTP | pytest, Hypothesis | `backend/tests/unit` |
| Backend integration | Full HTTP via `TestClient` against real FastAPI app, temp SQLite DB + temp storage dir, real migrations | pytest, httpx | `backend/tests/integration` |
| Frontend unit | Player store logic, audio-engine wrapper (mocked `HTMLAudioElement`), utils, zod schemas, hooks | Vitest | `frontend/src/**/*.test.ts` |
| Frontend component/integration | Feature screens with MSW-mocked API, user interactions | Vitest + RTL + user-event + MSW | `frontend/src/**/*.test.tsx` |
| E2E | Real frontend + real backend + temp data dir; the five use cases | Playwright | `e2e/` |

**Principles**
- Test behavior via public interfaces. Integration tests use real SQLite and real files, never mocks of our own code.
- Each test is isolated: fresh DB and storage dir per test (fixtures).
- Audio fixtures: tiny generated files (≈1 s sine wave in each format) committed under `backend/tests/fixtures/audio`, plus a text file renamed `.mp3` and a truncated file for negative cases.
- Seed data via factories, not by calling the API in unrelated tests.

**Coverage gates (CI):** backend ≥ 90 % line, frontend ≥ 80 % line for `features/` and `shared/`. All E2E scenarios in §9.5 must pass. Coverage is a floor; the case tables below are the real contract.

**CI order:** lint/typecheck → unit → integration → build → E2E.

### 9.2 Backend test cases

**UC1 — Upload / collection / pool**

| ID | Level | Case | Expected |
|---|---|---|---|
| B-UP-01 | Unit | Metadata extraction from valid MP3/WAV/FLAC/OGG/M4A | title, artist, album, duration_ms correct |
| B-UP-02 | Unit | File without tags | title = filename stem, artist null |
| B-UP-03 | Unit | Embedded cover art present | cover bytes returned |
| B-UP-04 | Unit | Text file renamed `.mp3` | Rejected, unsupported/corrupt |
| B-UP-05 | Unit | Disallowed extension (`.exe`) | Rejected |
| B-UP-06 | Unit | File over size limit | Rejected (413) |
| B-UP-07 | Unit | SHA-256 identical content, different filename | Detected as duplicate |
| B-UP-08 | Unit | Filename with `../` or unicode/emoji | Stored under generated key; no traversal; title preserved |
| B-UP-09 | Integration | POST `/songs/upload` single valid file | 201, song in pool, song in collection, file exists in storage |
| B-UP-10 | Integration | Upload multiple files incl. one invalid | Per-file results; valid ones created, invalid rejected with reason; overall response 207/200 with statuses |
| B-UP-11 | Integration | Upload same file twice | One pool row, one file, second result `existing`, still one collection entry |
| B-UP-12 | Integration | DB insert fails after file write (inject fault) | Stored file removed; no orphan |
| B-UP-13 | Integration | GET `/songs` pagination, `q` search, sort | Correct pages, total, filtering (case-insensitive) |
| B-UP-14 | Integration | `in_collection` flag | true only for collection songs |
| B-UP-15 | Integration | POST `/collection` with pool IDs | 200; songs appear in GET `/collection` |
| B-UP-16 | Integration | POST `/collection` with already-added ID | Idempotent, no duplicate |
| B-UP-17 | Integration | POST `/collection` with unknown ID | 404, nothing added (atomic) |
| B-UP-18 | Integration | DELETE `/collection/{id}` | 204; song gone from collection and from playlists; file still in pool |
| B-UP-19 | Integration | PATCH `/songs/{id}` blank title | 422 |
| B-UP-20 | Integration | PATCH `/songs/{id}` valid | Updated and returned |
| B-UP-21 | Integration | Upload a song | `uploaded_by` equals the current user's ID in the response and DB |
| B-UP-22 | Integration | Same file uploaded again (by a different user, via dependency override) | Existing song returned; `uploaded_by` still the first uploader |
| B-UP-23 | Integration | PATCH `/songs/{id}` with `uploaded_by` in body | Field ignored/422; value unchanged (not user-editable) |

**UC2 — Streaming**

| ID | Level | Case | Expected |
|---|---|---|---|
| B-ST-01 | Integration | GET stream, no Range | 200, full body, `Accept-Ranges: bytes`, correct `Content-Type` |
| B-ST-02 | Integration | `Range: bytes=0-99` | 206, 100 bytes, correct `Content-Range` |
| B-ST-03 | Integration | `Range: bytes=100-` | 206 to end |
| B-ST-04 | Integration | Suffix range `bytes=-50` | 206 last 50 bytes |
| B-ST-05 | Integration | Range beyond file size | 416 |
| B-ST-06 | Integration | Unknown song ID | 404 |
| B-ST-07 | Integration | Row exists, file missing from storage | 404/410 with error envelope, logged |
| B-ST-08 | Unit | LocalFileStorage.stream ranges (start, end, open-ended, boundaries) | Correct bytes (Hypothesis: concatenated chunks == file) |
| B-ST-09 | Integration | GET cover for song with/without art | 200 image / 404 |

**UC3 — Playlists**

| ID | Level | Case | Expected |
|---|---|---|---|
| B-PL-01 | Integration | Create playlist | 201, id, empty songs |
| B-PL-02 | Integration | Empty / whitespace-only / >100 char name | 422 |
| B-PL-03 | Integration | Duplicate name (differing case) | 409 |
| B-PL-04 | Integration | Name is trimmed | Stored trimmed |
| B-PL-05 | Integration | PATCH rename to existing name | 409; rename to own name OK |
| B-PL-06 | Integration | DELETE playlist | 204; GET → 404; songs still in collection; `playlist_songs` rows gone |
| B-PL-07 | Integration | DELETE unknown ID | 404 |
| B-PL-08 | Integration | GET `/playlists` counts/duration | `song_count`, `total_duration_ms` correct |

**UC4 — Playlist songs**

| ID | Level | Case | Expected |
|---|---|---|---|
| B-PS-01 | Integration | Add songs | Appended in request order, positions contiguous from 0 |
| B-PS-02 | Integration | Add song already in playlist | Skipped, reported in `skipped`; no duplicate |
| B-PS-03 | Integration | Add song not in collection | 409/400, nothing added |
| B-PS-04 | Integration | Add unknown song / unknown playlist | 404 |
| B-PS-05 | Integration | Remove middle song | 204; positions compacted |
| B-PS-06 | Integration | Remove song not in playlist | 404 |
| B-PS-07 | Integration | Reorder with valid permutation | Order persisted, returned by GET |
| B-PS-08 | Integration | Reorder with missing/extra/duplicate IDs | 422, order unchanged |
| B-PS-09 | Unit (Hypothesis) | Random add/remove/reorder sequences | Positions always unique and contiguous; no duplicates |
| B-PS-10 | Integration | Same song in two playlists, remove from one | Other unaffected |

**UC5 / cross-cutting**

| ID | Level | Case | Expected |
|---|---|---|---|
| B-PD-01 | Integration | GET playlist returns songs in order with `stream_url` | Ordered, URLs resolvable |
| B-PD-02 | Integration | Empty playlist | `songs: []` |
| B-XC-01 | Integration | Error envelope shape on 404/409/422/500 | Matches contract |
| B-XC-02 | Integration | Migrations: upgrade head on empty DB; downgrade/upgrade round trip | Schema matches models |
| B-XC-03 | Integration | CORS allowed/denied origin | Headers as configured |
| B-XC-04 | Integration | `/health` | 200 |
| B-XC-05 | Unit | Settings from env vars; invalid values | Parsed/raises |
| B-XC-06 | Contract | OpenAPI schema snapshot | Fails on unintended API change |

### 9.3 Frontend test cases

**Player store / engine (unit)**

| ID | Case | Expected |
|---|---|---|
| F-PL-01 | `playQueue(songs, startIndex)` | Current = songs[startIndex], status playing |
| F-PL-02 | Play/pause toggle | Engine `play`/`pause` called; state flips |
| F-PL-03 | Next, repeat off, middle of queue | Advances |
| F-PL-04 | Next at end, repeat off | Stops; index unchanged/ended state |
| F-PL-05 | Next at end, repeat-all | Wraps to 0 |
| F-PL-06 | Track ended, repeat-one | Same track restarts |
| F-PL-07 | Previous, elapsed > 3 s | Restarts current |
| F-PL-08 | Previous, elapsed ≤ 3 s | Goes to previous; at index 0 restarts |
| F-PL-09 | Repeat cycle off → all → one → off | Correct order |
| F-PL-10 | Shuffle on | Order is permutation; current track stays current; no repeats before cycle completes |
| F-PL-11 | Shuffle off | Restores original order, current preserved |
| F-PL-12 | Seek / setVolume / mute | Clamped to valid range; mute restores previous volume |
| F-PL-13 | Persisted settings | Volume/repeat/shuffle restored from localStorage; corrupt value falls back to defaults |
| F-PL-14 | Engine `error` event | Toast dispatched, advances to next |
| F-PL-15 | Queue updated while playing (playlist edited) | Current track unaffected; queue reflects change; removed current song continues until it ends |

**Player UI (component)**

| ID | Case | Expected |
|---|---|---|
| F-PU-01 | Renders title/artist/cover for current song | Visible |
| F-PU-02 | Controls have accessible names; buttons disabled with empty queue | Pass |
| F-PU-03 | Seek slider reflects time; dragging seeks | Engine seek called |
| F-PU-04 | Keyboard shortcuts | Work; ignored when input focused |
| F-PU-05 | Repeat button state shown (aria-pressed / icon) | Matches store |

**Library & upload (component, MSW)**

| ID | Case | Expected |
|---|---|---|
| F-LB-01 | Collection loads | Rows rendered; skeleton while loading |
| F-LB-02 | Empty collection | Empty state with upload CTA |
| F-LB-03 | API error | Error state with retry |
| F-LB-04 | Search input (debounced) | Request with `q`; results update |
| F-LB-05 | Upload via picker | Progress shown; success toast; list refetched |
| F-LB-06 | Upload drag-and-drop | Same as picker |
| F-LB-07 | Mixed batch (some rejected) | Per-file status with reasons |
| F-LB-08 | Client-side reject of wrong type / oversize | Message; no request sent |
| F-LB-09 | Pool shows "Add" vs "In collection" | Correct; add updates state optimistically, rolls back on failure |
| F-LB-10 | Edit song dialog | Validation; PATCH sent; row updated |
| F-LB-11 | Remove from collection (confirm) | Row removed; also removed from playlist views (cache invalidated) |
| F-LB-12 | Double-click play on row | Queue = visible collection, starts at that song |

**Playlists (component, MSW)**

| ID | Case | Expected |
|---|---|---|
| F-PY-01 | Create dialog validation (empty, too long) | Inline error; no request |
| F-PY-02 | Create success | Appears in list; dialog closes |
| F-PY-03 | Duplicate name (409) | Inline error shown |
| F-PY-04 | Delete with confirm / cancel | Deleted / untouched |
| F-PY-05 | Add to playlist from row menu | Request sent; toast; already-present reported |
| F-PY-06 | Remove song from playlist | Row removed; collection unaffected |
| F-PY-07 | Drag reorder | PUT order called with new order; reverts on failure |
| F-PY-08 | Play playlist button | Queue = playlist songs from index 0; disabled when empty |
| F-PY-09 | Click song in playlist | Starts at that song with playlist queue |
| F-PY-10 | Now-playing highlight | Current song row marked |

**Shared (unit)**

| ID | Case | Expected |
|---|---|---|
| F-SH-01 | API client maps error envelope to typed errors | Correct |
| F-SH-02 | zod schemas reject malformed API responses | Throws/handled |
| F-SH-03 | Duration/time formatters | `0:00`, `3:07`, `1:02:03` |

### 9.4 Non-functional test cases
| ID | Case | Method |
|---|---|---|
| N-01 | Axe accessibility scan on Library, Pool, Playlists, Player | `vitest-axe` / Playwright axe; zero serious violations |
| N-02 | 10k-song collection list endpoint p95 < 200 ms | pytest benchmark (seeded) |
| N-03 | Path traversal in upload filename / ID params | Covered by B-UP-08 plus security case: IDs are UUIDs, invalid → 422 |
| N-04 | Concurrent uploads of same file | Single pool row (unique constraint handled) |
| N-05 | Concurrent playlist adds | Positions remain unique/contiguous |

### 9.5 End-to-end scenarios (Playwright)
| ID | Scenario |
|---|---|
| E-01 | **UC1:** Upload two fixture files → both appear in Library with correct title/duration. |
| E-02 | **UC1:** Upload same file again → no duplicate row; notified as existing. |
| E-03 | **UC1:** Remove a song from collection → it remains in Pool and can be re-added. |
| E-04 | **UC2:** Play song → time advances; pause stops; seek jumps; volume changes. |
| E-05 | **UC2:** Repeat-one: let a short song finish → restarts; repeat-off → stops. |
| E-06 | **UC3:** Create playlist; duplicate name shows error; delete with confirm. |
| E-07 | **UC4:** Add 3 songs, reorder, remove one; reload page → state persisted. |
| E-08 | **UC5:** Play playlist → plays in order; next/prev; repeat-all wraps. |
| E-09 | Reload mid-library: persisted volume/repeat/shuffle restored. |

### 9.6 Test data & tooling notes
- `conftest.py` provides `app`, `client`, `db_session`, `tmp_storage`, `audio_fixture(fmt)` fixtures; a `Settings` override points DB/storage to `tmp_path`.
- Frontend MSW handlers live in `src/test/handlers` and are shared by component tests and Storybook-style dev mocking.
- Mock `HTMLAudioElement` via a small fake in `src/test/fakeAudio.ts` (jsdom lacks media playback).
- E2E uses a dedicated `DATA_DIR` and resets it before each test file through a test-only reset hook (enabled only when `APP_ENV=test`).

---

## 10. Milestones

| # | Milestone | Deliverables |
|---|---|---|
| M0 | Scaffold | Monorepo layout, tooling, lint/format/typecheck, CI skeleton, Alembic baseline |
| M1 | Backend core | Models, storage backend, upload + collection + pool endpoints, tests B-UP, B-ST |
| M2 | Playlists API | UC3–UC5 endpoints and tests B-PL, B-PS, B-PD |
| M3 | Player | Engine, store, player bar, tests F-PL, F-PU |
| M4 | Library UI | Upload, pool, collection screens, tests F-LB |
| M5 | Playlist UI | CRUD, reorder, play playlist, tests F-PY |
| M6 | Hardening | E2E suite, a11y pass, coverage gates, README |

---

## 11. Risks & Open Questions

| Risk / question | Mitigation / default |
|---|---|
| Browser codec support differs (FLAC/OGG/M4A on Safari) | Detect via `canPlayType`; show "unsupported in this browser" and skip. Transcoding deferred. |
| Large files held in memory during upload | Stream to disk in chunks while hashing. |
| SQLite write concurrency | Single-process local use is fine; WAL mode enabled; Postgres is the cloud path. |
| Orphaned files if process dies mid-upload | Write to temp key then finalize; maintenance script reconciles storage vs DB. |
| Pool will contain every upload forever (no delete) | Accepted for v1 (assumption 5); revisit with garbage collection of songs in no collection. |
| "Latest versions" may include breaking majors (e.g. Tailwind, React Router, Vite) | Scaffold with latest, pin lockfiles, and keep upgrades in small separate PRs with the test suite as the safety net. |
