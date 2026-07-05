#!/usr/bin/env python3
"""Mechanical change-control check for `_quartet/` system files (WI-1357).

Guards against the WI-1245/WI-1357 breach class where an orchestrator direct-edits a
Quartet system file without going through the Cosmo Work Item lifecycle. The protected
surface is everything under `_quartet/` EXCEPT `_quartet/working/**` (the lanes' and
program's live working artifacts — channels, trackers, roster — which the orchestrator
and shepherds write directly by design). That covers `roles/`, `library/`, `examples/`,
`clacks/`, `scripts/`, and the root docs in one rule (operator ruling 2026-07-03). Any
commit that touches a protected file must reference a WI id (``WI-<digits>``,
case-insensitive) somewhere in its commit message. The check does not care whether the
referenced WI is real or in any particular Stage — it only enforces that a commit
*claims* lifecycle provenance, so the guardrail does not depend on the committer's
self-discipline to remember the rule.

Two call shapes:
  --commit-msg-file PATH   Local `commit-msg` git hook mode: validates the *staged*
                           changes against the message being written, before the commit
                           lands. Wired via `.githooks/commit-msg`
                           (`git config core.hooksPath .githooks` to enable).
  --range BASE..HEAD       CI mode: validates every commit in a git rev range. Wired via
                           `.github/workflows/quartet-change-control.yml`.

Exit code 0 = no violations, 1 = at least one violation (printed to stderr).
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

PROTECTED_PREFIX = "_quartet/"
EXEMPT_PREFIX = "_quartet/working/"
WI_REF_RE = re.compile(r"\bWI-\d+\b", re.IGNORECASE)


def extract_wi_refs(message: str) -> list[str]:
    """Return every WI-<digits> reference found in a commit message."""
    return WI_REF_RE.findall(message)


def is_protected(path: str) -> bool:
    """True for a `_quartet/` system file: anything under _quartet/ except working/."""
    return path.startswith(PROTECTED_PREFIX) and not path.startswith(EXEMPT_PREFIX)


def touches_protected_root(changed_files: list[str]) -> bool:
    """True if any changed file is a protected `_quartet/` system file."""
    return any(is_protected(f) for f in changed_files)


def find_violations(commits: list[dict]) -> list[dict]:
    """Given [{"sha", "message", "files"}, ...], return the ones missing a WI reference."""
    return [
        commit
        for commit in commits
        if touches_protected_root(commit["files"]) and not extract_wi_refs(commit["message"])
    ]


def _git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def _commits_in_range(rev_range: str) -> list[dict]:
    shas = [s for s in _git("log", "--format=%H", rev_range).splitlines() if s]
    commits = []
    for sha in shas:
        message = _git("log", "-1", "--format=%B", sha)
        files = [
            f
            # -c: for merge commits, diff-tree shows nothing by default. -c enumerates the
            # combined diff (paths that differ from every parent), which is exactly what a
            # manual conflict resolution touching a protected file looks like.
            for f in _git("diff-tree", "--no-commit-id", "--name-only", "-r", "-c", sha).splitlines()
            if f
        ]
        commits.append({"sha": sha, "message": message, "files": files})
    return commits


def _staged_commit(commit_msg_file: str) -> dict:
    message = Path(commit_msg_file).read_text(encoding="utf-8")
    files = [f for f in _git("diff", "--cached", "--name-only").splitlines() if f]
    return {"sha": "(staged)", "message": message, "files": files}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--range", metavar="BASE..HEAD", help="validate every commit in a git rev range")
    group.add_argument(
        "--commit-msg-file", metavar="PATH", help="commit-msg hook mode: validate staged changes"
    )
    args = parser.parse_args(argv)

    commits = _commits_in_range(args.range) if args.range else [_staged_commit(args.commit_msg_file)]

    violations = find_violations(commits)
    if violations:
        print(
            "Mechanical change control failed — commit(s) touching `_quartet/` system files "
            f"(`{PROTECTED_PREFIX}**` except `{EXEMPT_PREFIX}**`) must reference a WI id "
            '(e.g. "WI-1357") in the commit message:',
            file=sys.stderr,
        )
        for v in violations:
            first_line = v["message"].strip().splitlines()[0] if v["message"].strip() else "(empty message)"
            print(f"  {v['sha'][:12]}  {first_line}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
