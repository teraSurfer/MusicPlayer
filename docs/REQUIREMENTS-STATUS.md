# Requirements status: PRD vs. what was built

Review date: 2026-10-11. Compared [PRD.md](PRD.md) with the code and tests. Nothing was changed as part of this review.

**Status key:** ✅ done and tested · 🟡 partial · ❌ missing

Paths are relative to the repository root. `BE` = `backend/app`, `FE` = `frontend/src`.

## Functional requirements

### UC1: Add songs to the collection
| ID | Status | Where | Notes |
|---|---|---|---|
| UC1-1 | ✅ | `FE/features/library/UploadPanel.tsx` | File picker and drag-and-drop. |
| UC1-2 | ✅ | `BE/services/upload.py`, `services/metadata.py` | Extension allow-list, content parsed with mutagen, size limit enforced while streaming to storage. |
| UC1-3 | 🟡 | `BE/services/metadata.py` | Title, artist, album, duration and cover art are extracted. **Bitrate is not** (no column in the data model either). |
| UC1-4 | ✅ | `BE/services/upload.py` | Duplicates by SHA-256 reuse the pool song; `uploaded_by` set on first upload. |
| UC1-5 | ✅ | `FE/features/library/PoolPage.tsx`, `BE/api/v1/songs.py` | Search and "In collection" state. |
| UC1-6 | ✅ | `BE/services/collection.py` | Many at once; repeats are a no-op and are reported. |
| UC1-7 | 🟡 | `FE/features/library/UploadPanel.tsx` | Per-file success and failure are shown. Progress is **one bar for the whole batch**, because the files go in a single request. |
| UC1-8 | ✅ | `FE/features/library/EditSongDialog.tsx`, `PATCH /songs/{id}` | |
| UC1-9 | ✅ | `FE/features/library/LibraryPage.tsx`, `DELETE /collection/{id}` | Confirmation dialog; cascades to playlists. |

### UC2: Play a song
| ID | Status | Where | Notes |
|---|---|---|---|
| UC2-1 | ✅ | `BE/api/v1/songs.py` (`stream_song`), `BE/api/ranges.py` | 200 and 206 with correct headers; 416 for impossible ranges. |
| UC2-2 | ✅ | `FE/features/player/PlayerBar.tsx` | Play/pause, previous, next, seek with elapsed and total, volume, mute. |
| UC2-3 | ✅ | `FE/features/player/queue.ts`, `store.ts` | Repeat cycle off, all, one; shuffle. |
| UC2-4 | ✅ | `FE/app/AppLayout.tsx` | Player bar persists across routes. |
| UC2-5 | ✅ | `FE/features/player/queue.ts` (`previousAction`) | |
| UC2-6 | ✅ | `FE/features/player/usePlayerShortcuts.ts` | Space, arrows, Shift+arrows, M. Ignored while typing. |
| UC2-7 | ✅ | `FE/features/player/settings.ts` | Verified across a reload in E2E (E-09). |
| UC2-8 | ✅ | `FE/features/player/store.ts` | Unit tested; also stops if every track fails. Not exercised in the browser. |
| UC2-9 | 🟡 | `FE/features/player/mediaSession.ts` | Unit tested with a fake session. **Not verified in a real browser or with OS media keys.** |

### UC3: Create and delete playlists
| ID | Status | Where | Notes |
|---|---|---|---|
| UC3-1 | ✅ | `BE/schemas/playlists.py`, `FE/features/playlists/PlaylistFormDialog.tsx` | |
| UC3-2 | ✅ | `BE/services/playlists.py`, `db/models.py` (`name_key`) | Unicode case-folded; also guarded by a unique constraint. |
| UC3-3 | ✅ | `FE/features/playlists/PlaylistDetailPage.tsx` | |
| UC3-4 | ✅ | `FE/features/playlists/PlaylistsPage.tsx` | Confirmation; songs untouched. |
| UC3-5 | ✅ | `BE/repositories/playlists.py` (`list_summaries`) | |

### UC4: Add and remove songs in a playlist
| ID | Status | Where | Notes |
|---|---|---|---|
| UC4-1 | 🟡 | `FE/features/playlists/AddToPlaylistMenu.tsx` | The API accepts many songs. The UI only adds **one song at a time** from the row menu; there is no multi-select picker. |
| UC4-2 | ✅ | `BE/services/playlists.py` | Returned as `skipped`; shown as "Already in …". |
| UC4-3 | ✅ | `DELETE /playlists/{id}/songs/{song_id}` | |
| UC4-4 | ✅ | `FE/features/playlists/PlaylistDetailPage.tsx` | Drag and drop (verified in E2E E-10) plus Move up and down buttons. |
| UC4-5 | ✅ | `BE/services/playlists.py` | 409 `song_not_in_collection`, all-or-nothing. |

### UC5: Play a playlist
| ID | Status | Where | Notes |
|---|---|---|---|
| UC5-1 | ✅ | `FE/features/playlists/PlaylistDetailPage.tsx` | |
| UC5-2 | ✅ | `FE/features/player/store.ts` | |
| UC5-3 | ✅ | `FE/features/player/queue.ts` | Verified in E2E E-08. |
| UC5-4 | ✅ | `FE/features/playlists/PlaylistDetailPage.tsx` | `aria-current` on the playing row. |
| UC5-5 | ✅ | `FE/features/playlists/PlaylistDetailPage.tsx` | |
| UC5-6 | 🟡 | `FE/features/playlists/PlaylistDetailPage.tsx`, `store.updateQueue` | Works for edits made in the same tab while that playlist page is open. **Edits from another tab or while on another page are not reflected** until the playlist is played again. |

## Non-functional requirements
| Area | Status | Notes |
|---|---|---|
| Pagination (default 50, max 200) | ✅ | Enforced; over-limit is a 422. |
| Time-to-first-audio under 500 ms | ❌ | Never measured. |
| 10k songs responsive | ❌ | Never tested; the list is a plain table (no virtualization). |
| Atomic upload, no orphan files | ✅ | Tested (B-UP-12, N-04). |
| Orphan detection script | ❌ | Not written. |
| Filename and path safety | ✅ | Generated keys, traversal rejected, tested. |
| CORS restricted to configured origins | 🟡 | Configured; **no test** (B-XC-03). |
| Size and type limits server-side | ✅ | |
| Early rejection of oversize uploads | 🟡 | The size limit is enforced, but the framework buffers the full request body to disk before the check runs. |
| Accessibility (WCAG 2.1 AA) | 🟡 | Automated axe scan passes on all pages. No manual keyboard-only or screen-reader pass. |
| JSON logs, request ID, health endpoint | ✅ | Health is at `/api/v1/health`. |
| 12-factor config | ✅ | `MUSIC_*` environment variables. |
| Containerizable | 🟡 | Nothing prevents it, but there is no Dockerfile. |
| Browser support (Chrome, Firefox, Safari, Edge) | 🟡 | E2E runs in Chromium only. |

## Test-plan coverage (§9)
117 case IDs in the PRD. **104** are referenced by a test of that ID, and most of the other 13 are covered without carrying the ID in the test name.

| PRD case | Status | Notes |
|---|---|---|
| B-ST-08, B-UP-07 | ✅ | Covered by storage unit tests and B-UP-11, without the ID in the name. |
| B-XC-02, B-XC-04, N-03 | ✅ | Covered by migration, health and traversal tests, without the ID in the name. |
| B-XC-01 | 🟡 | Error codes are asserted in many tests; no dedicated envelope-shape test. |
| B-XC-05 | 🟡 | Settings loading is exercised; no invalid-value test. |
| F-SH-01 | 🟡 | The client's error mapping is exercised through the UI, not unit tested. |
| B-XC-03 | ❌ | CORS not tested. |
| B-XC-06 | ❌ | No OpenAPI snapshot test. |
| F-SH-02 | ❌ | No test that malformed API responses are rejected. |
| N-02 | ❌ | No 10k-song performance test. |
| N-05 | ❌ | No concurrent playlist-add test (N-04 for uploads is simulated). |

## Where the PRD no longer matches the code
| PRD says | Code does |
|---|---|
| `httpx` | `httpx2` (Starlette deprecates httpx for its test client) |
| shadcn components in `shared/components/ui` | `src/components/ui` |
| Node version not stated | Node 22.13+ required |
| Playlist uniqueness via a lower-cased name | A stored `name_key` column, case-folded |
| 413 for an oversize file; "207/200" for batches; "404/410", "409/400" | Decided: all-rejected-same-reason returns 413 or 415, otherwise 201 or 200; missing file is 404; not-in-collection is 409 |
| Collections use a NULL `owner_id` | Collections use the current user's ID (a fixed local ID today) |
| Health at `/health` | `/api/v1/health` |
| Not specified | `POST /api/v1/test/reset` when `MUSIC_APP_ENV=test`; player queue has a `sourceId`; Library lists newest first |

## Suggested follow-ups (not done)
1. **Fix the gaps:** bitrate (UC1-3), multi-select add to playlist (UC4-1), per-file or clearer upload progress (UC1-7).
2. **Close the test gaps:** B-XC-03, B-XC-06, F-SH-02, N-05, then N-02 with a decision on virtualization.
3. **Verify in a real browser:** Media Session (UC2-9) and Firefox/WebKit via Playwright projects.
4. **Update the PRD** with the decisions in the table above and the Step 4 findings, so the document is the source of truth again.
5. **Write the orphan-detection script** and a Dockerfile if cloud deployment is the next milestone.
