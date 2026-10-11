#!/usr/bin/env python3
"""Run the Music Player test suites and print one honest summary.

Usage:
    python run_checks.py [backend|frontend|e2e|all] [--skip-e2e] [--fail-fast]

Works on macOS, Linux and Windows. Standard library only.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

MIN_NODE = (22, 13)
ROOT = Path(__file__).resolve().parents[4]  # .claude/skills/<skill>/scripts -> repo root
IS_WINDOWS = os.name == "nt"


@dataclass
class Step:
    suite: str
    name: str
    cwd: Path
    cmd: list[str]
    summary_pattern: str | None = None  # regex to pull a result line from the output


@dataclass
class Result:
    step: Step
    ok: bool
    seconds: float
    detail: str
    tail: str


def clean_env(extra_path: str | None = None) -> dict[str, str]:
    env = dict(os.environ)
    env.pop("VIRTUAL_ENV", None)  # another project's venv makes uv warn on every call
    if extra_path:
        env["PATH"] = extra_path + os.pathsep + env.get("PATH", "")
    return env


def node_version(env: dict[str, str]) -> tuple[int, int] | None:
    node = shutil.which("node", path=env.get("PATH"))
    if not node:
        return None
    try:
        out = subprocess.run([node, "--version"], capture_output=True, text=True, env=env).stdout
        major, minor, *_ = (int(x) for x in out.strip().lstrip("v").split("."))
        return major, minor
    except (ValueError, OSError):
        return None


def find_node_bin() -> str | None:
    """Return a PATH prefix that makes Node >= 22.13 the default, if one is installed via nvm."""
    candidates: list[tuple[tuple[int, ...], Path]] = []
    for base in (Path.home() / ".nvm" / "versions" / "node",):
        if base.is_dir():
            for entry in base.iterdir():
                m = re.match(r"v(\d+)\.(\d+)\.(\d+)", entry.name)
                if m and (bin_dir := entry / "bin").is_dir():
                    version = tuple(int(g) for g in m.groups())
                    if version[:2] >= MIN_NODE:
                        candidates.append((version, bin_dir))
    return str(max(candidates)[1]) if candidates else None


def build_steps(suites: set[str], pnpm: str, uv: str) -> list[Step]:
    steps: list[Step] = []
    if "backend" in suites:
        be = ROOT / "backend"
        steps += [
            Step("backend", "lint (ruff)", be, [uv, "run", "ruff", "check", "."]),
            Step("backend", "types (mypy)", be, [uv, "run", "mypy"], r"Success.*|Found \d+ errors?.*"),
            Step("backend", "tests (pytest)", be, [uv, "run", "pytest", "-q"], r"\d+ (passed|failed).*"),
        ]
    if "frontend" in suites:
        fe = ROOT / "frontend"
        steps += [
            Step("frontend", "types (tsc)", fe, [pnpm, "typecheck"]),
            Step("frontend", "lint (oxlint)", fe, [pnpm, "lint"], r"Found \d+ warnings? and \d+ errors?.*"),
            Step("frontend", "tests (vitest)", fe, [pnpm, "test"], r"Tests\s+.*"),
            Step("frontend", "build (vite)", fe, [pnpm, "build"], r"built in .*"),
        ]
    if "e2e" in suites:
        steps.append(
            Step("e2e", "browser tests (playwright)", ROOT / "e2e", [pnpm, "test"], r"\d+ (passed|failed).*")
        )
    return steps


def run_step(step: Step, env: dict[str, str]) -> Result:
    started = time.time()
    try:
        proc = subprocess.run(
            step.cmd, cwd=step.cwd, env=env, capture_output=True, text=True, shell=IS_WINDOWS
        )
        output = (proc.stdout or "") + (proc.stderr or "")
        ok = proc.returncode == 0
    except OSError as exc:
        output, ok = f"could not start: {exc}", False

    plain = re.sub(r"\x1b\[[0-9;]*m", "", output)
    detail = ""
    if step.summary_pattern:
        matches = [m.group(0) for m in re.finditer(step.summary_pattern, plain)]
        detail = matches[-1].strip() if matches else ""
    tail = "\n".join(plain.strip().splitlines()[-25:])
    return Result(step, ok, time.time() - started, detail, tail)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("suite", nargs="?", default="all", choices=["backend", "frontend", "e2e", "all"])
    parser.add_argument("--skip-e2e", action="store_true", help="skip the slower browser tests")
    parser.add_argument("--fail-fast", action="store_true", help="stop at the first failing step")
    args = parser.parse_args()

    suites = {"backend", "frontend", "e2e"} if args.suite == "all" else {args.suite}
    if args.skip_e2e:
        suites.discard("e2e")

    # --- preflight ---------------------------------------------------------
    problems: list[str] = []
    extra_path = None
    env = clean_env()
    if suites & {"frontend", "e2e"}:
        version = node_version(env)
        if version is None or version < MIN_NODE:
            extra_path = find_node_bin()
            env = clean_env(extra_path)
            version = node_version(env)
        if version is None or version < MIN_NODE:
            problems.append(
                f"Node {MIN_NODE[0]}.{MIN_NODE[1]}+ is required (found "
                f"{'none' if version is None else f'{version[0]}.{version[1]}'}). "
                "Run `nvm use 22` (macOS: `nvm install 22`; Windows: nvm-windows) and retry."
            )
    pnpm = shutil.which("pnpm", path=env.get("PATH")) or "pnpm"
    uv = shutil.which("uv", path=env.get("PATH")) or "uv"
    if "backend" in suites and not shutil.which("uv", path=env.get("PATH")):
        problems.append("`uv` is not installed (macOS: `brew install uv`; Windows: `winget install astral-sh.uv`).")
    if suites & {"frontend", "e2e"} and not shutil.which("pnpm", path=env.get("PATH")):
        problems.append("`pnpm` is not installed (`npm install -g pnpm`).")
    for suite, folder in (("frontend", "frontend/node_modules"), ("e2e", "e2e/node_modules")):
        if suite in suites and not (ROOT / folder).is_dir():
            problems.append(f"{folder} is missing: run `pnpm install` in {suite}/.")
    if problems:
        print("PREFLIGHT FAILED\n" + "\n".join(f"  - {p}" for p in problems))
        return 2

    # --- run ---------------------------------------------------------------
    results: list[Result] = []
    steps = build_steps(suites, pnpm, uv)
    for index, step in enumerate(steps, 1):
        print(f"[{index}/{len(steps)}] {step.suite}: {step.name} ...", flush=True)
        result = run_step(step, env)
        results.append(result)
        print(f"      {'PASS' if result.ok else 'FAIL'} in {result.seconds:.1f}s {result.detail}", flush=True)
        if not result.ok and args.fail_fast:
            break

    # --- report ------------------------------------------------------------
    print("\n=== Summary ===")
    width = max((len(f"{r.step.suite}: {r.step.name}") for r in results), default=10)
    for r in results:
        label = f"{r.step.suite}: {r.step.name}"
        print(f"{'PASS' if r.ok else 'FAIL'}  {label.ljust(width)}  {r.detail}")
    skipped = [s for s in ("backend", "frontend", "e2e") if s not in suites]
    if skipped:
        print(f"NOT RUN: {', '.join(skipped)}")

    failures = [r for r in results if not r.ok]
    for r in failures:
        print(f"\n--- last output of {r.step.suite}: {r.step.name} ---\n{r.tail}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
