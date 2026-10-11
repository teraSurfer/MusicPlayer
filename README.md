# MusicPlayer

A local music player: React + TypeScript + Vite frontend, FastAPI + SQLite backend.
See [docs/PRD.md](docs/PRD.md) for requirements and the testing plan.

## Prerequisites
- Node 22.13+ (`nvm use` reads `frontend/.nvmrc`), pnpm
- Python 3.13+, [uv](https://docs.astral.sh/uv/)

## Backend (`backend/`)
```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload      # http://localhost:8000/api/v1/health
uv run pytest                             # tests
uv run ruff check . && uv run mypy        # lint + types
uv run alembic upgrade head               # migrations
```

## Frontend (`frontend/`)
```bash
cd frontend
pnpm install
pnpm dev                                  # http://localhost:5173 (proxies /api to :8000)
pnpm test                                 # tests (Vitest)
pnpm typecheck && pnpm lint               # types + lint
pnpm build
```

## End-to-end tests (`e2e/`)
Starts the real backend (port 8100, throwaway data in `e2e/.data`) and frontend (port 5273), then drives Chromium.
```bash
cd e2e
pnpm install
pnpm exec playwright install chromium   # once
pnpm test
```

## Docs
- [Agents.md](Agents.md): how the code works and how to run each part (macOS and Windows)
- [docs/PRD.md](docs/PRD.md): requirements, architecture and test plan
- [docs/REQUIREMENTS-STATUS.md](docs/REQUIREMENTS-STATUS.md): what is built vs. the PRD
- [docs/PRD-Trainer-Questions.md](docs/PRD-Trainer-Questions.md): discussion questions for trainees
- [docs/CLAUDE-CODE-FEATURES.md](docs/CLAUDE-CODE-FEATURES.md): the Claude Code features used to build this app (trainee prerequisites and course content)
- [.claude/skills/test-music-player/](.claude/skills/test-music-player/SKILL.md): testing skill and one-command check script
- [Prompts.md](Prompts.md): the prompts used to build this app, step by step
