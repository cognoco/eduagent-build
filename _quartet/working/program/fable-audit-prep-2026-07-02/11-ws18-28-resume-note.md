# 11 — Resume Note: WS-18 (Identity Cutover) + WS-28 (V2 Finalization)

**To:** the orchestrator over WS-18 + WS-28. **From:** the convergence audit (Jörn's authority).
**Date:** 2026-07-02. **The pause is LIFTED** — resume pulling, under the sequence below.

## Why you were paused, and what changed
You were held from pulling new items while a single **convergence spine** was written and reconciled
against the queue. That's done and **operator-ratified**:
- **Authority:** `08-convergence-spine.md` (the spine — read §1, §4, §6) + `10-spine-cosmo-reconciliation.md`
  (the map — how every item classifies). Where any older plan/dossier conflicts with the spine, **the spine
  wins** and the other doc is the bug.
- **Two corrections baked in:** the supporter gap is **closed** (not a blocker); the cutover is **done at the
  live-code level** — your remaining work is *convergence + deletion*, not construction.

## The sequence you now execute (milestone order — this replaces prior sequencing)
```
M1 seam-hardening (parallel, new "Seam Hardening" WS — NOT yours)
M2a journal-prep  → M2b env-apply → M3 strip-legacy        ← WS-18 core
M4 prove-fallback → M5 retire-V0  → M6 ship-V2             ← WS-28 core
   (M4 gates BOTH M5 and M6 — no retire/ship without a proven rollback)
```

### WS-18 (Identity Cutover) — the DB/code collapse
Pull in this order; respect the gates:
- **M2a (reversible):** `WI-1128` (0129 FK-repoint — **now unblocked**, all 3 blockers closed; its
  "await spine" hold is satisfied), `WI-1288` (concepts→person FK), `WI-1306` (**NEW** — CI-schema fidelity:
  promote the `_freeze-only` migrations into the journal so CI stops testing a phantom schema; this also
  fixes the staging-red).
- **M2b (IRREVERSIBLE — human-confirm each):** `WI-1141` (dev flip to v2-only), `WI-1250` (drop orphan stg
  `subscriptions`), `WI-1292` (apply 0130 legacy DROP — HELD, stays human-confirmed). Each destructive apply
  needs a fresh PITR marker + live-catalog spot-check + explicit human go.
- **M3 (reversible via tag):** `WI-779` (WP-FLAG strip umbrella), `WI-1139` (remove legacy schema defs).
  **Preservation gate:** the strip introduces `docs/archive/retired-code.md` and a pushed annotated tag —
  **no delete lands without its tag + register entry** (spine §6.6). A backup *branch* is banned.
- Also here: `WI-781` (concept-capture decision, gated on the FK repoint), `WI-752` (ADR governance re-vet —
  coordinate with promoting spine 08 → `MMT-ADR`), `WI-1162` (v2 export-columns decision).

### WS-28 (V2 Finalization) — prove rollback, then retire V0, then ship
- **M4 (reversible):** `WI-1307` (**NEW** — build a `V2=off/V1=on` channel + a real E2E pass). Config F is
  **UNPROVEN today** — no env runs it; rollback is OTA channel-promotion of a *prebuilt tested* bundle, so it
  must exist as an artifact first. **This gates M5 and M6.**
- **M5 (IRREVERSIBLE — human-confirm):** `WI-1308` (**NEW** — retire V0 + flags-off shell). Ruled: **before
  ship**, gated on M4. Same preservation gate (tag + register entry).
- **M6 (reversible — unship = OTA):** ship V2. Gate = M1+M4+M5 done, seam smoke PR-gated, 7 publish prompts
  green (already are). **Supporter S0–S5 surfaces are IN the MVP** (operator ruling) — the supporter build
  items (WS-32: WI-1121/1127/1134/1135/1136/1137) are in ship scope; coordinate with WS-32's orchestrator.
- Note: `WI-904` (dictation pacing) has left WS-28 → WS-33 (it was mis-shelved; it's UX, not finalization).

## Prioritize immediately (active P1 breakage, safe now, outside any gate)
- **`WI-1167`** — staging deploys are RED (*"relation public.profiles does not exist"*). This is the phantom-
  schema class (R3) biting for real; **`WI-1306` is its structural fix.** Unblock staging first.
- **`WI-1176`** — supporter self-unlink route 500s (P1). (WS-29, not yours, but flagging — it's live.)

## Do NOT pull (held for operator triage)
- **Compliance dedup** — WS-30 `11xx` vs WS-29/30 `119x` are a duplicate generation; leave until the operator
  rules which to keep/merge.
- **`WI-1249`** — empty/null item pending operator repair or delete.
- **`WI-770`** — Cosmo-tooling item, likely re-homing to Nexus; leave.

## One-line
Resume under the milestone order; reversible work flows; the two irreversible gates (M2b DB drops, M5 V0-retire)
and the preservation gate (tag + register on every strip) stay on explicit human confirm; unblock staging
(WI-1167) first.
