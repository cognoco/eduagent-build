# 04 — Fable Brief

**Audit:** independent audit of the identity-v2 cutover + app-shell-v2, and the seam between them.
**Anchor:** **FROZEN at `origin/main` = `145e74d5e`** (repo `cognoco/eduagent-build`), 2026-07-02.
`main` advanced 3× during prep+review on this shared checkout; the bundle is frozen here rather
than chasing tip. Full delta + per-commit audit impact in `05-audit-response.md` § Frozen Anchor —
the only substantive commits are WI-1128 (journal-tail replayability → Q3-F7) and WI-367
(birth-date gating); the rest are mobile. Earlier packs cite ancestors `a52b8282f`/`a4798547e`.
**Your mandate:** This brief points you at terrain with fresh primary evidence — it does **not**
fence you in. Follow your own leads wherever they fall, re-read the primary sources, and revise
these findings and the Charter where reality differs. Prep did the discovery and breadth pass;
you bring adversarial judgment, verify the high-stakes/contested items, deepen where needed, and
produce the go/ship recommendations. Nothing here is a conclusion you must accept.

## One-page context

Two subsystems, built separately (operator: "not built to fit directly with each other"):
- **identity-v2** — new `person`/`organization`/`subscription`/`guardianship`/`consent_*` model
  (18 tables, 17 services) replacing legacy `accounts`/`profiles`/`family_links`/`consent_states`/
  `subscriptions`. Cutover is call-site-by-call-site — **no `IDENTITY_V2_ENABLED` runtime flag**
  (deleted, WI-868).
- **app-shell-v2** — the "mentor-is-the-app" 3-tab nav (Mentor/Subjects/Journal). **Production
  app-store builds render the legacy V0 shell**; all other JS channels render V2. Prod thus runs
  a legacy shell over a v2-only identity DB.

State in one breath: **live code is cut over (0 live legacy readers on origin/main), but the DB
cutover is staged and inconsistent across envs, the terminal migrations are out-of-journal, a
large dead legacy code subtree remains, the supporter half of V2 is the self-declared publish
gap, and both workstreams are still open.** Whether that adds up to "cutover done" and "V2
shippable" is your call.

## Final Charter (see `02-charter.md`)
Required: Q1 cutover completeness · Q2 schema/DB convergence · Q3 migration integrity ·
Q4 identity↔shell seam (operator priority). Timeboxed: Q5 AC/canon coherence · Q6 process state.
Synthesis: (a) identity-cutover go/no-go/conditional; (b) V2 ship/hold/conditional.

## Top findings (full list: `03-sonnet-breadth-findings.md`)

| ID | Finding | Sev | Conf | Your move |
| --- | --- | --- | --- | --- |
| SBF-001 | Orphaned legacy subtree loaded-but-dead; prod-500 if re-wired; resurrection already happened (WI-1255) | High | High | decide |
| SBF-002 | Journal doesn't reproduce prod/stg; **CI is journal-built → CI DB matches no deployed env** | High | High | decide (waive or block?) |
| SBF-003 | 3 envs, 3 cutover stages (prd>stg>dev); stg orphan `subscriptions`; dev fully legacy | High | High | decide |
| SBF-004 | Shell spec phase-gating premise falsified — shell already identity-v2-coupled, no S4 review | High | High | deepen |
| SBF-005 | `listProfilesV2` org-scoped (IDOR guard confirmed); residual = "one org = one household" invariant | Med | Med | verify invariant |
| SBF-006 | No RLS backstop + `isOwner` fails open → app-guards fully load-bearing (not a regression) | High | High | verify guards |
| SBF-007 | Canonical plan stale vs Cosmo; supporter-gap WIs closed-vs-unchecked | Med | High | verify done-conditions |
| SBF-008 | Cutover workstream open (WS-18 open; WI-1128 full promotion pending — slice landed) | Med | High | decide |

## Evidence packs
- `evidence/Q1-cutover-completeness.md` — 0 live legacy readers; dead legacy subtree inventory.
- `evidence/Q2-schema-db-convergence.md` — per-env catalog/FK/rowcount matrix (verified live).
- `evidence/Q3-migration-integrity.md` — `_freeze-only/` mechanism + reproducibility gap.
- `evidence/Q4-identity-app-shell-seam.md` — 6-row seam inventory + RLS/fail-open.
- `evidence/Q5-ac-canon-shipped-coherence.md` — plan-vs-Cosmo drift.
- `evidence/Q6-process-state-integrity.md` — WS-18/WS-28 rosters + materialized seam bugs.
- Maps: `artifacts/map-identity-v2.md`, `artifacts/map-appshell-seam.md`, `artifacts/rls-posture-note.md`.
- Raw: `queries/*.sql`, `artifacts/*.txt` (catalog, FK, rowcount, RLS, Cosmo TSV).

## Unresolved gaps prep hands you open
> Four cheap discovery gaps were CLOSED at audit close (2026-07-02) — see `05-audit-response.md`:
> `listProfilesV2` scoping (org-scoped IDOR guard), CI schema origin (journal-built → matches no
> deployed env), `updateAccountEmailFromClerk` (dead), e2e gating (registry-smoke opt-in). Those
> are now findings, not gaps. Genuinely open:

1. **Did WI-1170/1171 (supporter gaps) ship to the canonical plan's done-conditions?** — the
   pivotal ship-decision question; needs code-vs-done-condition read. (Raw WI-779/1170/1171 Cosmo
   records allowed; the strip-proposal analysis docs are NOT — see below.)
2. prd pre-drop Neon PITR marker for 0119 (rollback window closed if not taken) — operator/Neon.
3. What gates the *full* WI-1128 FK-repoint promotion? (Deploy-unblock slice `56b9ded15` landed; freeze-only 0117/0118/0119 still out-of-journal.)
4. Does the "one org = one household" invariant hold across child-creation paths? (SBF-005 residual.)

## Provenance & integrity
- Claims carry a source (file:line / command / DB query / Cosmo page) + confidence. **Caveat:**
  DB/CI/RLS checks have raw output persisted in `artifacts/*.txt`; the Q1 large static code sweeps
  cite file:line but did NOT persist every raw zero-result grep (the sub-agent returned a reduced
  summary). Two key Q1 greps were back-filled at audit close (`artifacts/q1-updateAccountEmail-trace.txt`,
  `ci-schema-build-evidence.txt`); the rest of Q1's negative results are reproducible from the cited
  commands but not all archived. Weight Q1's "zero live readers" as high-confidence-with-reproducible-
  -method rather than fully-archived.
- Live DB checks are from Doppler configs `stg`/`prd`/`dev`, 2026-07-02.
- Working-tree channel logs (`_wip/**/_state/*.jsonl`) were used only as timeline leads, not
  load-bearing truth (§11) — cross-checked against Cosmo/git/source.
- **§1 exclusion honored:** the WI-779 strip-proposal + critique docs were NOT read. Treat
  WI-779/WI-1239 as work-item IDs only; if you need WI-779, read its raw Cosmo record, not the
  excluded analysis. Contamination scan result recorded in the prep dir.
