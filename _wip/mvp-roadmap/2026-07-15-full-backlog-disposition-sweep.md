# Full-backlog disposition sweep — every open item gets an in/out ruling

**Status:** PROPOSED-FOR-RULING (lockdown sitting, replaces LD4 as framed in the pre-read)
**Date:** 2026-07-15
**Ruling protocol:** rule §A (operator calls) and §B (closes) individually; §C/§D are batch-accept-with-exceptions.

**Why this exists.** The lockdown pre-read used Priority as a scoping proxy ("32 old P3s stay unassigned"). The operator rejected that model: the scoping sequence is *deliver at all? → MVP or post-MVP? → dependencies → grouping* — priority is a capture-time urgency guess with no scoping authority. This sweep applies that sequence to **every open item never explicitly ruled in/out**.

**Population math (239 open):** 28 scope-wave items (ruled at sittings 1–2) + 18 Post-MVP pen members (ruled OUT) + 81 Ready/Executing/In Review (**presumed IN via the refine/execution stage-gate — operator may veto this presumption**) + **116 swept here** (64 Captured / 41 Backlog / 11 Refining, pre-wave, never ruled).

**Method:** 5 parallel reviewers, each grounding every call in the ratified MVP capability tree (`docs/plans/2026-07-10-mvp-roadmap/MVP-DEFINITION.md`, IN/DEGRADED/OUT/FILL semantics) + RUNWAY.md; Priority ignored throughout; truncated descriptions fetched in full from Cosmo where ambiguous. ⚠ = reviewer flagged low/medium confidence (24 of 116) — worth a second look before batch-accept.

**RULED + EXECUTED 2026-07-15 (batch-accept with one exception).** Final totals: **MVP 50** (46 + WI-1378 close-rejected + WI-1292 + WI-1898-floor + WI-1870 flipped at batch-accept to Core Learning Loop) · **Post-MVP pen 62** (+ WI-2115, the WI-1898 recovery/FP slice, captured to the pen) · **Closed 3** (WI-1452 Duplicate→WI-1704; WI-1867, WI-2013 Cancelled umbrellas — completeness checks passed) · **Zuzka 1** (WI-1897 → OPQ-117). Execution: 112 placements (61 triage, 51 workstream patches), 0 failures. Every open MentoMate item now carries an explicit in/out ruling, a stage-gate rationale, or a named escalation.

**Original proposed totals:** MVP 46 · Post-MVP pen 63 · Close 4 · Operator calls 3.
MVP additions by lane: Launch Readiness 9 · Core Learning Loop 8 · Safety & Eval 7 · Dev-Infra & Tooling 7 · Compliance-Eng 5 · Mobile UX & Nav 3 · Supporter & Linking 3 · Identity Cutover 2 · Store Billing & Release 2.

**Supersedes:** the pre-read §4 LD4 table. Sweep deltas vs that table: WI-1897 → operator call (was Mobile UX), WI-1899 → post-MVP (was Core Learning Loop), WI-1808 → post-MVP (was Dev-Infra), WI-2013 → close as umbrella (was deliberately-unassigned). WI-1807/1826/1900/1901 → Safety & Eval and WI-1864 → Dev-Infra are confirmed by the sweep.

### A · Operator calls (3)

> **WI-1292 ruling (2026-07-15): Option 1 — MVP window, Identity Cutover lane.** Scoping only: the HELD triple gate (fresh PITR snapshot + catalog spot-check + explicit operator confirmation at apply time) is unchanged; sequenced after WI-1306, preferably after WI-2056 (PITR runbook) exists. Note: item re-scoped 2026-07-03 — dev-branch apply only; prod/staging already clean.
>
> **WI-1898 ruling (2026-07-15): Option 2 — SPLIT.** Floor slice (block-copy audit + graceful judge-unavailable fallback) → MVP, Safety & Eval. Recovery affordance + FP instrumentation → Post-MVP pen (FP-proxy event may ride WI-1901 if trivial). No safety gate weakened — recovery UX only. Split executed with the batch.
>
> **WI-1897 ruling (2026-07-15): ESCALATED TO ZUZKA (product).** Operator narrowed to Option 1 (all-in-MVP, Mobile UX & Nav) vs Option 2 (split: cap-hit floor → MVP; parent value-handoff card + funnel → pen, tree-kill-adjacency noted). Hex recommendation: Option 2. Zuzka escalations collected at end of sitting.

| WI | Stage | Current lane | Item | Question |
|---|---|---|---|---|
| WI-1897 | Captured | (unassigned) | Cap-hit UX + parent value-handoff card | MVP-gating (primary conversion moment, caps live §8) or fast-follow? Overlaps §4-killed 'parent cap-banner actions' — confirm distinct. |
| WI-1898 | Captured | (unassigned) | Safety false-positive recovery UX for soft-blocked questions | Not in ratified tree; scope call — ship FP-recovery UX before closed beta (trust risk) or defer? ⚠ |
| WI-1292 | Backlog | Identity Cutover | Apply 0130 legacy-table DROP (HELD, irreversible) | Irreversible legacy-table drop: execute pre-launch while cheap (zero users) or defer post-launch once identity spine lands? |

### B · Close proposals (4)

> **§B ruling (2026-07-15): approved as recommended.** WI-1452 close as duplicate-of WI-1704 (executes the 2026-07-10 tree ruling). WI-1867 + WI-2013 close as retired umbrellas, each behind a close-time completeness check (untracked findings get captured first). **WI-1378 close REJECTED on fact-check** — the test file exists on main and the broken-guard premise is live; reclassified MVP → Identity Cutover. Closes execute via the governed triage/review path citing this sitting — no agent-asserted closes.

| WI | Stage | Current lane | Item | Why close |
|---|---|---|---|---|
| WI-1378 | Refining | Identity Cutover | profile-isolation.integration.test.ts stale premise | Named test file absent from main; as-filed premise invalid. Recast separately if a real gap surfaces. |
| WI-1867 | Captured | (unassigned) | Full-repo 15-lens code review — findings umbrella | Tracking umbrella only; findings tracked as individual WIs (cf. tree's umbrella-retire pattern). |
| WI-1452 | Refining | Core Learning Loop | Evidence-citation loop substrate (fold into WI-1704) | Tree §3 explicit: overlaps WI-1704 — fold/duplicate into it in Cosmo, do not execute separately. |
| WI-2013 | Captured | (unassigned) | Umbrella: /improve audit remediation batch (WI-1985..2012) | Tracking umbrella only, mirrors WI-1657 pattern; children individually dispositioned in this sweep, retire wrapper. |

### C · MVP (46) — by proposed lane

| WI | Stage | Current lane | → Lane | Item | Rationale |
|---|---|---|---|---|---|
| WI-1577 | Refining | Compliance-Eng | Compliance-Eng | Launch compliance closure — FINAL GATE re-run | Tree §10 store-submission blocker; Runway Wave 3 names WI-1577 explicitly as the final gate. |
| WI-1985 | Backlog | Compliance-Eng | Compliance-Eng | Tear down guardian/supporter edges in person-scoped deletes | Erasure never completes for managed children today; ties to THE compliance launch gate (§10 C-5). Prior ruling: must-have. |
| WI-1990 | Backlog | Compliance-Eng | Compliance-Eng | Strip learner free-text PII from Sentry (API-side scrubber) | Undermines tree §9 minor-PII protection stance; mobile side already scrubs. Prior ruling: must-have. |
| WI-1987 | Backlog | Compliance-Eng | Compliance-Eng | Plaintext transcript persistence in AsyncStorage | Item's own audit ruling: MVP must-have — unencrypted PII/session-transcript persistence, live security gap. |
| WI-1988 | Backlog | Compliance-Eng | Compliance-Eng | Delete minors' homework photos from device cache | Unbounded retention of minors' cached images is a DPIA (§10 THE launch gate) risk; /improve audit ruled MVP must-have. |
| WI-1994 | Backlog | Core Learning Loop | Core Learning Loop | getSubjectProgress should read latest curriculum version | Correctness bug in live curriculum/progress feature (tree §5 IN); two screens can disagree on the same learner's progress. ⚠ |
| WI-2009 | Backlog | Quartet Runtime | Core Learning Loop | Make review-calibration-grade retry-safe | Retry re-bills paid LLM call + duplicates insert in live SM-2 review grading (tree §3 IN); lane reassigned off retired Quartet Runtime. ⚠ |
| WI-1814 | Captured | Core Learning Loop | Core Learning Loop | CRS03 fixture unreachable 'reteach' outcome | Inflates miss rate in the WI-1464 calibration run — tree §3 engine-spine gate that never cuts. |
| WI-1886 | Captured | (unassigned) | Core Learning Loop | Session GET/PATCH routes skip response schema.parse | Core-loop (tree §3) session routes bypass the schema-contract discipline sibling routes enforce; cheap fix. ⚠ |
| WI-1995 | Backlog | Quartet Runtime | Core Learning Loop | Parse LLM envelope signals field-tolerantly | Ties to §3 Challenge/verified-learning envelope; fails safe today. Prior ruling: should-have. |
| WI-2005 | Backlog | Core Learning Loop | Core Learning Loop | Make curriculum-adapt reorder switch exhaustive | Trivial compile-time guard, zero runtime risk. Prior ruling: MVP nice-to-have. |
| WI-1996 | Backlog | Quartet Runtime | Core Learning Loop | Stop metadata full-replace clobbering challenge-round state | Corrupts Challenge Round state, part of tree §3's engine spine that 'never cuts'. |
| WI-1998 | Backlog | Quartet Runtime | Core Learning Loop | Unify session idempotency gates, fail-closed | Fail-open idempotency enables double quota decrement (billing accuracy); /improve audit ruled MVP should-have. |
| WI-1813 | Captured | Core Learning Loop | Dev-Infra & Tooling | Reseed stale simulation-baseline.json (eval harness) | Broken --validate-baseline blocks required pnpm eval:llm gate that multiple Wave 0/1 LLM-prompt items depend on. ⚠ |
| WI-1864 | Captured | (unassigned) | Dev-Infra & Tooling | Nightly Maestro: 4/8 shards failing post-APK switch | Downstream of RUNWAY Wave2 'Maestro CI fixes (1651/1652) - make e2e gate real'; PR suite green but nightly regression needs triage before store submission. ⚠ |
| WI-1807 | Captured | (unassigned) | Dev-Infra & Tooling | Repair test:llm:enduser gate after profiles-table removal | Required LLM quality gate crashes post-cutover; launch window needs reliable LLM-change verification. |
| WI-1992 | Backlog | Dev-Infra & Tooling | Dev-Infra & Tooling | Route service-diff PRs through API integration suite | Item's own audit ruling: MVP must-have, sequence first — CI gap skips mandatory security break-tests. |
| WI-1862 | Backlog | V2 finalization | Dev-Infra & Tooling | Broken pre-push jest harness forces routine SKIP_PRE_PUSH | Normalizes bypassing the local safety net repo-wide during the MVP build crunch; AGENTS.md bans normalizing bypasses. ⚠ |
| WI-1874 | Captured | (unassigned) | Dev-Infra & Tooling | db-push local-dev escape can still push to staging | Escape hole risks repeating the April staging push-drift incident during active MVP build velocity. ⚠ |
| WI-1809 | Captured | (unassigned) | Dev-Infra & Tooling | GC1 checker blind to gc1-allow outside AST span | Checker bug bounced 3 PRs in one day — active dev friction during the window (classified by Hex, chunk-3 omission) |
| WI-1989 | Backlog | Identity Cutover | Identity Cutover | Close X-Profile-Id owner-gate IDOR (7 routes) | IDOR breaks the ownership-gate canon (tree §1, verifyPersonOwnershipV2); cross-account data exposure is a launch blocker. |
| WI-2006 | Backlog | Identity Cutover | Identity Cutover | Spike: read-side profile-authority check | Read-side IDOR counterpart to ownership gates central to tree §1 authority rulings. ⚠ |
| WI-1498 | Refining | Launch Readiness | Launch Readiness | Add mentor-memory confirmation after session 1 | Tree §11: Trust package IN as coherent slice; WI-1498 explicitly blocked/sequenced after WI-1767 design pass. |
| WI-1499 | Refining | Launch Readiness | Launch Readiness | Mentor-reply feedback controls for bad learning turns | Tree §11 trust package IN; blocked on WI-1767 batch design pass per G8 ruling. |
| WI-2000 | Backlog | Launch Readiness | Launch Readiness | Unit-test sliding-window rate limiter and IP resolver | Untested abuse-control on the public surface ahead of store go-live. Prior ruling: should-have. |
| WI-1501 | Backlog | Launch Readiness | Launch Readiness | In-app support/recovery path with context attachment | Tree §11 trust package IN: in-app support path is one of the 5 ratified slices. |
| WI-1767 | Refining | Launch Readiness | Launch Readiness | Trust package batch design pass (Zuzka), all 5 slices | Tree §11 G8 ruling: design pass precedes all trust-package builds, launch-gating. |
| WI-1502 | Refining | Launch Readiness | Launch Readiness | Visible review-promise Mentor card | Tree §3: launch vertical-slice IN (proof slice); also anchors §11 trust-package design pass. |
| WI-1497 | Refining | Launch Readiness | Launch Readiness | First-week mentor plan after first real session | Tree §11 trust package IN; RUNWAY 1D — Zuzka design pass precedes this build. |
| WI-1803 | Captured | (unassigned) | Launch Readiness | Pre-auth allowance for anonymous activation events | Closes AC gap in tree §12 IN activation-events wiring (WI-1689); fixes top-of-funnel signup_started/app_opened capture. |
| WI-1925 | Backlog | Launch Readiness | Launch Readiness | Console alert rules for activation-events retention signals | Tree §12 observability IN: pages on-call for the retention-purge signals WI-1859 already emits. |
| WI-1876 | Captured | (unassigned) | Mobile UX & Nav | Fix untranslated strings across 6 non-English locales | Tree §6: 7 UI locales IN; 50-75 untranslated keys break the shipped-locale promise. |
| WI-1884 | Captured | (unassigned) | Mobile UX & Nav | Profiles switcher conflates load-error with empty state | Medium UX bug on core family-account profile-switch screen; misdirects users into duplicate-profile creation. |
| WI-1993 | Backlog | Mobile UX & Nav | Mobile UX & Nav | Use exact birthdate in client adult-owner gate | Client gate 403s near birthday boundary (server correct); /improve audit ruled MVP should-have. |
| WI-1880 | Captured | (unassigned) | Safety & Eval | Fence learner answer in Challenge grader prompt | Prompt-injection into Challenge grader threatens mastery-verification integrity central to tree §3 verified-learning sell. |
| WI-2004 | Backlog | Safety & Eval | Safety & Eval | Guard against 'safety gate on primary path only' bugs | P1 audit archetype guard protecting tree §9 deterministic safety gates (IN unconditionally) from regression. |
| WI-1826 | Captured | (unassigned) | Safety & Eval | Suitability judge adopts capability:'judge' routing | Tree §9 suitability judge IN; closes V2-routing gap (H4 provider-safety-net gate). ⚠ |
| WI-1877 | Captured | (unassigned) | Safety & Eval | Fence learner text in suitability-judge prompt (injection) | Prompt injection can bias tree §9's IN suitability-judge verdict toward 'ok'. |
| WI-1986 | Backlog | Safety & Eval | Safety & Eval | Close under-18 vendor bypass in legacy LLM fallback selector | Tree §9: under-18 Gemini ban IN unconditionally; live bypass, adversarially verified HIGH. |
| WI-1764 | Captured | Safety & Eval | Safety & Eval | Source locale-correct crisis helpline content | Locale content for tree §9 IN crisis-disclosure resources; gated on counsel Q3 (Wave 0.1, already in motion). |
| WI-1900 | Captured | (unassigned) | Safety & Eval | H5 — output moderation pass on displayed mentor replies | Tree §9/§12 IN: last-line output check now actionable post-Gemini removal (V2 cutover); minor traffic day one. |
| WI-1991 | Backlog | Launch Readiness | Store Billing & Release | Clamp day-of-month in billing/quota cycle-reset math | Tree §8 billing IN/live; date-overflow bug hits 9 money-path sites, audit rules must-have. |
| WI-2001 | Backlog | Launch Readiness | Store Billing & Release | Test webhook dispatcher + v2 top-up money writes for real | Money-path test gap under tree §8 live billing; audit rules should-have. ⚠ |
| WI-1927 | Backlog | Supporter & Linking | Supporter & Linking | Family-join accept surface has no entry point | Tree §1: WI-1753 is launch-IN join-my-family enabler; without this follow-up the join is not usable end-to-end. |
| WI-1999 | Backlog | Supporter & Linking | Supporter & Linking | Route-handler tests: family-join + speaking-practice | Trust-boundary test gap on two launch-gating IN features (tree §1 WI-1753, §6 WI-1548/1549), minors-adjacent. |
| WI-1997 | Backlog | Supporter & Linking | Supporter & Linking | Fix double-notify on swallowed dedup-log write | Item's own audit ruling: MVP should-have — double-notifies parents in the §4 IN family loop. |

### D · Post-MVP pen (63)

| WI | Stage | Current lane | Item | Rationale |
|---|---|---|---|---|
| WI-1308 | Refining | V2 finalization | S6: retire V0 legacy shell post-launch (F4 resolved) | Tree §12: S6 retirement explicitly OUT/deferred; F4 struck 'before ship' wording, ruled post-launch timing. |
| WI-1436 | Refining | V2 finalization | Delete legacy Gemini-default routing path (post-soak) | Tree §12 explicit: legacy Gemini deletion ruled OUT (post-soak). |
| WI-1550 | Backlog | Four Strands | Language-native competency profile model | Tree §6 item 12: OUT/post-launch unconditionally — WI-1553 receipt is derive-from-events, no model needed for launch. |
| WI-1551 | Backlog | Four Strands | Evaluate language sessions into competency updates | Tree §6 item 13: ruled OUT/post-launch unconditionally; WI-1553 receipt is derive-from-events, no evaluator needed. |
| WI-1580 | Backlog | Mobile UX & Nav | Cross-account supporter invite/identify flow into /link/new | Tree §1: external-supporter-invite residual ruled OUT/fast-follow, stays Parked. |
| WI-1692 | Captured | Safety & Eval | Blocked-safety human-review queue (fast-follow) | Tree §9 explicit: full human-review queue is OUT/fast-follow, WI cited by number. |
| WI-1765 | Captured | Supporter & Linking | Parent-on-behalf provenance schema (fast-follow) | Tree §4: explicit fast-follow ruling, Parked; schema work only, not launch-gating. |
| WI-1766 | Captured | Supporter & Linking | Parking-lot return resumable-object flow | Tree §4: ruled explicit fast-follow build (Phase-4, ROADMAP-A). |
| WI-1799 | Refining | Safety & Eval | Reevaluate Challenge Round grader model (post-launch) | Item's own text: post-launch bake-off rerun per operator ruling on WI-1438 (grader retained for launch). |
| WI-1805 | Backlog | Core Learning Loop | Gate Challenge re-offers on due-again, not fixed 24h | Refines beyond named engine-spine (§3 WI-1469/1446/1464/1754); WI-1466's 24h floor already ships IN and isn't foreclosed. ⚠ |
| WI-1808 | Captured | (unassigned) | Fix stale premium-routing command in change classifier | Local advisory CI-classifier script bug (missing pnpm script); not a launch gate. ⚠ |
| WI-1811 | Captured | (unassigned) | Reteach path skips topic-ownership check | Shepherd already ruled low-severity/inert (no cross-tenant leak); tracked for visibility, not launch-blocking. |
| WI-1837 | Captured | V2 finalization | Doppler-removed Worker secrets ownership manifest | Infra hygiene (secret-deletion safety boundary); not in tree, not launch-ops blocking. ⚠ |
| WI-1847 | Captured | (unassigned) | Local jest setTimeout/clearTimeout undefined on drifted Node | Local-only quirk on non-standard Node hosts; CI (the authoritative gate per AGENTS.md) unaffected. |
| WI-1848 | Backlog | Compliance-Eng | RLS policies for person-keyed supporter tables | Tree §12: RLS activation ruled OUT, app-layer scoping deemed sufficient for launch. |
| WI-1857 | Captured | Stream 2 | Fix architecture.md language-learning drift (narrow) | Docs-only drift fix; doesn't gate launch operations even though four_strands is tree §6 IN. ⚠ |
| WI-1858 | Captured | Stream 2 | Fix architecture.md envelope example (private_sources) | Doc-correction only, no code/behavior impact; not needed for launch ops. |
| WI-1861 | Captured | (unassigned) | Regression guard for git()/childGitEnv() helper | Adversarial-review CONSIDER-tier coverage gap on a prod helper; not launch-critical. ⚠ |
| WI-1866 | Captured | (unassigned) | gemini.test.ts fails under local Node 26 | Local-only; CI (Node 22) is green, so it doesn't affect launch ops. |
| WI-1868 | Captured | (unassigned) | Prisma phantom transitive dependency cleanup | Low-severity dependency hygiene; no launch-operations impact. |
| WI-1869 | Captured | (unassigned) | Subject Hub fans out 2 API requests instead of 1 | Medium-severity perf optimization; small closed-beta scale doesn't need it at launch. |
| WI-1870 | Captured | (unassigned) | Silent LLM/route failure swallow in evaluateRecallQuality | Medium-severity observability gap in live SM-2 grading (tree §3 IN) but not among named launch-gating items. ⚠ |
| WI-1871 | Captured | (unassigned) | Low-severity roundup — correctness (TOCTOU, email mask) | Two low-severity findings, explicitly 'not a live cross-account leak'. |
| WI-1872 | Captured | (unassigned) | Stop using gc1-allow for test-convenience mocking | Test-quality hygiene (GC1 mock-ratchet backlog); not launch-blocking. |
| WI-1873 | Captured | (unassigned) | Low-severity roundup: test quality and coverage | Low-severity code-review roundup; not launch-blocking. |
| WI-1875 | Captured | (unassigned) | Low-severity roundup - DB and migration safety | Self-labeled low-severity roundup from code review; no launch-ops dependency. |
| WI-1878 | Captured | (unassigned) | Low-severity roundup: accessibility and i18n | Low-severity code-review roundup; not launch-blocking. ⚠ |
| WI-1879 | Captured | (unassigned) | Low-severity roundup — data integrity/profileId scoping | Self-labeled [low] consolidated findings; not launch-blocking. |
| WI-1881 | Captured | (unassigned) | Low-severity roundup — LLM/AI surface | Two low-severity prompt-hygiene findings, no launch-blocking impact. |
| WI-1882 | Captured | (unassigned) | render-wrangler-kv.mjs prints raw CF identifier to console | Low-severity logging hygiene in a dev deploy script; not launch-blocking. |
| WI-1883 | Captured | (unassigned) | Low-severity roundup: configuration and secrets | Low-severity code-review roundup; not launch-blocking. |
| WI-1885 | Captured | (unassigned) | Low-severity roundup - UX dead-ends and failure modes | Self-labeled low-severity roundup from code review; no launch-ops dependency. |
| WI-1887 | Captured | (unassigned) | Low-severity roundup: schema contract and API types | Low-severity code-review roundup, no launch-ops dependency. |
| WI-1888 | Captured | Churn-hotspot | Decompose exchange-pipeline cluster (churn hotspot) | Large architectural refactor of highest-churn cluster; not launch-gating. |
| WI-1889 | Captured | Churn-hotspot | Split test-seed.ts (6,425 LOC god-file) by domain | Pure dev-tooling refactor; no launch-ops dependency. |
| WI-1890 | Captured | Churn-hotspot | Deepen curriculum.ts module (2,883 LOC churn hotspot) | Architecture-hygiene churn item, not in tree, not required for launch operations. |
| WI-1891 | Captured | Churn-hotspot | Extract accreted nav logic out of (app)/_layout.tsx | Risky staged refactor of a churn hotspot; no capability-tree gate, safer after launch pressure eases. |
| WI-1892 | Captured | Churn-hotspot | Decompose mobile session surface (index/ChatShell/summary) | Churn-hotspot refactor; code health, not a new capability or gate. |
| WI-1894 | Captured | V2 finalization | Opener check stochastic failure — structural fix | Own tags/desc mark it post-launch; carved out of WI-1823 by operator ruling 2026-07-12. |
| WI-1895 | Captured | (unassigned) | Decompose SessionScreen (~1637 lines) | Code-health refactor, not a launch-blocking capability. |
| WI-1896 | Captured | (unassigned) | Decompose shelf BookScreen (~2189 lines) | God-screen decomposition hygiene, not in tree, not required for launch operations. |
| WI-1899 | Captured | (unassigned) | Voice/photo-first input loop for homework wedge | Goes beyond §6 ruled voice floor (transcription-everywhere+TTS); Epic-17-style ambition stays OUT wholesale. ⚠ |
| WI-1901 | Captured | (unassigned) | H7 safety-incident observability dashboard | Tree §12 explicitly: 'Dashboard - fast-follow' (Sentry+launch-health alerts are the IN observability floor). |
| WI-1902 | Captured | (unassigned) | Remove GEMINI_API_KEY post-cutover (defense-in-depth) | Explicitly soak-gated cleanup; Gemini exclusion already CI-enforced (§9), doesn't block go-live. |
| WI-1905 | Captured | (unassigned) | Migrate/accept revenuecat-v2 mock (deferred WI-1252) | Test-mock migration backlog (GC1); non-launch-blocking hygiene. |
| WI-1921 | Backlog | (unassigned) | Consolidate bespoke API db mocks onto shared factory | Test-infra hygiene, dev-only; no launch-operations dependency. |
| WI-2002 | Backlog | Dev-Infra & Tooling | Parallelize serial CI unit suites | CI speed/dev-velocity improvement; not launch-operations blocking. |
| WI-2003 | Backlog | Dev-Infra & Tooling | Remove unused @naxodev/nx-cloudflare dependency | Unused-dependency/security hygiene cleanup; not launch-blocking. |
| WI-2007 | Backlog | Dev-Infra & Tooling | Adopt or delete Inngest replay harness | Dead/unused test harness adopt-or-delete call; dev-infra, not launch-blocking. |
| WI-2008 | Backlog | Quartet Runtime | Stop normalizeReplyText corrupting escape sequences | Self-labeled narrow-trigger, cosmetic-impact bug; not launch-blocking. |
| WI-2010 | Backlog | Churn-hotspot | Break two runtime circular imports | No runtime symptom today. Prior ruling: post-MVP holding pen. |
| WI-2011 | Backlog | Churn-hotspot | Align .nullable().optional() drift in internal event schemas | Internal-only event payloads, docs-only enforcement; no user-facing contract impact. |
| WI-2012 | Backlog | Compliance-Eng | Row lock for memory-consent toggle race | Item's own audit ruling: backlog, fix-on-touch — needs unrealistic concurrent toggles in mobile app. |
| WI-2037 | Captured | Supporter & Linking | Design 13-16 join-my-family consent posture | Self-labeled 'Fast-follow from OPQ-75 and WI-1753'; extends beyond the ruled 13+ launch floor (tree §10). |
| WI-482 | Backlog | Dev-Infra & Tooling | Split monolithic session/curriculum service modules | Architecture decomposition umbrella; not in tree, not needed for launch ops, pure hygiene. |
| WI-757 | Captured | Stream 2 | Amend MMT-ADR-0000 (reconstruct-vs-launder, sign-off gate) | Estate-level ADR governance amendment, no MVP capability-tree tie, doesn't gate launch ops. |
| WI-895 | Captured | Stream 2 | WP: shift-left ADR-provenance enforcement | Estate-wide ADR tooling WP, not in MVP tree; doesn't gate launch ops. |
| WI-896 | Captured | Stream 2 | Amend MMT-ADR-0000 §II.6 shift-left ADR-provenance | Meta/process ADR-provenance work, not in capability tree; doesn't gate launch. Lane Stream 2 already non-MVP. ⚠ |
| WI-897 | Captured | Stream 2 | AGENTS.md doctrine rule — ADR-first/lockstep before specs | Estate/process doctrine item (spec-writing discipline), not in capability tree; doesn't gate launch ops. Desc empty. ⚠ |
| WI-898 | Captured | Stream 2 | Inject §II.1 ADR-gate hierarchy into brainstorming skill | Empty desc; estate-track agent-tooling item (Stream 2), not part of MVP capability tree or launch ops. ⚠ |
| WI-899 | Captured | Stream 2 | /refine ADR-gate — five-trigger test, coordinate w/ Nexus | Estate ZDX-toolchain tooling, not product capability, no launch dependency. ⚠ |
| WI-900 | Captured | Stream 2 | Move check-decision-adr-link CI check to pre-commit | Child of WI-895 estate-tooling WP; CI/DX hygiene, non-launch-blocking. |
| WI-904 | Backlog | Mobile UX & Nav | Rework dictation playback pacing model | Pacing polish on existing dictation feature; §6 floor (dictation first-class) already met as-built. ⚠ |
