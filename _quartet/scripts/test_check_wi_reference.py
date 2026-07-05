"""Unit tests for ``check_wi_reference`` — mechanical change control (WI-1357).

Pins the thing that must hold for the guardrail to be real, not aspirational:
- a commit that touches a `_quartet/` system file (anything under `_quartet/` except
  `_quartet/working/**`) without a WI-<digits> reference in its message is flagged (red case)
- the same file change with a WI reference in the message is not flagged (green case)
- a commit outside the protected surface (`_quartet/working/**` or outside `_quartet/`)
  is never flagged, regardless of message
- a merge commit whose conflict resolution touches the protected root is detected
  (regression guard for the merge-commit gap found on review)
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

import check_wi_reference as cwr  # noqa: E402


def _git(cwd: Path, *args: str, input_text: str | None = None) -> str:
    return subprocess.run(
        ["git", *args], cwd=cwd, capture_output=True, text=True, check=True, input=input_text
    ).stdout.strip()


def _commit_tree(cwd: Path, content: str, parents: list[str], message: str) -> str:
    """Build a commit with a single file at protected-root path, via plumbing —
    avoids depending on an actual `git merge` conflict-resolution UI."""
    _git(cwd, "read-tree", "--empty")
    blob = _git(cwd, "hash-object", "-w", "--stdin", input_text=content)
    _git(cwd, "update-index", "--add", "--cacheinfo", "100644", blob, "_quartet/roles/foo.md")
    tree = _git(cwd, "write-tree")
    parent_args = [arg for p in parents for arg in ("-p", p)]
    return _git(cwd, "commit-tree", tree, *parent_args, "-m", message)


def test_extract_wi_refs_finds_case_insensitive():
    assert cwr.extract_wi_refs("docs(quartet): tweak wording (wi-1357)") == ["wi-1357"]
    assert cwr.extract_wi_refs("no reference here") == []


def test_touches_protected_root():
    # every _quartet/ system area is protected — roles, library, examples, clacks,
    # scripts, and the root docs (operator ruling 2026-07-03)
    assert cwr.touches_protected_root(["_quartet/roles/orchestrator-protocol.md"])
    assert cwr.touches_protected_root(["_quartet/library/clacks-channel.md"])
    assert cwr.touches_protected_root(["_quartet/examples/executor-dispatch-example.md"])
    assert cwr.touches_protected_root(["_quartet/clacks/review-watcher.ts"])
    assert cwr.touches_protected_root(["_quartet/planning-rules.md"])
    # the working tree (channels, trackers, program artifacts) is the sanctioned
    # direct-write surface — never flagged
    assert not cwr.touches_protected_root(["_quartet/working/program/roster.md"])
    assert not cwr.touches_protected_root(
        ["_quartet/working/lanes/quartet-mvp/_state/inbox.jsonl"]
    )
    # and anything outside _quartet/ is out of this guard's scope
    assert not cwr.touches_protected_root(["README.md"])


def test_red_commit_touching_roles_without_wi_ref_is_flagged():
    commits = [
        {
            "sha": "deadbeef",
            "message": "docs(quartet): tweak wording\n",
            "files": ["_quartet/roles/orchestrator-protocol.md"],
        }
    ]
    violations = cwr.find_violations(commits)
    assert len(violations) == 1
    assert violations[0]["sha"] == "deadbeef"


def test_green_commit_touching_roles_with_wi_ref_is_not_flagged():
    commits = [
        {
            "sha": "cafef00d",
            "message": "docs(quartet): tweak wording (WI-1357)\n",
            "files": ["_quartet/roles/orchestrator-protocol.md"],
        }
    ]
    assert cwr.find_violations(commits) == []


def test_commit_outside_protected_root_is_never_flagged_regardless_of_message():
    commits = [
        {
            "sha": "1234567",
            "message": "chore: unrelated change\n",
            "files": ["README.md"],
        }
    ]
    assert cwr.find_violations(commits) == []


def test_mixed_batch_flags_only_the_offending_commit():
    commits = [
        {
            "sha": "good0001",
            "message": "docs(quartet): fold in scope (WI-1357)\n",
            "files": ["_quartet/roles/orchestrator-protocol.md"],
        },
        {
            "sha": "bad00002",
            "message": "docs(quartet): quick wording pass\n",
            "files": ["_quartet/roles/orchestrator-protocol.md"],
        },
    ]
    violations = cwr.find_violations(commits)
    assert [v["sha"] for v in violations] == ["bad00002"]


def test_merge_commit_conflict_resolution_touching_protected_root_is_detected(tmp_path, monkeypatch):
    _git(tmp_path, "init", "-q")
    _git(tmp_path, "config", "user.email", "test@example.com")
    _git(tmp_path, "config", "user.name", "Test")

    base = _commit_tree(tmp_path, "base\n", [], "base commit (WI-9999)")
    parent1 = _commit_tree(tmp_path, "left\n", [base], "left change (WI-9999)")
    parent2 = _commit_tree(tmp_path, "right\n", [base], "right change (WI-9999)")
    # Merge result differs from BOTH parents — the signature of a manual conflict
    # resolution, not a straight fast-forward inclusion from either side.
    merge = _commit_tree(tmp_path, "merged\n", [parent1, parent2], "Merge branch (no wi ref)")

    monkeypatch.chdir(tmp_path)
    commits = cwr._commits_in_range(f"{base}..{merge}")

    merge_commit = next(c for c in commits if c["sha"] == merge)
    assert "_quartet/roles/foo.md" in merge_commit["files"]

    violations = cwr.find_violations(commits)
    assert merge in [v["sha"] for v in violations]
