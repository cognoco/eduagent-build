# BID-15 formation proposal — Supporter linking E2E

Source: pool-snl.json (25 open Supporter & Linking items, read 2026-07-17). All 25 confirmed zero claims / empty Delivery Batch relation at export time — no batching conflicts. DoR spot-check was done by reading the full inline `Acceptance Criteria` + `Description` rich_text properties (already complete, un-truncated, in the export) for all 8 Ready-stage items plus the 5 relevant Refining items — this is broader than the requested 2-3 sample GETs, so no separate live Notion GET calls were made (none were needed for content; see Open Flags for a staleness caveat instead).

## Proposed members (6 — 5 Ready + 1 Refining)

| ID | Title | Stage | Rationale |
|---|---|---|---|
| WI-2237 | Gate supporter scopes and structural reads on accepted visibility | Ready (M, Bug) | Root security gate. Formally blocks 9 other pool items (2226, 2229, 2230, 2232, 2233, 2235, 2127, 1927, 1753) — the widest blast radius in the pool. Zero blockers itself. Must land first. |
| WI-2225 | Preserve non-authorizing supporter intent through signup and cold start | Ready (M, Feature) | Onboarding entry point — persists supporter intent from signup through verification before any relationship exists. Zero blockers; blocks WI-2226. |
| WI-2226 | Wire and correct landed supporter cold-start and self-learning doorways in V2 | **Refining** (M, Bug) | **Included despite stage, not left as an external fast-follow.** Blocked-by = {2225, 2237}, both in this batch, so it's mechanically unblocked the instant Wave 1 lands. WI-2242 (below) names it explicitly as a prerequisite in its own AC — leaving it out of the batch means keeping a member (2242) that cannot execute or be verified until a non-member lands. A batch named "Supporter linking **E2E**" that can't actually run its E2E suite against a mounted production surface isn't proving the thing it's named for. Recommend a fast DoR pass on this item before Wave 2 starts — see Open Flags for what's already well-specified vs. what a Refine pass should still confirm. |
| WI-2243 | Wire the V2 supporter self-learning doorway and cover Me-scope persistence | Ready (M, Feature) | Post-accept "Me" experience: mounts SupporterSelfLearningDoorway, adds seeded E2E coverage for Me-scope persistence + scope-isolation (no-leak both directions). AC explicitly excludes co-learning/advisor-chat — clean boundary vs WI-1136. Zero formal blockers. Relationship to WI-2226: same file (`SupportHubMentorTab.tsx`), orthogonal conditions (2226 = relationship-status states; 2243 = own-learning-status) — see Open Flags for confidence level on this one, it's weaker than 2242's link. |
| WI-2188 | Give every link-initiation step an explicit in-app exit | Ready (S, Bug) | UX-safety fix directly on `link/initiate.tsx` / `link/_layout.tsx` — the exact route WI-2242's E2E fixture drives. Small, zero blockers/blocking. Do before 2242 finalizes its E2E selectors, to avoid test churn. |
| WI-2242 | Make V2 supporter first-edge onboarding reachable and cover the link ceremony | Ready (L, Task) | The batch's E2E centerpiece: composes two test-seed-v2 identities, exercises the full happy-path + recovery-path link ceremony, adds bounded Playwright + Maestro two-login flows. Formally blocked by nothing, but its own AC text names WI-2225/2226/2237 as narrative prerequisites. Sequence last, after WI-2226. |

This lands in the 6-10 target. The alternative (drop 2242 too, ship only the 3 fully-independent Ready items — 2237/2225/2188 — as a "foundation" slice) was considered and rejected: it falls well below range and defers the entire point of the batch (proving the linking flow end-to-end) to a later batch. See "Two lanes considered" below.

## Excluded + why

**Refining, near-Ready — add-later (all downstream of WI-2237, the gate this batch ships):**

| ID | Title | Stage | Why not now |
|---|---|---|---|
| WI-2233 | Expose the supportee-side shared-record mirror in Me Journal | Refining (M, Feature) | Blocked by 2237 + 2127. 2127 is itself Refining and blocked by 2128 (family-join thread) — two hops from Ready. Next-wave transparency feature, not onboarding/linking core. |
| WI-2235 | Make current visibility-contract review and credentialized unlink lifecycle reachable | Refining (M, Feature) | Same blocked-by shape as 2233 (2237 + 2127). Post-accept lifecycle management, not onboarding. |
| WI-2232 | Rehome existing durable reports and recaps into person Journal | Refining (M, Enhancement) | Blocked by 2237 only — closest of the transparency trio to Ready once this batch's gate lands. Still a distinct "what did they learn" reporting feature, not linking. |
| WI-2197 | Route supporter notifications through V2 scope chips and Journal instead of legacy Family Recaps | Refining (L, Bug) | No formal blockers, but its own description flags "the product destination for struggle notifications is still unresolved" — a pending product decision, not just an eng gap. Not ready to commit to a batch. |

**Family-join thread — related supportership mechanism, different persona/journey, recommend as a separate future batch:**

WI-2127 ("Complete visibility consent after family-join supportership opt-in") reveals that family-join (an existing teen joining a family account) *also* creates a supportership edge and reuses the same accepted-visibility gate (WI-2237). That's a real shared root, but the rest of this thread is heavier, deeper-blocked, and a different user journey (teen-joins-family vs. external-supporter-links-to-learner) than "supporter linking":

- WI-2128 (Refining, L, Bug) — Bind joined learner credentials to own person. Root of this thread's blocking chain (blocks 2127, 1927, 1753).
- WI-2127 (Refining, L, Bug) — blocked by 2128+2237, blocks 5 others. Deepest hub in the whole pool.
- WI-1927 (Refining, M, Feature) — Family-join accept surface. Blocked by 2128, 2237, 2127.
- WI-1753 (Refining, L, Feature) — Cross-account existing-teen family join (v1 enabler). Blocked by **6** items — heaviest chain in the pool. Workstream Order = 100 (the only item in the pool with an explicit order value), consistent with being sequenced last in its own stream by design.
- WI-2229 (Backlog, Feature) — Inviter-side lifecycle controls for existing-teen invites. Blocked by 1927, 2127, 2237.
- WI-2126 (Backlog, Bug) — Align 13+ advertised eligibility with 17+ acceptance gate.
- WI-2125 (Backlog, Bug) — Restore staging family-join invite endpoint for preview clients.
- WI-2123 (Backlog, Bug) — Restore family shell after first-child creation in native preview.
- WI-1999 (Backlog, Task) — Route-handler tests for family-join **and speaking-practice** (the speaking-practice half is unrelated to either thread).
- WI-1997 (Backlog, Bug) — Dedup-log write double-notifying parents (weekly digest). Not linking-related at all; miscellaneous notification bug that happened to be filed in this pool.

**Different feature vertical — Ready/Backlog but wrong slice (coherence exclusions):**

- WI-1136 (Ready, L, Feature) — S4 supporter-co-learning service + CoLearningDoorway. Ready, zero blockers, tempting for headcount — but WI-2225's AC explicitly defers "supporter self-learning richness and supporter Mentor conversation," and WI-2243's AC explicitly excludes "co-learning and supporter-advisor chat." This is the next feature slice after onboarding/linking, not part of it. Confirmed via repo: `apps/mobile/src/components/support/CoLearningDoorway.tsx` and `apps/api/src/services/supporter-co-learning.ts` are net-new files, unbuilt.
- WI-2230 (Backlog, Feature) — Person-scope supporter-to-own-Mentor conversation. Same explicit deferral ("supporter Mentor conversation") in WI-2225's AC. Blocked by 2237, 2127, 2233.
- WI-1185 (Ready, Bug) — Parent-managed child-scoped subjects. Zero thematic or file overlap with supporter linking (different domain entirely: `POST /subjects/for-child`, `child/[profileId]/curriculum.tsx`).
- WI-2189 (Ready, M, Bug) — Route V2 Family settings to a family-scoped destination. Tempting (Ready, zero blockers) but it's the family-*owner's* account-settings surface (`AccountAdminSheet.tsx` → add-child/family-plan/usage-sharing), not the supporter journey. **Confirmed via repo grep: zero file-level cross-reference in either direction** between `AccountAdminSheet.tsx` and the other proposed members' files (checked before WI-2226 was added to the list; the finding is about `AccountAdminSheet.tsx` vs. the supporter/scope files, unaffected by that addition). Genuinely disjoint, not just thematically distant.
- WI-2223 (Backlog, Bug) — Make support.hub deep links select Support-hub scope before navigation. **Notable outlier**: title and content are dead-center in this thread (it's about the exact same `activeScope.kind` branching in `mentor.tsx` that WI-2226/2243 touch), and its AC already reads as DoR-quality (specific, testable, no placeholders) despite the Backlog label. Not promoting it myself — that's a Refine-stage call, not mine — but flagging it as a good second fast-track candidate behind WI-2226.

## Two lanes considered

The Ready-stage pool for this thread is only 8 items; 3 of those (1136, 1185, 2189) are confirmed-disjoint other verticals by content and by repo grep, leaving 5 tightly coherent Ready items. Two structurally clean options existed:

- **Ready-only lane:** ship only fully independent, non-blocked Ready items — 2237 + 2225 + 2188 (2243 dropped too, since its relationship to 2226 is same-file even if unconfirmed as a hard block; 2242 dropped because it names 2226 as an explicit prerequisite). 3 items, well below the 6-10 target, and defers the entire "prove the link ceremony end-to-end" goal to a successor batch.
- **Include-the-prerequisite lane (chosen):** bring WI-2226 into the batch as a flagged Refining member. 6 items, inside target range, and the batch actually earns its "E2E" name — 2242's E2E suite has something real to run against.

Chose the second: excluding a member's own named prerequisite while keeping the member produces a batch that can't self-execute, which is a worse outcome than including one Refining item with a clear promotion flag.

## Sequencing

**Wave 1 (parallel, zero interdependency, all Ready):**
- WI-2237 — gate (do first regardless of parallelism; everything downstream, in and out of this batch, wants it landed)
- WI-2225 — signup/cold-start intent
- WI-2188 — link-initiation exit affordance (do before Wave 3 to avoid E2E selector churn)

**Wave 2 (needs Wave 1's WI-2225 + WI-2237 landed; run a fast DoR/Refine pass on this item as soon as Wave 1 lands, before starting it):**
- WI-2226 — mount cold-start states in production hub

**Wave 2b (independent of 2226 by the formal graph; likely same-file as 2226 — see Open Flags — so sequencing it right after 2226 rather than fully parallel reduces rework risk):**
- WI-2243 — self-learning doorway + Me-scope persistence E2E

**Wave 3 (capstone — sequence last):**
- WI-2242 — two-identity E2E link-ceremony proof. Needs WI-2226 landed (explicit AC prerequisite) to exercise the real, mounted doorway rather than testing against an unmounted component.

## Seam verdict

**Disjoint at the logic/feature level; one shared-file co-location risk at the code level.**

Checked via repo (`/Users/vetinari/nexus/_dev/eduagent-build`, read-only):

- **BID-13 (mentor loop: 2094/2099/2222, mentor send/session-start paths) — CONFIRMED by refine-bid13, with line numbers.** `mentor.tsx`'s default-export cascade (378-429): lines 401-414 (`supporter-hub`) and 416-426 (`person`) → `SupportHubMentorTab` (this batch); line 428 fallthrough → `LearnerMentorScreen` (BID-13's). `LearnerMentorScreen` is a separate function, 94-376 — WI-2094's fix (handleSubmitText, ColdStartCard, MentorInputBar) is entirely inside it. Disjoint functions, disjoint control flow, mutually exclusive branches — as clean a same-file seam as exists. **Only mechanical risk**: a diff on either side touching the shared setup block (378-400: `activeScope`/`router`/`eligiblePersons`/`personScopes` closures) or the if-cascade structure itself — a rebase-order check, not a logic-coordination need. WI-2099 doesn't touch `mentor.tsx` at all (its scope is `session/index.tsx` + `use-session-streaming.ts`, downstream via route params) — fully disjoint. WI-2222 (test consolidation): refine-bid13's evidence names `bar-intent-match.test.ts`/`.adversarial.test.ts`/`now-deep-link.test.ts`/`llm-provider-fixtures.ts`, not `mentor.test.tsx` — likely disjoint but flagged unconfirmed rather than ruled out.
- **BID-12 (WI-2112, Challenge redefinition / session-loop):** No live agent to cross-check against, and no repo trace of WI-2112 (no worktree, no doc mention). Checked structurally instead: Challenge Round logic lives entirely under `apps/api/src/services/challenge-round/` (mastery policy, grading, note-drafting) — confirmed **zero cross-references**, either direction, between that directory and the proposed members' files (`scope-resolution.ts`, `supporter-structural-mask.ts`, `scope-context.tsx`, the `support/` components incl. `SupportHubMentorTab.tsx`, `link/initiate.tsx`). Confident this is genuinely disjoint, but flagging that I couldn't verify against WI-2112's actual AC/file list the way I could for BID-13.

## Shepherd notes — verification approach

- **WI-2242 (E2E ceremony proof):** verification IS the deliverable — the runnable Playwright (web) + Maestro (native) two-login flows it adds, plus the pending-link fixture. Shepherd should confirm both suites are wired into the "explicit lane" the AC references, not just present as files, and that redacted two-identity evidence is attached per the AC's REUSE/REGISTRATION clause.
- **WI-2243 (self-learning doorway + Me persistence):** verification is behavioral — AC point 6 specifies the exact seeded E2E variants (accepted edge, no own learning / accepted edge, existing own learning) and point 7 specifies unit/integration tests that must currently *fail* on the unmounted state (a red-green check shepherd can literally run pre/post).
- **WI-2237 (gate):** verification is the authorization-matrix integration test suite the AC calls out by name — every variant (missing/pending/one-sided/accepted/revoked/restamped/lapsed/archived-person/stale-cache/accept-revoke-race) plus the concurrency race case. This is a security-class fix; shepherd should treat missing race-condition coverage as a blocker, not a nit.
- **WI-2225 / WI-2188:** narrower, conventional AC — signup/cold-start state coverage and route/component/accessibility regression tests respectively. Standard DoD check suffices.

## Open flags

1. **Formal "Blocked by" relations under-represent real execution dependencies in this pool — two different confidence levels, don't treat them the same.**
   - **WI-2242 → WI-2226: high confidence.** WI-2242's AC explicitly names WI-2226 ("WI-2226 owns mounting cold start") as a prerequisite in its SCOPE/PREREQUISITES section. This is why WI-2226 is now a proposed member rather than a footnote.
   - **WI-2243 → WI-2226: lower confidence, checked against the actual component and downgraded.** WI-2243's own Blocked-by is empty and its AC never names WI-2226. Read `SupportHubMentorTab.tsx` directly (289 lines): `SupporterSelfLearningDoorway` is currently mounted nowhere in production (only in its own file, its test, and a barrel export) — confirming WI-2243's premise — but the component's existing branches key off `personScopes.length` (supportee-relationship state, WI-2226's territory), not off "does the supporter have their own learning state" (WI-2243's territory). These read as **orthogonal conditions likely landing in the same file**, not a confirmed execution dependency. Treat WI-2243 as same-file-adjacent to WI-2226 (a soft sequencing/rework-risk reason to do 2226 first, per Wave 2b above), not as blocked by it.
   - General pattern for this thread: AC/Description prose is a more complete dependency source than the Notion relation field. Don't sequence off the relation graph alone.
2. **WI-2242 → WI-2241 — RESOLVED by refine-bid14, and it changes the recommendation.** WI-2241 ("Add supportership-aware V2 seeds and cover scope preservation and privacy") is real: Type=Task, Priority=P1, **Stage=Ready**, Effort=L, Execution Path=Assisted. Its AC builds the `v2-supporter-accepted` fixture in `test-seed-v2.ts` — matches "WI-2241's accepted fixture" in WI-2242 exactly, not a stale reference. It is **not** in this S&L pool (25 items) and **not** in BID-14's pool either — it sits in some other workstream-tag bucket, unbatched (`Delivery Batch` empty, confirmed by refine-bid14's direct lookup). Claimed-By was not confirmed by that lookup — main should check before batching. **Recommendation: fold WI-2241 into BID-15 as a 7th member**, sequenced in/near Wave 1 (fixture-building work, no evident dependency on 2225/2226/2237) and landed at-or-before WI-2242. It's Ready-stage, which is a *stronger* DoR position than WI-2226's Refining — the only reason it isn't in the "Proposed members" table above is that it fell outside my originally-scoped 25-item pool, so I haven't run the same full read on its AC/Description that I ran on the 6 core members. Main should pull its full content before finalizing, but the Stage/Priority/empty-batch facts alone make a strong case.
3. **Pool export is a point-in-time snapshot.** Given the high concurrent batch-formation activity this session (BID-12 through BID-16 forming in parallel, plus rework agents active on other items), main should re-verify Stage / Claimed By / Delivery Batch on all 6 proposed members immediately before creating the BID-15 page — especially WI-2237 (root gate, blocks 9 downstream items), WI-2226 (still Refining — confirm it hasn't already been picked up elsewhere), and WI-2242 (the WI-2241 dependency above).
4. **WI-2226's Refining→Ready promotion — what a fast DoR pass should still confirm, not just rubber-stamp.** The AC content already read as substantive (root cause, minimum launch outcome, deferred-scope line) when I reviewed it for this proposal, but I did not run a full DoR check on it the way the 5 Ready items have already had. Don't skip the Refine step on the assumption that my read of the prose is equivalent to it.
5. **WI-2223 (Backlog)** is thematically core (same `mentor.tsx` scope-branch mechanism) and already reads as DoR-quality despite its stage. Worth a Refine pass as a near-term follow-on to this batch, not part of this proposal.
6. ~~BID-13 seam cross-check unanswered.~~ **Resolved** — see Seam verdict above. refine-bid13 confirmed disjoint functions/control-flow with line numbers; only a mechanical rebase-order risk on the shared setup block (mentor.tsx:378-400).
