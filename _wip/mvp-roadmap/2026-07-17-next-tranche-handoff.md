# Next-tranche handoff package — BID-13/14/15/16 (formed 2026-07-17)

**Authority:** operator-approved slate (2026-07-17 ~16:40Z, OPQ-stasis assumption ruled). Formed + refined by PM (`pm:claude:mentomate`) with four refinement subagents. **Dispatch is a joint operator+PM decision per D2** — nothing here is Running; each batch flips Ready→Running only at its own spin-up with a shepherd assigned (`Run by` = claim).

**Numbering note:** Batch DB auto-assigned IDs — factory = **BID-15**, S&L = **BID-16** (refinement working papers were drafted under swapped labels; repo copies renamed correctly, see `refinements/`).

**Protocol for shepherds (RELAY 2):** one shepherd per batch, burst-lifetime; per-WI worktrees via `scripts/setup-worktree.sh` → `.worktrees/<branch>/` (never raw `git worktree add`, never Claude's EnterWorktree); claim before execute (`/cosmo:execute claim`, set Claim Expires and RENEW if the burst outlives it); DoR before execute; pre-PR adversarial self-review; merge own green PRs (operator-confirmed authority); `/cosmo:execute complete` FROM THE ITEM'S WORKTREE (cwd determines Fixed In — a sibling stamped the wrong commit from the shared checkout); post-verify Fixed In matches your commit.

**Evidence rules (all bounced items today violated one):**
1. Evidence pointers = repo paths (file or file:line) resolvable at the landed revision — never shell commands or free text.
2. Bug items: red-green-revert EXECUTED with captured output in Verification.
3. Every AC variant mapped to executable evidence, or surface the blocker — never complete around it.
4. *(proposed, pending operator broadcast; the reviewer already enforces it)* Verification must exercise the guaranteed property, not the code's shape — behavioral/adversarial/invariant tests, executed + captured. Security items need a real adversarial run; invariants need cross-site enumeration; sweeps put the enumeration itself in Verification.

---

## BID-13 — Mentor loop (page `3a08bce9-1f7c-8197-8f99-c776260d9657`) — DISPATCH-READY

- **Members (3, all Ready, DoR-confirmed):** WI-2094 (route valid Mentor statements — Bug), WI-2099 (preserve opening Mentor exchange — Bug), WI-2222 (consolidate Mentor contract tests + E2E).
- **Sequencing:** 2094 ∥ 2099 (file-disjoint, verified via import graph). 2222 HARD after 2094 (**Blocked-by wired** — shared test files); SOFT after 2099 — matcher-consolidation slice may start once 2094 lands.
- **Seams (LOW):** BID-12/WI-2112 zero file overlap (verified against its branch diff); shared `/(app)/session` route-param surface on separate mode branches. BID-16 disjoint except read-only `scope-context.tsx`.
- **Add-later:** WI-2221 (Refining; groomer). **Verification:** both Bugs need persistence-level red-green — 2099 asserts on the persisted transcript, not the render.

## BID-14 — Identity cutover (page `3a08bce9-1f7c-8156-ab1e-c10eb6bc28fd`) — HELD (two gates)

- **Members (4, ALL Backlog):** WI-1989 (X-Profile-Id owner-gate IDOR, 7 routes — security), WI-2006 (read-side profile-authority spike), WI-2055 (identity-canon amendment), WI-2056 (Neon PITR/snapshot recovery runbook).
- **Gate 1 — DoR (groomer):** Kind null ×4; Effort null ×4 (1989=M, 2006=L per source plans; 2055/2056 need sizing); Risk/Impact null on the three P1s (mechanical DoR floor).
- **Gate 2 — operator canon pass (WI-2055), 5-question agenda:** (1) rollback retirement: absolute or conditional? (2) ad-hoc-workaround prohibition — scope? (3) primitive definitions (merge/reparent/alias vocabulary); (4) boundary vs T3/deletion scope; (5) landing file for the canon text. Full text: `refinements/refine-BID-14-identity.md`. WI-2057 (merge/reparent/alias build) exists — link during the pass.
- **Sequencing (corrected):** two independent lanes, parallel — Lane A: 1989 → 2006. Lane B: 2055 ↔ 2056 pair (2056's doc first-ish; 2055's AC links to it).
- **Seam (REAL):** WI-1193 (BID-11, executing) edits `services/identity-v2/family-v2.ts`, imported by 1989's target `routes/consent.ts` — rebase-check at dispatch; sequence 1989 behind 1193 if still live.
- **Related non-members:** WI-2349 (column-level profile_id→person_id rename tracker, minted today — lane backlog behind this batch).

## BID-15 — QA factory drain 1 (page `3a08bce9-1f7c-81d3-9dce-e4a2fa9dd296`) — READY pending spin-up

- **Members (7; 2×P1, 4×P2, 1×P3; all Ready, DoR-complete, CI-verifiable per operator mode ruling):** WI-2187, WI-2182, WI-2185, WI-2192, WI-2191, WI-2178, WI-2186.
- **Collision:** 2185 + 2178 share a layout file — sequence, never concurrent. **CI note:** required e2e-web check is smoke-tagged only — layout/theme claims need the full relevant spec set run and captured in Verification.
- **Backfill (groomer, add-when-Ready):** WI-2124, WI-2101 (BID-12 seam — re-check at add), WI-2110. **Parked for preview vehicle:** 2176/2106/2105/2102/2096 (device-verify). Full exclusion ledger: `refinements/refine-BID-15-factory.md`.

## BID-16 — Supporter linking E2E (page `3a08bce9-1f7c-81ba-81bf-d2acfbddd4b3`) — READY pending spin-up (one member pending DoR)

- **Members (7):** wave 1 ∥: WI-2237, WI-2225, WI-2188 → WI-2226 (**Refining — groomer fast-pass; unclaimable until Ready**; included because 2242's AC names it prerequisite) → wave 3 ∥: WI-2243, WI-2241 → WI-2242 (E2E capstone, LAST; **Blocked-by wired: 2226 + 2241**).
- **WI-2241 provenance:** pulled cross-lane from Launch Readiness during refinement (Ready, P1, unclaimed, unbatched; AC verified first-hand — it *builds* the `v2-supporter-accepted` fixture 2242 depends on). Cross-lane membership is SEQ-6 doctrine; resolved as a refinement outcome, no longer an open decision.
- **Seams:** BID-12 disjoint (verified). BID-13: shared `mentor.tsx`, different branches — merge-coordination point, verified two-sided. **Excluded:** family-join thread (2128/2127/1927/1753 + siblings) — future batch, different persona/journey.

---

## Groomer feed (operator → refinement engine)

Priority order: **WI-2226** (gates BID-16 capstone chain — fast pass), the **BID-14 four** (Kind/Effort/Risk fields; sizings above), **WI-2221** (BID-13 add-later), **factory backfill** 2124/2101/2110.

## Dispatch preconditions checklist (per batch, at spin-up)

1. Fresh claims sweep on members (parallel streams are active — today's evidence).
2. Seam re-check against then-live batches (esp. BID-14↔1193, BID-16↔BID-13 mentor.tsx).
3. BID-14 only: both gates cleared. BID-16: confirm 2226 Ready or dispatch with wave-1-only scope.
4. Monitor: extend `monitor-dispatch.js` MEMBERS map + batch filter (PM does this at each spin-up).
5. Shepherd briefed with: batch Brief (authoritative), this package, evidence rules block.

## Open operator decisions carried

Canon-pass scheduling (BID-14 gate 2) · evidence-rule-4 broadcast · plus the day's standing items (1874 adjudication, 2119 authorization, 1561 sign-off authority, 2120 Fixed-In correction, orphan releases). *(WI-2241 membership: resolved — pulled into BID-16 during refinement.)*
