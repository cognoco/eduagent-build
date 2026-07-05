"""Smoke test for the Quartet Codex runtime binding (WI-1543).

This resolves the Codex binding contract for orchestrator and shepherd roles without
launching Codex or any harness-specific primitive. It is intentionally static: the
check proves the Quartet Brain can find the binding and that the binding maps all
required primitives without depending on Claude Code Agent/Monitor semantics.
"""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BINDING_JSON = ROOT / "roles" / "runtime-bindings" / "codex.json"
BINDING_DOC = ROOT / "roles" / "runtime-bindings" / "codex.md"
REQUIRED_PRIMITIVES = {
    "dispatchExecutor",
    "monitorJob",
    "spawnFreshContextSession",
    "identifyOwnRuntime",
}
FORBIDDEN_BINDING_TERMS = {
    "Agent tool",
    "Claude Code Monitor",
    "subagent_type",
    "isolation:worktree",
}
ROLE_DOCS = [
    ROOT / "README.md",
    ROOT / "roles" / "orchestrator-protocol.md",
    ROOT / "roles" / "shepherd-protocol.md",
    ROOT / "roles" / "reviewer-protocol.md",
    ROOT / "roles" / "executor" / "executor-protocol.md",
]


def fail(message: str) -> None:
    raise AssertionError(message)


def walk_strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from walk_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_strings(child)


def resolve_for_role(binding: dict, role: str) -> dict:
    primitives = binding["primitives"]
    return {
        "role": role,
        "runtime": primitives["identifyOwnRuntime"]["runtime"],
        "claimant": primitives["identifyOwnRuntime"]["claimantPattern"].replace("<role>", role).replace("<scope>", "smoke"),
        "dispatch": primitives["dispatchExecutor"]["mode"],
        "monitor": primitives["monitorJob"]["mode"],
        "freshSession": primitives["spawnFreshContextSession"]["mode"],
    }


def main() -> None:
    binding = json.loads(BINDING_JSON.read_text(encoding="utf-8"))
    primitives = set(binding.get("primitives", {}))
    missing = sorted(REQUIRED_PRIMITIVES - primitives)
    if missing:
        fail(f"missing primitive(s): {', '.join(missing)}")

    invariant = binding.get("qualityInvariant", {})
    if invariant.get("reviewerRuntimeMustDifferFromExecutor") is not True:
        fail("reviewerRuntimeMustDifferFromExecutor must be true")
    if invariant.get("identitySource") != "identifyOwnRuntime":
        fail("quality invariant must use identifyOwnRuntime")

    text_blob = "\n".join(walk_strings(binding))
    for forbidden in FORBIDDEN_BINDING_TERMS:
        if forbidden in text_blob:
            fail(f"Codex binding depends on forbidden Claude Code-only term: {forbidden}")

    doc_text = BINDING_DOC.read_text(encoding="utf-8")
    for primitive in REQUIRED_PRIMITIVES:
        if primitive not in doc_text:
            fail(f"binding doc does not mention {primitive}")

    binding_ref = "roles/runtime-bindings/codex.md"
    for role_doc in ROLE_DOCS:
        if binding_ref not in role_doc.read_text(encoding="utf-8"):
            fail(f"{role_doc.relative_to(ROOT)} does not point at {binding_ref}")

    resolved = [resolve_for_role(binding, role) for role in ("orchestrator", "shepherd")]
    if any(row["runtime"] != "codex" for row in resolved):
        fail("resolved runtime must be codex")

    print(json.dumps({"status": "PASS", "resolved": resolved}, indent=2))


if __name__ == "__main__":
    main()
