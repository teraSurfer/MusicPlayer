# Claude Code features used to build the Music Player

**Audience:** trainees. Part A is the prerequisite reading (do it before the course). Part B is course content, to be taught and practised with the instructor.

**How to read this:** every feature below is tied to something that really happened while this app was built, with the step number from [Prompts.md](../Prompts.md). Features that were *not* used are listed separately in section 6 so you do not assume they were. The app was built with Claude Sonnet 5.5 in the Claude Code VS Code extension, on macOS.

---

# Part A: Prerequisites

## 1. What Claude Code is

Claude Code is an AI coding agent that works inside your project. It is different from a chat window:

| A chat assistant | Claude Code |
|---|---|
| Answers with text you copy and paste | Reads your files, edits them, runs commands, and reads the results |
| Cannot see your project | Works in your repository, with your tools |
| You verify everything yourself | It can run the tests and show you the output |

The loop it follows: **read the situation → decide → act with a tool → look at the result → continue.** Everything in this document is a variation of that loop.

## 2. Setup checklist

Complete these before the course and bring any errors to the instructor.

| # | Task | How to check |
|---|---|---|
| 1 | Claude Code installed and signed in (VS Code extension or terminal) | You can send a message and get a reply |
| 2 | Git installed, and you can run `git status` in a folder | Prints a branch name |
| 3 | Node.js 22.13+, pnpm | `node --version`, `pnpm --version` |
| 4 | Python 3.13+, uv | `python --version`, `uv --version` |
| 5 | You cloned this repository and read [Agents.md](../Agents.md) | You can name the three folders `frontend/`, `backend/`, `e2e/` and what each does |
| 6 | You ran the app once (backend on 8000, frontend on 5173) | Library page opens |
| 7 | You ran the tests once | `python .claude/skills/test-music-player/scripts/run_checks.py all` passes |

## 3. Vocabulary you need

| Term | Meaning here |
|---|---|
| **Prompt** | The instruction you give. Specific prompts get specific results. |
| **Tool** | An action Claude Code can take: read a file, edit a file, run a shell command, ask you a question. |
| **Permission** | Claude Code asks before risky actions (for example running commands). You approve or decline. |
| **Context** | What Claude can currently "see": your messages, files it has read, command output. It is limited, so be deliberate about what you load. |
| **Skill** | A saved set of instructions Claude loads when a task matches. Stored as a `SKILL.md` file. |
| **Subagent** | A separate Claude run given one focused job, whose result comes back to the main session. |
| **MCP server** | A plug-in that gives Claude extra tools (a browser, a document service, a database). |
| **Hook** | A script the tool runs automatically at fixed moments (for example at session start). |
| **PRD** | Product Requirements Document: what to build and how you will know it works. |

## 4. Four habits that matter more than any feature

1. **Plan before code.** A document is cheap to change; code is not.
2. **Be specific.** Name the stack, the files, the requirement IDs, the constraint.
3. **Ask for evidence.** "Run the tests and show me the results" beats "is it working?"
4. **You are the reviewer.** Claude can be confidently wrong. Read what it produces, especially summaries.

---

# Part B: Course content

## 5. Features we used, and where

### Overview

| # | Feature | Used for | Steps in Prompts.md |
|---|---|---|---|
| 1 | Prompting for a plan first (PRD) | Requirements, architecture, test plan before any code | 1, 2 |
| 2 | Interactive clarifying questions | Closing gaps in the request | 1, 2 |
| 3 | File tools (read, write, edit) | Creating and changing every file | all |
| 4 | Shell tool (commands) | Installing, migrating, testing, running servers | 5 to 14 |
| 5 | Background tasks | Running servers while continuing to work | 5.1, 16 |
| 6 | Test-first and verify loops | Backend, frontend, browser tests | 6 to 13 |
| 7 | Editor integration | Using your selection and open file as context | 4, 5, throughout |
| 8 | Automatic context | Git status, environment, session-start context | all |
| 9 | Mid-task messages | Adding requests while Claude is working | 15, 16 |
| 10 | Review-only prompts | Audit without changing code | 4, 14 |
| 11 | Project documentation as shared memory | PRD, Prompts.md, Agents.md, status doc | 2, 3, 14, 15 |
| 12 | Skills | A reusable testing procedure | 17 |
| 13 | Safe handling of untrusted input and outward actions | Downloads, no commits | 16 |

---

### 5.1 Plan first: the PRD prompt (Steps 1 and 2)

**What it is:** asking Claude to produce a design document before writing code.

**What we did:** the first prompt named the stack, numbered the five use cases, stated a *future* constraint ("scalable to cloud later, but nothing in the cloud today"), asked for a testing plan, and ended with "ask clarifying questions before writing". Claude produced [docs/PRD.md](PRD.md) with numbered requirements (`UC1-4`) and numbered test cases (`B-UP-11`).

**Why it matters:** those IDs became the spine of the project. Later prompts said "cover test cases B-UP-01 to B-UP-23", and the final review counted how many IDs had tests.

**Try it:** write a first prompt for a small feature (a "favourites" list). Include stack, numbered requirements, one future constraint, and "ask questions first".

**Pitfall:** the prompt said "4 use cases" and listed 5. Claude noticed. Do not rely on that: re-read your own prompt.

### 5.2 Interactive clarifying questions (Steps 1 and 2)

**What it is:** Claude can stop and ask you structured multiple-choice questions, with a recommended default and a free-text "Other" option.

**What we did:** four questions: single user or accounts, what "the pool" means, audio formats, where the PRD lives. The answers changed the data model (pool vs. collection) and scope (no auth, with a reserved `owner_id`).

**Why it matters:** a question costs seconds; a wrong assumption costs a rewrite. Claude used the tool only for decisions that were genuinely yours; things with a conventional default were decided and *written down* as assumptions instead (PRD section 1.4).

**Try it:** ask Claude for a feature with a deliberately vague word ("share"). See what it asks.

### 5.3 File tools: read, write, edit

**What it is:** dedicated tools for reading files, creating files and making exact string replacements. Claude prefers these over shell commands like `cat` or `sed` because they are clearer and safer.

**What we did:** every source file, migration, test and document was created or edited with these tools. Edits require reading the file first and replace an exact, unique piece of text.

**Why it matters:** you can read the diff. Each change is small and attributable.

**Pitfall:** the edit tool fails if the text it wants to replace is not unique or not exactly as in the file. That is a safety feature, not a bug.

### 5.4 The shell tool

**What it is:** Claude runs commands and reads their output. Each call is subject to your permission settings.

**What we did:** `uv sync`, `pnpm install`, `alembic upgrade head`, `pytest`, `vitest`, `playwright test`, `curl` for API checks and for downloading sample songs, `ffmpeg` to generate test audio.

**Why it matters:** this is what turns "I think it works" into "171 tests passed". It also finds environment problems, such as the Node 20 vs. Node 22 mismatch in Step 5, that no amount of reading code would reveal.

**Try it:** ask Claude to run only the backend upload tests and summarise the failures, if any.

**Pitfall:** commands run on *your* machine. Read what you approve, especially anything that deletes, installs globally, or contacts the network.

### 5.5 Background tasks (Steps 5.1 and 16)

**What it is:** a long-running command (a server) can run in the background while Claude keeps working, and Claude is notified when it exits.

**What we did:** the backend and frontend dev servers were started in the background, checked with `curl`, and stopped on request ("stop it and let's do step 6").

**Why it matters:** you can run and test an app in one session. Know what is left running: stopping the servers was an explicit instruction, and a stray server shows up as a notification when it is killed.

### 5.6 Test-first and verify loops (Steps 6 to 13)

**What it is:** a working method, not a button. Claude writes the test, runs it to see it fail, implements, runs again, and reports.

**What we did:**
- Step 6: storage tests were written and shown failing with import errors before the implementation existed.
- Step 7: real audio fixtures were generated with ffmpeg so upload tests used real files.
- Step 11: the first frontend run had 6 failures, each diagnosed rather than patched over.
- Step 13: the first browser run had 7 failures, **none of them app bugs**; the tests had wrong expectations.

**Why it matters:** a green suite means something only if you know why a red one went red. A test that merely checked that a filename appeared passed while uploads were failing; it was strengthened.

**Try it:** break a rule on purpose (make "previous" always go back). Ask Claude to find which test fails and why.

### 5.7 Editor integration (throughout)

**What it is:** in the VS Code extension, Claude sees the file you have open and the text you have selected, and references code with clickable links.

**What we did:** you selected lines of Prompts.md and pasted them as the prompt for Steps 4 and 5; selected text told Claude *which* step you meant.

**Why it matters:** "this function" and "these lines" become unambiguous. The context is attached automatically, but it only *may* be relevant; say what you want done with it.

### 5.8 Automatic context

**What it is:** at the start of a session Claude receives a snapshot of its surroundings: the working directory, the platform, whether it is a git repository, the branch and a short status, and context from any plugin hooks.

**What we did:** Claude knew from the first message that the repository was clean on `main` with one commit, which is why it described everything as "uncommitted" later.

**Why it matters:** it explains why Claude often "already knows" things. It also means the snapshot goes stale: it is a photograph from session start, not a live view.

### 5.9 Mid-task messages (Steps 15 and 16)

**What it is:** you can send a message while Claude is working. It arrives alongside the next tool result and is handled within the same task.

**What we did:** "create an Agents.md file" arrived during the review step and was done as soon as that step finished. "Did you run the app?" arrived while the testing skill was being built and was answered immediately, with a fresh check of the servers rather than from memory.

**Why it matters:** you do not have to wait. Keep each message self-contained so it still makes sense out of order.

### 5.10 Review-only prompts (Steps 4 and 14)

**What it is:** asking for analysis with "do not fix anything yet".

**What we did:** Step 4 reviewed the PRD's assumptions and found a real data-model bug (NULL `owner_id` defeats a uniqueness rule). Step 14 produced a requirement-by-requirement status table: 29 done, 5 partial, 0 missing, and 13 test-case IDs not referenced by any test.

**Why it matters:** you stay in control. The output is a decision list you can reorder.

**Try it:** ask Claude to count which numbered PRD requirements have no test. Note that it can *script* the count rather than estimate it.

### 5.11 Project documents as shared memory

**What it is:** a model has no memory between sessions beyond what is in files. Writing decisions down is how knowledge persists.

| File | Purpose |
|---|---|
| [docs/PRD.md](PRD.md) | What and why; requirement and test IDs |
| [Prompts.md](../Prompts.md) | The prompts used and what each produced |
| [docs/REQUIREMENTS-STATUS.md](REQUIREMENTS-STATUS.md) | Built vs. planned |
| [Agents.md](../Agents.md) | How the code works and how to run it, for people and for coding agents |

**Pitfall:** documents drift. By Step 14 the PRD no longer matched the code in about eight places. Schedule updates.

**Note on file names:** `Agents.md` is a tool-neutral convention for instructions to coding agents. Claude Code also has its own project-instructions file, `CLAUDE.md` (create one with `/init`). We did not create a `CLAUDE.md` in this project; a one-line file pointing to `Agents.md` would be a sensible addition.

### 5.12 Skills (Step 17)

**What it is:** a folder containing a `SKILL.md` file with a name, a description and instructions. When a request matches the description, Claude loads the instructions; you can also invoke one by name with `/skill-name`.

**What we did:** [.claude/skills/test-music-player/SKILL.md](../.claude/skills/test-music-player/SKILL.md) tells Claude how to decide what to test from the diff, how to run all suites with one script, how to diagnose failures using this project's own pitfalls, and how to report honestly. A helper script, `scripts/run_checks.py`, runs everything on macOS or Windows.

**Why it matters:** a skill encodes your team's procedure once. The description is what makes it trigger, so write it as *when to use this*, not *what this is*.

**Try it:** run `/test-music-player`, then change the description line to something vague and see whether it still triggers on "check my change".

### 5.13 Handling untrusted input and outward actions (Step 16)

**What we did:**
- Sample songs were downloaded into their own empty folder outside the repository and never executed. Files from the internet are data, not instructions.
- Nothing was committed, pushed or published. Those are actions that affect other people, and Claude commits only when you ask.
- The test-only reset endpoint exists only under `MUSIC_APP_ENV=test`, and a test proves it is absent otherwise.

**Why it matters:** the more autonomy you give an agent, the more important it is that destructive and outward-facing actions are explicit.

---

## 6. Available features we did not use

Know these exist; some would have helped.

| Feature | What it is | Where it would have helped here |
|---|---|---|
| **Plan mode** | Claude proposes a plan and waits for approval before editing | Before the large Step 11 and 12 UI work |
| **Subagents** | Separate focused runs, possibly in parallel | Backend and frontend steps were independent after the API contract existed |
| **Workflows** | A script that orchestrates many subagents | Reviewing each requirement area in parallel in Step 14 |
| **Code review skills** (`/code-review`, `/security-review`, `/simplify`) | Review a diff for bugs, security issues or needless complexity | Before committing; especially the upload path |
| **`/init`** | Generates a `CLAUDE.md` describing the repository | Would give every future session the project rules |
| **Persistent memory** | Notes that carry between sessions | Recording preferences such as "ask before changing the PRD" |
| **MCP servers** | Extra tools, such as browser automation or document services | Driving the real UI manually; we used Playwright instead, which is repeatable |
| **Hooks and settings** | Automatic actions and permission rules in settings files | Auto-running lint after edits; allow-listing safe commands (`/fewer-permission-prompts`) |
| **Git worktrees** | Isolated working copies for parallel work | Trying two designs for reorder UX side by side |
| **Scheduled and looping tasks** (`/loop`, `/schedule`) | Run a prompt on an interval | Nightly test runs |
| **Committing and pull requests** | Claude can commit and open PRs when asked | We deliberately left everything uncommitted |

Ask the instructor which of these the course will cover; check `/help` in your installed version for the commands available to you.

---

## 7. Step-by-step map: course content

| Step | What happens | Features exercised |
|---|---|---|
| 1 to 2 | PRD with clarifying questions | Planning prompt, interactive questions, file write |
| 3 | Change a requirement | Targeted edit, propagating a change through a document |
| 4 | Review assumptions | Review-only prompt |
| 5, 5.1 | Scaffold, then run and verify | Shell, environment problems, background tasks |
| 6 to 9 | Backend: storage, upload, streaming, playlists | Test-first loop, real fixtures, property-based tests |
| 10 to 12 | Frontend: player, library, playlists | Pure-logic separation, fake API, accessibility |
| 13 | Browser tests | Real servers, real audio, diagnosing test-vs-code |
| 14 | Requirement audit | Review-only prompt, scripted counting |
| 15 | Agents.md | Documentation for the next person; cross-platform thinking |
| 16 | Run the app and load songs | Background processes, safe downloads |
| 17 | Testing skill and this document | Skills |

## 8. What went wrong, and what it teaches

| What happened | Lesson |
|---|---|
| The newest toolchain needed Node 22; the machine had Node 20 | "Use the latest versions" has a cost. Let the tool report the error and decide. |
| A test passed while uploads were failing | A test must assert the outcome, not just that something rendered. |
| 7 browser tests failed on first run; none were app bugs | First E2E runs mostly debug the *tests*. Decide each time which side is wrong. |
| The PRD left several status codes as "either/or" | Ambiguity in the document becomes a decision made quietly in code. Write the decision down. |
| The Windows guide needed config changes | Writing for another platform finds assumptions you did not know you made. |
| Everything was verified on macOS only | Say what you did not verify. The guide says so. |

## 9. Exercises

**Before the course (prerequisites)**
1. Run the full test script and paste the summary to the instructor.
2. Open [docs/PRD.md](PRD.md) and find requirement `UC2-5`. Find the test that covers it.
3. Open [Prompts.md](../Prompts.md) and write down, for Step 7, what the prompt asked Claude to *cover* and how you could tell it did.

**In the course**
1. **Write a prompt.** Add a "Favourites" feature. Include stack, numbered requirements, one future constraint, a test plan, and "ask questions first". Compare with a peer's.
2. **Audit.** Pick a requirement marked "partial" in [docs/REQUIREMENTS-STATUS.md](REQUIREMENTS-STATUS.md) and write the prompt that would close it, including how you will verify it.
3. **Break and diagnose.** Introduce a bug on purpose; ask Claude to find it using only the test output. Was the failing test the right one?
4. **Write a skill.** Create a skill for "review this change against the PRD". Decide what its description must say for it to trigger.
5. **Challenge a claim.** Ask Claude "is feature X done?". Then check the answer yourself with a command. Where did they differ?

## 10. Quick reference

| I want to... | Do this |
|---|---|
| Run every check | `python .claude/skills/test-music-player/scripts/run_checks.py all` |
| Run the app | See [Agents.md](../Agents.md), sections 4 and 5 |
| Know what changed | `git status --short` |
| Make Claude plan first | Say "do not implement yet" and ask for a plan or document |
| Make Claude verify | Say "run the tests and show me the output" |
| Keep Claude from fixing | Say "report only; do not change anything" |
| Reuse a procedure | Put it in a skill |
| Find what is untested | Ask Claude to script a count of requirement IDs vs. tests |
