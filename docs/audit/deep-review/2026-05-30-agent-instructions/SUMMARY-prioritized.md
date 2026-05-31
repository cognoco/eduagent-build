# Agent-Instructions Review — Prioritized Summary (2026-05-30)

Coordinator's holistic re-prioritization of the `agent-instructions` reviewer, plus manual
verification run at presentation time. Raw findings:
[`agent-instructions-reviewer.md`](./agent-instructions-reviewer.md).

**Scope:** whole-repo agent-instruction surface — `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md`,
`.deepsec/AGENTS.md`, 17 master skills (`.agents/skills/`) + 17 generated copies
(`.claude/skills/`), `sync-skills.mjs`, `.claude/settings*.json`, the `scope-keyword-check.sh`
hook, `.claude/commands/my/`, memory. Not a PR diff — all [PRE-EXISTING].

**Scope-brief correction (logged):** the coordinator's brief wrongly stated CLAUDE.md/AGENTS.md
are Ruler-generated. That note belongs to the **parent Nexus repo**, not this one — no
`.ruler/` exists here and these files are hand-maintained (as this repo's CLAUDE.md admits).
The reviewer caught and corrected this; H2 is judged against the hand-maintained model.

---

## P0 — Fix now (confirmed live credential exposure)

### C1 — Plaintext Logfire secret key in `.claude/settings.local.json`
- **Source:** agent-instructions-reviewer (CRITICAL) · **Verified by coordinator.**
- **Loc:** `.claude/settings.local.json:7` — a PowerShell permission allow-rule hard-codes a
  Logfire `pk-lf-…:sk-lf-…` pair (public + **secret** token), base64-joined.
- **Verification performed:**
  - File present; contains exactly 1 `sk-lf-` + 1 `pk-lf-` occurrence. *(secret value not
    reproduced anywhere in this archive)*
  - **Currently gitignored ✓ and untracked** — but `git log -- <path>` returns **≥3
    historical commits touching it**, so the secret was very likely committed at some point
    and lives in git history.
- **Failure mode:** a leaked `sk-lf-` Logfire ingest/write key permits telemetry
  injection/exfiltration against the project's Logfire account. Directly violates the repo's
  non-negotiable "all secrets via Doppler, never embed" rule.
- **Remediation (ordered):**
  1. **Rotate the `sk-lf-` key in Logfire** — only step that closes the exposure; human action.
  2. Remove the literal from `settings.local.json`; scope the permission to the command shape,
     source the token from Doppler/env at runtime.
  3. Decide on git-history scrub (BFG / `git filter-repo`) — matters most if the repo is
     shared/pushed.
- **Status:** ☐ open (rotation pending).

---

## P1 — Should fix

### H1 — `autoMemoryDirectory` points at the wrong checkout
- **Source:** agent-instructions-reviewer (HIGH) · **Verified: both trees exist on disk.**
- **Loc:** `.claude/settings.local.json:11` → `/Users/vetinari/_dev/eduagent-build/.claude/memory`,
  but the live repo is `/Users/vetinari/**nexus**/_dev/eduagent-build/...`.
- **Failure mode:** memory reads/writes silently land in a **different working tree** than the
  code being edited — no error surfaces, so memory can diverge from the code it documents.
- **Fix:** repoint to the canonical path, or make it `${CLAUDE_PROJECT_DIR}`-relative.

### H2 — CLAUDE.md ↔ AGENTS.md contradict on canonical skill paths + content
- **Source:** agent-instructions-reviewer (HIGH)
- Skill refs point to `.claude/skills/…` in CLAUDE.md but `.agents/skills/…` in AGENTS.md;
  AGENTS.md carries whole sections (Initialization, Repo Skills) absent from CLAUDE.md and
  vice-versa. Both resolve post-sync, but an agent reading one file is told a different
  source-of-truth than one reading the other — the "competing guidance" the override table
  exists to prevent.
- **Fix:** single source of truth (adopt Ruler here, or make one a thin pointer); use the
  runtime-neutral `.agents/skills/…` master path in both.

### M6 — `.deepsec/AGENTS.md` follows arbitrary `SETUP.md` / `node_modules` skill (injection channel)
- **Source:** agent-instructions-reviewer (MEDIUM → raised to P1 as a security/injection surface)
- **Loc:** `.deepsec/AGENTS.md:7-12` directs agents to read-and-**follow** per-project
  `data/<id>/SETUP.md` and `node_modules/deepsec/SKILL.md`. Attacker-influenceable content
  becomes executable agent instruction — classic indirect prompt injection. Blast radius
  limited (security-scanning workspace) but the trust grant is real.
- **Fix:** explicit trust boundary — those files are *data to act on*, never directives that
  can change safety rules/permissions.

### M5 — `scope-keyword-check.sh` references a non-existent skill + is trivially bypassed
- **Source:** agent-instructions-reviewer (MEDIUM → P1: dead instruction + guard hole)
- Hook tells the agent it "MUST invoke the `deep-scope-understanding` skill" — **no skill by
  that name exists** among this repo's 17 (renamed/removed → dead instruction). Its skip-regex
  exempts any prompt mentioning `commit`/`review`/`PR`/a `.md`/`.json` filename, so a
  scope-risky design request phrased with those words silently bypasses the guard.
- **Fix:** correct/remove the dangling skill name; tighten the skip regex so incidental
  mentions don't wholesale-exempt.

---

## P2 — Worth noting

- **M1/M2/M3 — Skill `description:` fields violate the repo's trigger-only rule.**
  `code-review` (pure workflow, no "Use when"), `thermo-nuclear-code-quality-review`
  (workflow lead-in), generated `.claude/skills/commit` copy (workflow summary — body
  divergence is the documented `SKIP_SKILLS` exception, but the *description* still breaks the
  rule), `worktree-setup` (narrates "creates a worktree… syncs secrets"). Mechanical rewrites.
- **M4 — Stale line-pinned citations in CLAUDE.md "Profile Shapes."** `_layout.tsx:122` is now
  `TabIcon(...)`, not the cited V0 helpers; tab sets actually at `navigation-contract.ts:146/152/163`.
  Cite by symbol name, or extend the existing `check-i18n-keep-rot.ts` cite-rot precedent.
- **L1** — `/my:commit-old` is forbidden by CLAUDE.md prose but `commit-old.md` is still
  installed/invocable; stub or delete it.
- **L2** — CLAUDE.md (333 lines) duplicates the audience matrix + Handy-Commands it also
  points to as canonical (paid every interaction).
- **L3** — `sync-skills.mjs` is additive-only; a removed master leaves an orphaned generated
  copy that `--check` won't catch; add a `--report-orphans` mode.

---

## Clean (verified by the reviewer)

`sync-skills --check` passes (36 files in sync, no master↔generated body drift beyond the
documented `commit` exception); all spot-checked CLAUDE.md doc/file citations exist;
committed `settings.json` is minimal/reasonable; command files correctly source secrets from
Doppler — **C1 is the sole secret-embedding exception**; memory frontmatter matches its schema.

---

## Severity summary (agent scale)
CRITICAL: 1 · HIGH: 2 · MEDIUM: 6 · LOW: 3
