# Prompts Used to Build the Music Player

A step-by-step record of the prompts used with Claude Code to plan and build this app. Read it top to bottom: each step builds on the one before.

**How to read each step**
- **Goal:** what we want out of this step.
- **Prompt:** the text we typed (copy and adapt it).
- **Why it works:** the prompting idea to learn.
- **Result:** what Claude produced.

> Steps marked **✅ Used** are the actual prompts from this project. Steps marked **🔜 Next** are suggested prompts for the coming phases; adjust them once you see the earlier output.

---

## Phase 1 — Planning (before any code)

### Step 1 — Ask for the PRD, and invite questions ✅ Used

**Goal:** Turn a rough idea into a written plan (a PRD) before building anything.

**Prompt**
```text
I want to create a music player application in react, typescript, and vite.
Use tailwind with a popular library like shadcn. Use pnpm, update the
dependencies if you need to.

Starting with the PRD, i have 4 usecases that i want my users to do. Since
this application will be running locally in the beginning, write it in a way
that it is still scalable with cloud deployments in the future, but we won't
be using anything in the cloud today.

1. Add songs to collection. This includes uploading a song of their choice,
   or songs already available in the pool.
2. Play a song with all music controls, like play pause and repeat from the
   collection.
3. Create / delete playlists.
4. Add / remove songs from playlist.
5. Play a playlist.

For backend, use python with fast api, use sqlite as database, and local
filesystem to store the song files.

Include detailed testing plan with test cases for each feature. Use the
approriate libraries to write unit tests, and integration tests.

Keep the code base modular, use latest versions and ask clarifying questions
if you have any before writing the doc.
```

**Why it works**
| Part of the prompt | What it does |
|---|---|
| "Starting with the PRD" | Plan first, code later. Cheap to change a document, expensive to change code. |
| Tech stack named up front (React, Vite, FastAPI, SQLite, pnpm) | Removes guessing; Claude won't pick a different stack. |
| Numbered use cases | Gives Claude a checklist; each use case becomes testable requirements. |
| "running locally… scalable with cloud in the future, but not today" | States a *future* constraint without asking for it now. Claude builds seams (interfaces) rather than cloud code. |
| "detailed testing plan… for each feature" | Testing is part of the design, not an afterthought. |
| "ask clarifying questions before writing the doc" | Lets Claude surface gaps instead of silently guessing. |

**Result:** Claude did not write the doc yet. It asked questions (Step 2). It also noticed we said "4 use cases" but listed 5.

> 💡 **Tip:** A typo or mismatch in your prompt (4 vs 5) is fine. A good assistant will flag it. Don't be afraid to leave "ask me if unsure" in your prompt.

---

### Step 2 — Answer the clarifying questions ✅ Used

**Goal:** Close the gaps Claude found so the PRD matches what you actually want.

**Questions Claude asked, and the answers chosen**

| Question | Answer | Why it matters |
|---|---|---|
| Do users need accounts/auth? | Single user, no auth | Keeps scope small. A reserved `owner_id` column lets us add users later. |
| What is "the pool"? | Shared catalog of every uploaded file; a collection is the subset a user adds | Defines the core data model: pool vs. collection. |
| Which audio formats? | MP3, WAV, FLAC, OGG/M4A + auto-read tags | Sets validation rules and upload tests. |
| Where should the PRD live? | `docs/PRD.md` in the repo | Versioned together with the code. |

**Why it works:** Claude offered a *recommended* default for each question, so answering is fast. Vague words like "pool" were turned into precise definitions.

**Result:** [docs/PRD.md](docs/PRD.md), including requirements, architecture, data model, API, and a ~150-case testing plan.

---

### Step 3 — Change the plan after review ✅ Used

**Goal:** Fix a gap you spotted in the PRD. This is normal: a PRD is a living document.

**Prompt**
```text
Songs datamodel does not have a field for who uploaded it. Include that in the
data model as well.
```

**Why it works**
| Part of the prompt | What it does |
|---|---|
| Names the exact problem ("songs datamodel… no field for who uploaded it") | Claude knows what to change and where. |
| "Include that in the data model" | A small, bounded change request, not a rewrite. |

**Result:** Claude added `uploaded_by` to the `songs` table in [docs/PRD.md](docs/PRD.md) and followed the change through the rest of the document:
- the data model (§6), assumptions (§1.4 #7), requirement UC1-4, the API table (§7) and new test cases B-UP-21 to B-UP-23.

**Things to notice**
- A one-line data model change touches the requirements, API *and* tests. That is why the PRD is worth keeping consistent.
- Claude made a decision for you: the field is nullable and set to a fixed local user ID today, and the **first uploader wins** on duplicate uploads. Check these in §1.4 #7 and tell Claude if you disagree.

---

### Step 4 — Review the PRD and its assumptions ✅ Used

**Goal:** Check Claude's assumptions before they become code.

**Prompt**
```text
Read docs/PRD.md section 1.4 (Assumptions). For each assumption, tell me what
would change in the data model and API if I answered differently. Then list
anything in the PRD that is ambiguous or untestable.
```

**Why it works:** Asking Claude to review its own work, and to explain consequences, finds hidden problems early.

**Result:** Analysis only; no files were changed. Claude produced:
- a table showing, for each of the 7 assumptions, what would change in the data model, API and tests if you answered differently;
- a list of problems in the PRD, grouped as *contradictions*, *ambiguous*, *untestable* and *requirements with no test case*.

**Things to notice**
- The most valuable finding was a real bug: `UNIQUE(owner_id, song_id)` does not prevent duplicates when `owner_id` is NULL. It was fixed in code in Step 6.
- Asking for a review *before* coding is cheap. The same problem found after the code is written costs a migration.
- Claude **did not apply** the findings to the PRD. It listed them and waited. Several are still open (see "Open items" at the end of this file).

---

## Phase 2 — Scaffolding

### Step 5 — Scaffold the project (Milestone M0) ✅ Used

**Goal:** Create the empty, working skeleton: folders, tooling, lint, test runner.

**Prompt**
```text
Following docs/PRD.md section 5.3 and Milestone M0, scaffold the project:
- frontend/: Vite + React + TypeScript (strict), Tailwind, shadcn/ui, Vitest,
  React Testing Library. Use pnpm and the latest versions.
- backend/: FastAPI, SQLAlchemy 2, Alembic, pytest, httpx, Ruff, mypy.
- Add a /health endpoint and one passing test in each of frontend and backend.
Do not implement any features yet. Show me the commands to run each test suite.
```

**Why it works:** "Do not implement any features yet" keeps the step small and verifiable. One passing test per side proves the tooling works.

**Result**
- `frontend/`: Vite, React, TypeScript (strict), Tailwind, shadcn/ui, Vitest, Testing Library, with a placeholder page and one passing test.
- `backend/`: FastAPI, SQLAlchemy, Alembic, pytest, Ruff, mypy, with `GET /api/v1/health`, one passing test and the empty folder layout from PRD §5.3.
- A `README.md` with the commands to run each suite.

**Things to notice**
- "Use the latest versions" had a real cost: the newest Vitest and jsdom need **Node 22**, but this machine's default was Node 20. Claude found this from the error, switched to the Node 22 that was installed, pinned jsdom, and added `.nvmrc`.
- Claude also swapped `httpx` for `httpx2` because the test client warned that `httpx` is deprecated. Small deviations from your prompt like this are worth asking about.
- shadcn put components in `src/components/ui`, not the path written in the PRD. The code and the document now differ.

**Check yourself:** Do both test suites pass? Does `/health` respond?

---

### Step 5.1 — Run it and verify ✅ Used

**Goal:** Prove the app really runs, not just that tests pass.

**Prompts**
```text
can you run the code locally and make sure that the health endpoint is working
```
```text
run the backend
```
```text
stop it and lets do step 6.
```

**Why it works:** A passing test and a running server are different evidence. Asking Claude to run it makes it start the server, call the endpoint and report real output.

**Result:** Claude started the backend and called `/api/v1/health` (`200`, `{"status":"ok"}`). It also called it through the frontend dev server's proxy, which proves both halves are wired together. Then it stopped both servers.

**Things to notice**
- "Run it" and "stop it" are separate instructions. Claude leaves servers running in the background only when you ask it to.

---

## Phase 3 — Backend, one use case at a time

### Step 6 — Storage and database seams (M1, part 1) ✅ Used

**Prompt**
```text
Implement the StorageBackend protocol and LocalFileStorage described in PRD
section 5.1, plus the songs and collection_items models and the first Alembic
migration (PRD section 6). Write unit tests first for save, open, stream with
byte ranges, and delete. Services must only depend on the protocol, never on
the filesystem directly.
```

**Why it works:** Naming the *interface* is what makes the app cloud-ready later. "Tests first" gives Claude a clear definition of done.

**Result**
- `StorageBackend` protocol and `LocalFileStorage` (save, open, stream with byte ranges, size, exists, delete, url).
- `Song` and `CollectionItem` models, session setup and the first Alembic migration.
- 65 backend tests passing, Ruff and mypy clean. Claude ran the tests first and showed them failing before it wrote the implementation.

**Things to notice**
- **The seam is the point.** Services only know the `StorageBackend` interface. A test enforces this, so moving to S3 later means adding one class.
- **Tests caught design questions early:** path traversal in keys, symlinks that escape the folder, and what happens when a write fails halfway.
- **Claude made a decision for you:** it fixed the NULL `owner_id` duplicate bug (found in Step 4) with a partial unique index rather than changing the PRD schema. Review it and say if you prefer another approach.
- **A gap it left alone:** the PRD says bitrate is extracted but has no column for it. Claude flagged it instead of silently adding one.

---

### Step 6.1 — Ask for a status summary ✅ Used

**Goal:** Get an honest picture of progress before continuing.

**Prompt**
```text
can you also summarize what is the state of the application and what did claude do after each step.
```

**Why it works:** It makes Claude separate *what exists* from *what was planned*, and surfaces what is stale or still open.

**Result:** A milestone table (M0 done, M1 partly done, everything else not started), what runs today, and what Claude did in each step. It also listed three open items: PRD findings not yet applied, the PRD drifting from the code, and this file being out of date.

---

### Step 7 — Upload and collection endpoints (M1, part 2) ✅ Used

**Prompt**
```text
Implement use case 1 on the backend: POST /songs/upload, GET /songs,
POST /collection, DELETE /collection/{id}, per PRD section 7. Cover test cases
B-UP-01 to B-UP-23 from section 9.2. Run the tests and show me the results.
```

**Why it works:** Pointing at *numbered test cases* from the PRD ties the code to the plan. Asking to "run the tests and show me" prevents unverified claims.

**Result**
- `POST /songs/upload` (one or many files), `GET /songs` (the pool, with search, sort, paging, `in_collection`), `GET/PATCH /songs/{id}`, `GET /songs/{id}/cover`, and the collection endpoints (`GET`, `POST`, `DELETE`).
- Every PRD case from B-UP-01 to B-UP-23 has a test. 105 backend tests pass; Ruff and mypy are clean.
- Real audio fixtures (mp3, wav, flac, ogg, m4a) were generated with ffmpeg and committed (about 30 KB total).

**State after this step:** the backend can ingest and organise songs. There is still no way to *play* one over HTTP (Step 8) and no playlists (Step 9).

**Things to notice**
- **Ambiguities from Step 4 had to be decided to write the code.** Claude picked: a batch always returns per-file results; if *every* file is rejected for the same reason the HTTP status is 413 or 415, otherwise 201 (some created) or 200; unknown IDs fail the whole request (404); the uploader is not editable (422).
- **Collections belong to the current user's ID, not NULL.** Because the uploader is recorded as the fixed local user, the collection uses that same ID. That makes the "two users" test (B-UP-22) work and means the NULL-uniqueness index from Step 6 is a safety net rather than the main guard.
- **Failure paths are tested, not assumed:** the DB failing after the file was written (B-UP-12) and two uploads of the same file racing (N-04) both leave exactly one file and one row.
- **The service layer knows nothing about HTTP.** Routers convert results to JSON; services raise domain errors that one handler turns into the error envelope.
- Request IDs and JSON logs were added here because every request now does real work.

---

### Step 8 — Streaming (M1, part 3) ✅ Used

**Prompt**
```text
Implement GET /songs/{id}/stream with HTTP Range support. Cover test cases
B-ST-01 to B-ST-09. Explain in simple terms what a Range request is and why
the player needs it for seeking.
```

**Why it works:** "Explain in simple terms" turns coding into learning.

**Result**
- `GET /songs/{id}/stream` returns the whole file (200) or just the requested bytes (206) with correct `Content-Range`, `Content-Length` and `Accept-Ranges`.
- Test cases B-ST-01 to B-ST-09 are covered, plus a unit test table for the Range-header parser. 133 backend tests pass; Ruff and mypy are clean.

**State after this step:** a song can be uploaded, found, added to the collection and streamed with seeking. Milestone M1 (backend core) is complete. Playlists are the remaining backend work.

**In simple terms: what is a Range request?** The browser's audio player asks "give me bytes 500,000 onward" instead of "give me the whole file". That is how seeking works without downloading everything first. The server answers `206 Partial Content` and says which slice it sent.

**Things to notice**
- **The parsing is a separate pure function** (`parse_range`), so edge cases such as `bytes=-50`, an end past the file and malformed headers are tested in microseconds with no server.
- **Two different "bad" cases:** a *malformed* header is ignored and the full file is sent (the HTTP spec allows this); a *well-formed but impossible* range is a `416` that tells the client the real file size.
- **A missing file is not a crash:** if the database row exists but the file is gone, the API returns a clean `404 file_missing` and logs it, rather than a 500.

---

### Step 9 — Playlists API (M2) ✅ Used

**Prompt**
```text
Implement use cases 3, 4 and 5 on the backend: playlist CRUD, add/remove songs,
reorder, per PRD section 7. Cover B-PL, B-PS and B-PD test cases. Include the
Hypothesis property test B-PS-09 for ordering.
```


**Result**
- `playlists` and `playlist_songs` tables with migration 0002.
- Endpoints: list, create, get, rename or describe, delete, add songs, remove a song, reorder.
- Test cases B-PL, B-PS and B-PD are covered, plus the Hypothesis property test B-PS-09 (random add, remove and reorder sequences never break the position rules). 169 backend tests pass; Ruff and mypy are clean.

**State after this step:** the backend covers all five use cases. The frontend is still the placeholder page.

**Things to notice**
- **One column makes a unique name work everywhere:** `name_key` holds the case-folded name, so "Études" and "éTUDES" collide on SQLite and on Postgres. A plain `COLLATE NOCASE` would only have handled ASCII.
- **Reordering without breaking the unique constraint:** positions are first moved to negative numbers, then written back as 0..n-1. A naive swap fails because two rows briefly share a position.
- **Removing a song from the collection now cascades** to the user's playlists and closes the gaps (the PRD's assumption #3). The test also proves the song can't be re-added to a playlist until it is back in the collection.
- **All-or-nothing:** an add request with one bad song changes nothing, which is why the tests check the playlist is still empty afterwards.
- The property test found nothing here, but its job is to guard future changes to the ordering code.

---

## Phase 4 — Frontend

### Step 10 — Player engine and store (M3) ✅ Used

**Prompt**
```text
Build the player per PRD section 5.4: a plain TypeScript audio engine class
wrapping HTMLAudioElement, and a Zustand store for queue, repeat, shuffle and
volume. Write the unit tests F-PL-01 to F-PL-15 first. Keep all next/previous/
repeat logic in pure functions that don't touch the DOM.
```

**Why it works:** Separating "logic" from "UI" is the key design decision; it makes the hardest part easy to test.


**Result**
- **Pure queue logic** (`queue.ts`): next, previous, repeat cycle and shuffle order, with no DOM and no React.
- **Store** (`store.ts`): queue, play order, repeat, shuffle, volume, mute, time, with settings saved to `localStorage` and recovered safely if the stored data is corrupt.
- **Engine seam** (`PlayerEngine` interface): a real `HtmlAudioEngine` wraps the browser's audio element; tests use a `FakeEngine`.
- **UI**: `PlayerBar` (transport controls, seek, volume, repeat, shuffle), keyboard shortcuts, and Media Session integration so OS media keys work.
- Test cases F-PL-01 to F-PL-15, F-PU-01 to F-PU-05 and F-SH-03 are covered, plus Media Session tests the PRD had not listed. 74 frontend tests pass; typecheck and build are clean.

**State after this step:** the player works against any list of tracks, but nothing in the app feeds it yet. The page is still a placeholder.

**Things to notice**
- **Three separate jobs:** the *rules* (queue.ts) know nothing about audio; the *store* knows nothing about the DOM; the *engine* knows nothing about queues. That is why 52 of the tests need no browser at all.
- **Decisions the PRD left open were made explicit in tests:** previous on the first track restarts it; repeat-one only applies when a track ends by itself (pressing Next still moves on); if every track fails, the player stops instead of looping forever.
- **A test of mine was wrong, not the code:** one test expected the wrong error behaviour with two tracks. When a test fails, check whether the test or the code is wrong before changing either.
- **Queue updates are by track id, not by index**, so editing a playlist while it plays does not restart the song, and a song removed mid-play finishes, then playback continues from where it was.
- The seek and volume controls are native `<input type="range">` rather than a styled slider component: they are accessible and keyboard-friendly by default.

---

### Step 11 — Library and upload UI (M4) ✅ Used

**Prompt**
```text
Build the Library and Pool screens using shadcn/ui components, with upload via
drag-and-drop and file picker. Use TanStack Query and mock the API with MSW.
Cover F-LB-01 to F-LB-12. Include loading, empty and error states.
```


**Result**
- **App shell:** sidebar navigation, a routed main area and the player bar docked at the bottom.
- **Library page:** your collection with search, "load more" paging, play, edit and remove (with a confirmation dialog).
- **Pool page:** every uploaded song with Add or "In collection" per row, plus multi-select "Add selected".
- **Upload:** file picker and drag-and-drop with progress, per-file results, and client-side checks for type and size before anything is sent.
- **Data layer:** a typed API client that validates responses with zod, TanStack Query hooks, and optimistic add with rollback.
- Test cases F-LB-01 to F-LB-12 are covered against an in-memory fake API (MSW). 94 frontend tests pass; typecheck, lint and build are clean.

**State after this step:** you can run the app, upload songs, find them, edit them, remove them and play them with every control. Playlists have a backend but no UI yet.

**Things to notice**
- **The tests talk to a fake server, not to mocked functions.** MSW intercepts real `fetch` and XHR calls, so the same code path runs as in the browser. The fake backend lives in one file and is reused for the playlist tests.
- **Weak tests hide failures.** One test (mixed upload batch) passed while the upload was actually failing, because it only checked that a filename appeared. It now also checks the "Added" status. Always assert the outcome, not just that something rendered.
- **Test environment details matter:** browser uploads trigger CORS pre-flight requests, which broke tests until the test page was given the same origin as the API.
- **A UX fix came from a test:** while searching, the list used to flash a skeleton on every keystroke. Keeping the previous results visible until the new ones arrive fixed it.
- **"Queue = the visible list"** (the PRD ambiguity from Step 4) is now decided: the queue is every song currently loaded on the page, in on-screen order.

---

### Step 12 — Playlist UI (M5) ✅ Used

**Prompt**
```text
Build the Playlists screens: create/delete, detail page, add/remove songs,
drag-and-drop reorder with dnd-kit, and a Play button that loads the playlist
into the player queue. Cover F-PY-01 to F-PY-10.
```


**Result**
- **Playlists page:** list with song count and total time, a "New playlist" dialog with inline validation (including the duplicate-name error from the server), and delete with confirmation.
- **Playlist detail page:** play the whole playlist or start from any song, now-playing highlight, remove a song, rename or describe, delete.
- **Reordering:** drag handles (dnd-kit) plus Move up and Move down buttons. The order saves immediately and reverts if the server refuses.
- **Add to playlist:** a submenu in each Library row that reports "already in playlist".
- **Live queue:** editing the playlist that is playing updates the queue without restarting the song.
- Test cases F-PY-01 to F-PY-10 and UC5-6 are covered. 116 frontend tests pass; typecheck, lint and build are clean.

**State after this step:** all five use cases work end to end in the UI, against the real API contract. What has not been done yet is running the real frontend against the real backend in a browser (Step 13).

**Things to notice**
- **A failing test taught something about the library:** Base UI ignores a click that arrives immediately after a menu opens (to prevent accidental selection), so the submenu test activates the item with the keyboard. This also confirms the menu is operable without a mouse.
- **Accessible names must be unique:** the playlist's "Play" button clashed with the player bar's "Play", so it is now "Play playlist". Screen-reader users hit the same ambiguity that the test did.
- **Move up and Move down buttons were added on purpose.** Drag and drop is hard to use with a keyboard or on a phone, and it is also hard to test in jsdom. The buttons give a reliable, accessible way to reorder, and the drag gesture itself is left for the browser test in Step 13.
- **The queue "source" is a small design choice:** the player remembers where its queue came from (`playlist:<id>`), so only the page that owns that queue keeps it in sync.

---

## Phase 5 — Verify and harden

### Step 13 — End-to-end tests (M6) ✅ Used

**Prompt**
```text
Write the Playwright scenarios E-01 to E-09 from PRD section 9.5 against the
real frontend and backend using a temporary data directory. Run them and report
any failures with the cause.
```

### Step 14 — Review your own work ✅ Used

**Prompt**
```text
Review the whole codebase against docs/PRD.md. List each requirement ID
(UC1-1 … UC5-6) with status: done, partial, or missing, and where it is
implemented. Do not fix anything yet.
```

**Why it works:** Asking for a *report before fixes* keeps you in control and gives you a trustworthy checklist.


**Result**
- A Playwright suite in `e2e/` that starts the **real backend and the real frontend** against a throwaway database and file folder, then drives Chromium.
- Scenarios E-01 to E-10 pass, including actual audio playback, seeking, repeat-one finishing a song, drag-and-drop reordering, and a reload that keeps your playlist and settings.
- An accessibility scan (axe, WCAG 2.1 A and AA) of the Library, Pool, Playlists, Playlist detail and player passes with no serious violations.
- A test-only `POST /api/v1/test/reset` endpoint exists **only** when the backend runs with `MUSIC_APP_ENV=test`; a backend test proves it is absent otherwise.
- 12 E2E tests pass (about 40 seconds). Totals so far: 171 backend, 116 frontend, 12 end-to-end.

**State after this step:** the whole stack is verified in a real browser. The remaining step is to compare what was built against the PRD.

**Things to notice**
- **The first run had 7 failures, and none were app bugs.** The tests assumed an order (oldest first) but the library lists newest first; one assertion matched two toasts; one test counted text that appeared twice. Fixing wrong expectations is normal on a first E2E run, and each fix was a decision about what the product *should* do.
- **The accessibility scan failed once for a good reason to investigate:** low contrast on text. It turned out to be a toast caught mid-fade-in, so the test now waits for toasts to disappear before scanning. Always find out *why* before silencing a check.
- **Why a reset endpoint instead of deleting files from the test:** it keeps the test independent of how the backend stores data, which is exactly the cloud-readiness goal.
- **Test data was kept small on purpose:** three 20-second MP3s (about 80 KB each), long enough to seek and to see time advance, short enough to let a song finish.


**Result:** [docs/REQUIREMENTS-STATUS.md](docs/REQUIREMENTS-STATUS.md), a traceability table for every requirement ID, plus non-functional and test-plan status. Nothing was fixed, as instructed.
- **Functional requirements:** 34 requirements: 29 done, 5 partial, 0 missing.
- **Partial:** bitrate not extracted (UC1-3); one progress bar per batch instead of per file (UC1-7); Media Session not verified in a real browser (UC2-9); add-to-playlist is one song at a time in the UI (UC4-1); the queue only updates for edits made in the same tab (UC5-6).
- **Test plan:** 104 of 117 case IDs are referenced by a test. The real gaps are CORS, an OpenAPI snapshot, malformed-response handling, concurrent playlist adds, and the 10k-song performance check.
- **Never done:** the orphan-file script, a Dockerfile, a performance budget, and a manual accessibility pass.

**State after this step:** every step in this file is complete. The app works end to end and is verified in a real browser. The PRD is out of date in the places listed under "Where the PRD no longer matches the code".

**Things to notice**
- **A report-first prompt is a safe prompt.** "Do not fix anything yet" turns the review into a decision list you can reorder, instead of a pile of changes you have to read.
- **Honest statuses matter more than a high score.** "Partial" and "not verified" are more useful to the next person than a column of ticks.
- **Counting is a review tool.** A small script compared the 117 case IDs in the PRD against the tests. That found gaps a read-through would have missed, and it is repeatable.
- **The final PRD drifted from the code in about eight places.** That is normal. The lesson is to schedule the update, not to avoid drift.

---

### Step 15 — Document the code base for the next person ✅ Used

**Goal:** Leave a guide that a new teammate, or another coding agent, can follow without asking you anything.

**Prompt**
```text
Once you're done, create an Agents.md file explaining how the code base works,
and how to run each component. For both windows and mac.
```

**Why it works:** It names the audience (a newcomer or an agent), the content (how it works, how to run it) and the platforms (Windows and macOS), so there is no guessing about scope.

**Result:** [Agents.md](Agents.md) at the repository root, covering prerequisites, architecture and layering, ports, configuration, run and test commands for the backend, frontend and end-to-end suite on both operating systems, conventions, common tasks and troubleshooting.

**Things to notice**
- **Writing for Windows exposed a Mac-only assumption.** The Playwright config used a Unix-only `env -u VIRTUAL_ENV` prefix and unescaped Windows paths. It now builds the environment in code and uses forward slashes, and the symlink test skips itself where symlinks need extra privileges. The 12 end-to-end tests still pass on macOS.
- **The guide is honest about what was verified:** all commands were run on macOS; the Windows ones were adapted but not run on Windows, and the file says so.
- **A message that arrives mid-task is part of the task.** This request was sent while Step 14 was finishing, and was handled as soon as that step was complete.

---

### Step 16 — Run the app with real data ✅ Used

**Goal:** See the app working with realistic content, not just passing tests.

**Prompts**
```text
Run the app both frontend and backend, load some dummy songs from the internet.
```
```text
did you run the app?
```

**Why it works:** the first prompt names both halves and the data source. The second is a good habit: when you are unsure whether something really ran, ask, and expect a fresh check rather than a recollection.

**Result:** the backend (port 8000) and frontend (port 5173) were started in the background and health-checked through the proxy. Five free sample tracks from SoundHelix (about 8 MB each) were downloaded into a separate folder outside the repository and uploaded through the real upload API. All five became songs in the collection (about 5 to 7 minutes each), and a Range request on one returned `206` with 100 bytes.

**Things to notice**
- **Downloaded files are untrusted data.** They went into their own empty folder and were uploaded through the API, never opened or run.
- **Answering "did you run it?" meant checking again.** Claude re-queried the health endpoints and the collection count instead of relying on what it had done earlier.
- **API checks are not a browser check.** Claude said it had not opened the app in a browser; the end-to-end suite is what drives one.
- **Running the full test script did not disturb the demo.** The browser tests use their own ports (8100 and 5273) and a throwaway database.

---

### Step 17 — A testing skill and a course guide ✅ Used

**Goal:** Turn the testing know-how from this build into something reusable, and explain the Claude Code features used so trainees can prepare.

**Prompt**
```text
Create a skill for testing the application. and create a document explaining what
features of claude codes we've used as part of building this application. This will
be given to trainees as prerequisites for the course as well as the course content.
```

**Why it works:** two deliverables, each with an audience and a purpose, in one request. The audience line ("prerequisites as well as course content") is what splits the document into Part A and Part B.

**Result**
- [.claude/skills/test-music-player/SKILL.md](.claude/skills/test-music-player/SKILL.md): decide the scope from the diff, run the right suites, diagnose failures using this project's known pitfalls, optional manual smoke test, and a fixed report format.
- [.claude/skills/test-music-player/scripts/run_checks.py](.claude/skills/test-music-player/scripts/run_checks.py): one cross-platform command that runs lint, types, backend tests, frontend tests, build and the browser tests, then prints a summary. It passed on macOS: 171 backend, 116 frontend and 12 browser tests.
- [docs/CLAUDE-CODE-FEATURES.md](docs/CLAUDE-CODE-FEATURES.md): prerequisites checklist, the features actually used mapped to steps in this file, the features available but not used, what went wrong and why, exercises, and a quick reference.

**Things to notice**
- **The skill's description is its trigger.** It is written as "use when asked to test, verify, check…", not as a summary of what it contains.
- **The skill is data and a script, not magic.** Everything it does can be done by hand with the commands in Agents.md; the skill makes it consistent.
- **The guide separates "used" from "available".** Teaching only what was exercised is honest; the list of unused features says where to go next.
- **Verified in Step 19:** the skill was loaded through Claude Code's skill mechanism and followed end to end. Matching from a plain-English request alone, without naming the skill, was not tested.

---

### Step 18 — Commit and push ✅ Used

**Goal:** Save the work to the remote repository safely.

**Prompt**
```text
commit the changes and push to remote.
```

**Why it works:** Committing and pushing affect other people, so Claude only does them when asked, and the request is short because the tool already knows the repository.

**Result:** one commit on a new branch, `feat/music-player-app`, pushed to `origin`. 169 files; GitHub returned the "open a pull request" link.

**Things to notice**
- **It branched instead of writing to `main`.** The repository was on the default branch, so Claude created a branch first and said why.
- **It looked before it staged.** It listed what would be committed, checked for dependencies, virtual environments, build output and your downloaded songs (all excluded), and confirmed the only audio files were small test fixtures.
- **The commit message explains what and why, and carries the co-author line.**
- **Pushing is a different permission from committing.** Both were requested in the same sentence here; if you only want a local commit, say so.

---

### Step 19 — Demonstrate the skill, update the records, commit again ✅ Used

**Prompts**
```text
please make sure prompts.md is updated with skill and anything else that i can demonstrate as a claude feature. include that in the claude code features.md as well.
```
```text
then commit latest+ push.
```

**Result**
- **The skill was run for real:** Claude loaded `test-music-player` and followed its own procedure: checked the git state (clean, on the feature branch), chose scope `all` because you asked to verify the whole app, ran the script, and reported. 171 backend, 116 frontend and 12 browser tests passed; nothing was skipped.
- **Records updated:** a feature-demo index (below), Steps 18 and 19, and new sections in [docs/CLAUDE-CODE-FEATURES.md](docs/CLAUDE-CODE-FEATURES.md).
- **Second commit pushed** to the same branch.

**Things to notice**
- **A skill is followed, not just read.** The loaded instructions steered the order of work (look at the diff first, then run, then report with real numbers).
- **A message sent mid-task was handled within the task:** "then commit latest + push" arrived while the skill was running, and was done after the verification finished, so the commit includes the verified state.

---

## Claude Code feature demo index

Short live demos for a trainer. Each takes a few minutes and uses this repository.

| Feature | How to demonstrate | Where it happened |
|---|---|---|
| Plan before code | Ask for a PRD for a small feature, "do not implement yet" | Step 1 |
| Interactive questions | Give a vague request and show the multiple-choice questions | Steps 1, 2 |
| Review-only prompt | "Report only; do not change anything" on `docs/PRD.md` | Steps 4, 14 |
| File tools | Ask for a one-line change and show the exact edit | all steps |
| Shell tool and evidence | "Run the backend tests and show me the output" | Steps 5 to 13 |
| Test-first loop | Ask for a new rule; watch the test fail, then pass | Step 6 |
| Diagnose test vs code | Break a rule on purpose; ask which side is wrong | Steps 11, 13 |
| Background tasks | Start the dev servers, keep working, then stop them | Steps 5.1, 16 |
| Editor context | Select lines in an open file and say "explain this" | Steps 4, 5 |
| Mid-task messages | Send a second request while a long task is running | Steps 15, 16, 19 |
| Skills | Type `/test-music-player`, or ask to "verify the app" | Steps 17, 19 |
| Documentation for agents | Open `Agents.md` and ask a fresh session to run the app from it | Step 15 |
| Safe git workflow | "commit and push": show the branch, the staged list, the message | Step 18 |
| Untrusted downloads | Download sample files and show they stay outside the repository | Step 16 |

---

## Open items (as of Step 14)

| Item | Where it came from |
|---|---|
| Update the PRD to match the code and the Step 4 decisions (status codes, `httpx2`, Node 22, `name_key`, `owner_id`, test reset endpoint) | Steps 4 to 13; listed in [docs/REQUIREMENTS-STATUS.md](docs/REQUIREMENTS-STATUS.md) |
| Close the five partial requirements: bitrate, per-file upload progress, Media Session in a real browser, multi-select add to playlist, cross-tab queue updates | Step 14 |
| Add the missing tests: CORS, OpenAPI snapshot, malformed API responses, concurrent playlist adds, 10k-song performance | Step 14 |
| Orphan-file script, Dockerfile, manual accessibility pass, Firefox and Safari runs | Step 14 |
| Open a pull request from `feat/music-player-app` into `main` and merge | Step 18 |

---

## Prompting Cheat Sheet

| Do | Example |
|---|---|
| Plan before code | "Starting with the PRD…" |
| Name the stack | "React, Vite, FastAPI, SQLite, pnpm" |
| Number your requirements | "1. Add songs… 2. Play a song…" |
| State future constraints | "scalable to cloud later, but not today" |
| Let Claude ask questions | "ask clarifying questions before writing" |
| Point to the plan | "Cover test cases B-UP-01 to B-UP-23" |
| Small steps | "Do not implement features yet" |
| Demand evidence | "Run the tests and show me the results" |
| Review before you build | "Tell me what is ambiguous or untestable" |
| Ask for explanations | "Explain in simple terms…" |
