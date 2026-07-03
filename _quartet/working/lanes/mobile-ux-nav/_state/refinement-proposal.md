# WS-33 (Mobile UX & Navigation) — Refinement + Sequencing Proposal

Researcher executor pass. Read-only — no Cosmo writes, no source edits. All claims below
carry `file:line` citations verified against the current `main` branch checkout
(`git branch --show-current` = `main`, HEAD includes commit `746d547f1`, 2026-06-20 latest
touch on the pick-book screen).

---

## 1. Per-WI refinement table

| WI | Name | Proposed Type | Priority | Tags | Execution Path | Disposition |
|---|---|---|---|---|---|---|
| WI-1204 | Keep homework capture bottom actions above system navigation | Bug (unchanged) | P2 (unchanged) | — | Assisted (unchanged) | **Already Ready — do not rewrite.** Existing AC (root cause: fixed-padding ScrollView vs safe-area inset; 4 variants: subject-known / auto-detected / manual-picker / small-viewport) is DoR-complete. Listed here only for ordering context. |
| WI-1184 | Verify/fix child subject route wedging Chrome walkthrough | Bug (unchanged) | P3 (unchanged) | `legacy` (unchanged) | Assisted (unchanged) | **Real, but repro-blocked — see §2.** Static review independently confirms the WI's own claim: no hang vector in current code. |
| WI-1208 | Keep pick-book Back inside the Subjects shell | Bug (unchanged) | P2 → **recommend P3 pending verify** | — | Assisted | **Needs re-verification — probable already-fixed.** See evidence below; do not promote to Ready as a blind code-change item. |
| WI-1210 | Align empty subject states with visible curriculum state | Bug (unchanged) | P2 (unchanged) | — | Assisted | **Real, root cause confirmed.** |
| WI-1209 | Return subject-hub empty-state Back to Subjects, not Home | Bug (unchanged) | P2 (unchanged) | — | Assisted | **Real, root cause confirmed.** |
| WI-1212 | Use book-flip animation for subject curriculum preparation | Enhancement (unchanged) | P3 (unchanged) | — | **Auto** (candidate — see rationale) | **Real, trivially bounded.** |
| WI-1142 | Add Study→Family switch-CTA regression coverage (BRIDGE-04) | Hygiene (unchanged) | P3 (unchanged) | — | Assisted | **Real, root cause/target confirmed.** Test-only. |
| WI-1248 | Route remaining inline CTA buttons through shared Button (WI-1081 tail) | Hygiene (unchanged) | P3 (unchanged) | `design-system` (unchanged) | Assisted | **Real, independent, self-scoped.** AC already DoR-grade (own rg command + exclusion rules), verified spot-checked. |

### WI-1184 — AC / root cause (Bug — established, see §2 for the repro gate)
Root cause status: **unconfirmed statically**, confirmed independently. Read
`apps/mobile/src/app/(app)/child/[profileId]/subjects/[subjectId].tsx:60-131` — three
`useQuery`-backed hooks (`useChildSubjectTopics`, `useChildInventory`, `useProfileSessions`,
lines 90-92), zero `useEffect`, a single early-return guard on missing params (line 105), no
`Suspense`, no render-loop risk. This matches the WI's own "Current code state" note. Variants:
n/a until reproduced — the hang is a runtime/CDP-automation symptom, not a statically
locatable code defect. Existing AC ("run a staging walkthrough… if it wedges, fix + cover; if
not, close with the walkthrough as evidence") is sound framing for an Assisted item but cannot
be promoted past Refining until the walkthrough actually happens.

### WI-1208 — AC / root cause (Bug)
**Root cause candidate found, but it predates the WI.** `handleBack` in
`apps/mobile/src/app/(app)/pick-book/[subjectId].tsx:123-133`:
```
const handleBack = useCallback(() => {
  if (subjectId) {
    router.replace({ pathname: '/(app)/shelf/[subjectId]', params: { subjectId } } as Href);
    return;
  }
  router.replace('/(app)/library' as Href);
}, [router, subjectId]);
```
The `/(app)/library` fallback only fires when `subjectId` is falsy — an edge case guarded
separately at `pick-book/[subjectId].tsx:307-329` ("missing param"). In the normal "Browse
books" flow (`subject-hub/[subjectId]/index.tsx:118-123` `goPickBook`, which always supplies
`subjectId`), Back already routes to `/(app)/shelf/[subjectId]`, not Library. `git blame -L
123,134` on this file shows these lines were authored by commits `75ace69609` (2026-04-13),
`c80bb9036b` (2026-04-28), and `1d657009f9` (2026-05-13) — **6-7 weeks before WI-1208 was
captured (2026-06-30)**. The WI's own "Found In" field describes this exact fallback as the
bug, which the code does not currently exhibit on the described path.

Two explanations, not distinguishable statically: (a) the symptom is already fixed and the
Codex-thread screenshot was against a stale build/branch, or (b) the screenshot's actual
repro path is different from "Browse books → Back" (e.g. a different entry surface into
pick-book, or the "shelf" screen itself — which is a `FULL_SCREEN_ROUTES` member,
`apps/mobile/src/app/(app)/_layout.tsx:66-68`, hiding the tab bar entirely — is not obviously
"the Subjects shell" the AC has in mind). **Recommend:** before any code change, do a cheap
live nav-walkthrough verify (Browse-books → Back, both MODE_NAV_V2 on/off) as the very first
action; if it doesn't reproduce, close as already-fixed citing commit `75ace69609`; if it
does, root-cause it against the actual repro'd path (likely not `handleBack` as written).

### WI-1210 — AC / root cause (Bug)
Root cause confirmed: `getSubjectCurriculumStatuses` in `apps/api/src/services/subject.ts:152-215`
computes a **binary-precedence** `curriculumStatus` (`ready` > `failed` > `preparing`) where
`ready` is set by **either** a generated book (`topicsGenerated=true`, lines 159-165) **or**
the mere existence of `bookSuggestions` rows (lines 166-169, 189-191) — an unpicked suggestion
list counts the same as actual generated curriculum. Downstream, `computeEmptyKind` in
`apps/mobile/src/hooks/use-subject-hub.ts:398-410` branches on this `curriculumStatus` *before*
checking `booksCount`, so: a subject with **zero suggestions and zero books** → `curriculumStatus
= 'preparing'` → renders "Building curriculum"; a subject with **zero books but ≥1
unpicked suggestion** → `curriculumStatus = 'ready'` → falls through to `booksCount === 0` →
renders "Choose your first book". Both subjects are visually identical (no studyable content),
but the two "ready" signals (generated book vs. mere suggestion) are conflated in the same enum
value. Behavioral variants: (a) zero books + zero suggestions → 'preparing'; (b) zero books + ≥1
suggestion → 'pick-book'; (c) generated book with zero active topics → 'stuck'
(`computeEmptyKind` line 409, the terminal fallback). The WI's existing AC (internal
consistency + API/hook test coverage + copy audit) is sound; recommend the fix touch **only**
`apps/api/src/services/subject.ts` (or the mobile hook, depending on chosen unification point) —
no change to `apps/mobile/src/app/(app)/subject-hub/[subjectId]/index.tsx`'s render switch is
required unless the chosen fix introduces a new discriminator value (open question, §6).

### WI-1209 — AC / root cause (Bug)
Root cause confirmed: `goBack` in `apps/mobile/src/app/(app)/subject-hub/[subjectId]/index.tsx:108-116`
calls `goBackOrReplace(router, fallback)` (`apps/mobile/src/lib/navigation.ts:87-97`), which
**prefers native `router.back()` whenever `router.canGoBack()` is true**, only falling back to
an explicit `replace` when the stack is exhausted. All three empty-state components
(`SubjectHubPreparing` at line 244-251, the `stuck` `EmptyStateCard` at 252-270, the
`pick-book` `EmptyStateCard` at 271-287) route their Back button through this single `goBack`.
If the synthesized native stack has back-history that does **not** trace to the Subjects tab
(e.g. a deep push chain from elsewhere, or a history entry left over from a prior screen), the
user lands wherever `router.back()` resolves — potentially Home — not Subjects. This matches
the WI's Description exactly ("history-sensitive fallback behavior"). Variant: single
variant (the empty-state family shares one `goBack`) — the WI's own AC already asks for "at
least one synthesized native-stack history case where `canGoBack()` is true but the app must
replace to Subjects," which is the correct regression shape. The `fallback` itself is already
flag-aware (`FEATURE_FLAGS.MODE_NAV_V2_ENABLED ? '/(app)/subjects' : '/(app)/library'`, lines
112-114) — the bug is `goBackOrReplace` preferring native history over that explicit target,
not the target itself.

### WI-1212 — AC (Enhancement)
`SubjectHubPreparing.tsx:1-123` currently renders `MagicPenAnimation`
(`apps/mobile/src/components/subject-hub/SubjectHubPreparing.tsx:5,66`). The target,
`BookPageFlipAnimation`, already exists and is used with an identical props shape
(`size`, `color`, `testID`) elsewhere in this same feature area —
`apps/mobile/src/app/(app)/pick-book/[subjectId].tsx:656-660` (filing overlay). This is a
same-shape component swap plus a test-assertion update in
`apps/mobile/src/components/subject-hub/SubjectHubPreparing.test.tsx`. Bounded, low-regression,
precedented — this is the one item in the slice I'd actually rate **Auto**-eligible rather than
Assisted (flagged as a candidate, not asserted — the shepherd should confirm no design-review
gate applies to animation choice before promoting).

### WI-1142 — AC (Hygiene, test-only)
Confirmed both cited artifacts and the precise claim:
- `apps/mobile/e2e-web/flows/mentor-audit/bridge-backstack.spec.ts:1-40` is a Playwright probe
  that deep-links into child topic/session/recap surfaces and asserts `page.goBack()` returns to
  the origin — but its seed, `seedMentorAuditBridgeBackstack` in
  `apps/api/src/services/test-seed.ts:5506` (comment block 5485-5505), sets
  `defaultAppContext: 'family'` explicitly (line 5494: "The owner starts in Family mode
  (`defaultAppContext: 'family'`)") — i.e. it seeds Family mode directly and never exercises the
  Study→Family switch-CTA transition.
- The Jest harness's static context is real: `apps/mobile/src/test-utils/screen-render.tsx:224-233`
  builds a `profileContextValue` object as a plain literal (not backed by React Query cache
  state), which cannot reproduce the optimistic `setQueriesData(['profiles'])` update the real
  switch-CTA flow performs.
- The guard-hold to regression-lock: `switchingToFamily` state in
  `apps/mobile/src/components/guards/RequireFamilyContext.tsx:33,45,59,101` (declared, checked
  in the render gate, set in `handleSwitchToFamily`, and disables the CTA while switching).

Note: `apps/mobile/test-utils/screen-render.tsx` (repo-root-relative, no `src/`) is a
**second, differently-sized file** (281 lines vs. 332) — not investigated further here since
out of WI-1142's stated scope, but worth a boy-scout flag for whoever picks this WI up: confirm
which harness the new test should extend, and whether the second file is dead weight.

AC as given (probe variant OR react-query-backed unit harness, must fail if the guard-hold is
reverted) is DoR-adequate; the two strategies are a genuine implementation-time choice, not
something refine needs to pre-decide (see §6).

---

## 2. WI-1184 staging-repro feasibility

**What wedges the walkthrough:** unknown from source — the current
`apps/mobile/src/app/(app)/child/[profileId]/subjects/[subjectId].tsx` has no visible hang
vector (§1 table). The original symptom was a CDP command timeout during a staging Chrome
walkthrough, and the screen has had 6 commits since (most recent `fb4e80ba0` per the WI body)
including a full data-fetching rework (three independent `useQuery` hooks with `enabled` guards
replacing whatever the original single-effect implementation was).

**Assessment: NOT obtainable from static source + a local/headless run in this dispatch.**
Reasons:
1. The symptom is runtime-specific to a live Chrome/CDP automation session against **staging**
   (not local dev) — reproducing it needs a seeded child profile + real network latency against
   the staging Neon/Worker deployment, which this read-only researcher dispatch has neither the
   mandate nor (per the researcher rails) the write/browse authority to attempt as part of a
   "produce a proposal" task.
2. Static review cannot distinguish the WI's own three candidate causes ("(a) already fixed as
   side-effect of the rework, (b) staging API latency causing CDP timeout, (c) a nav/routing
   edge case at the time") — all three are consistent with the current code.
3. Repo memory flags staging as a source of unrelated flakiness independent of this route
   (`project_staging_cpu_limit_free_plan`, `project_preview_chat_stuck_refetch_storm`), which
   raises the prior that this could be infra noise rather than a code defect — but that too
   requires a live run to confirm, not assert.

**Recommendation: repro is unobtainable from this researcher pass → treat as effectively
BLOCKED on a distinct capability.** Do not promote WI-1184 to Ready via static root-cause
authoring (there is no root cause to author yet). Keep `Execution Path=Assisted` (already set)
and recommend the shepherd either (a) dispatch a follow-up **browse/qa-type** executor with live
staging Chrome/CDP + doppler `-c stg` access to run the exact walkthrough the WI specifies
(Family Home → child profile → curriculum → subject row tap → `[subjectId]`), or (b) leave it
parked at low priority (P3, already so) since it is file-disjoint from every other item in this
slice and blocks nothing else in the workstream.

---

## 3. WP-grouping verification

**Advisory hypothesis:** WI-1208 / WI-1209 / WI-1210 are one coherent subject-hub empty-state +
Back-navigation surface → bundle as one WP.

**Verdict: PARTIALLY CONFIRMED, but the three do NOT share edited files — recommend keeping
them as three separately-sequenced Items, not one WP.** Confidence: high (based on direct file
reads, not inference).

Exact files each touches:

| WI | File(s) it edits | Function/lines |
|---|---|---|
| WI-1208 | `apps/mobile/src/app/(app)/pick-book/[subjectId].tsx` | `handleBack`, lines 123-133 (pending re-verify, §1) |
| WI-1209 | `apps/mobile/src/app/(app)/subject-hub/[subjectId]/index.tsx` | `goBack`, lines 108-116 |
| WI-1210 | `apps/api/src/services/subject.ts` (`getSubjectCurriculumStatuses`, lines 152-215); `apps/mobile/src/hooks/use-subject-hub.ts` (`computeEmptyKind`, lines 398-410) | data/hook layer only |

- WI-1208's file (`pick-book/[subjectId].tsx`) is **entirely disjoint** from the other two — no
  shared file, no shared function. It is only thematically adjacent (same "Subjects shell"
  back-navigation problem class).
- WI-1209 and WI-1210 both affect what the user sees on `subject-hub/[subjectId]/index.tsx`, but
  **at the code level WI-1210 never edits that file** — it changes the upstream signal
  (`curriculumStatus`/`emptyKind`) that the screen's existing render switch (lines 243-287)
  already consumes unchanged. WI-1209 edits a single function (`goBack`) in that same screen file
  that is orthogonal to the render switch WI-1210's data feeds. **Only risk:** if WI-1210's
  chosen fix approach introduces a *new* `SubjectHubEmptyKind` value (rather than just correcting
  which existing value each case resolves to), it would need to touch the render switch at
  `subject-hub/[subjectId]/index.tsx:243-287` — the same file WI-1209 edits, in a different
  region (243-287 vs. 108-116). Even then, line-disjoint edits in the same file are a low-risk
  serialize, not a hard conflict.

**Recommendation:** do not bundle into a WP. Sequence WI-1210 → WI-1209 (data-layer before
nav-layer, since 1210 is conceptually "lower in the stack" and its resolution approach
determines whether 1209 touches the same file region) as a **soft, not hard**, dependency; they
may run as parallel isolated-worktree branches if the shepherd is confident WI-1210 will not add
a new `emptyKind`, or serialized for safety if unsure. WI-1208 is fully independent and should
run first regardless, purely because its "fix" may collapse to a no-op verification.

**Does WI-1212 belong in this group?** No — confirmed separate. It edits
`apps/mobile/src/components/subject-hub/SubjectHubPreparing.tsx` only (a leaf visual component
consumed, unmodified-as-an-interface, by `subject-hub/[subjectId]/index.tsx:244-251`). No file
overlap with WI-1208/1209/1210. It is thematically adjacent (same screen family) but
functionally and file-wise independent — safe to run fully in parallel.

---

## 4. Independence + placement of the rest

**WI-1248 (shared Button sweep, WI-1081 tail) — confirmed independent/low-risk.** Touches CTA
`Pressable`s across ~60 files in `apps/mobile/src/app` (`rg 'rounded-button' … | grep -v Button
| grep -v test`, per the WI's own AC) plus ~31 files in `apps/mobile/src/components` — none of
which are the subject-hub/pick-book files this slice's other bugs touch (spot-checked: neither
`pick-book/[subjectId].tsx` nor `subject-hub/[subjectId]/index.tsx` nor `SubjectHubPreparing.tsx`
appear in the WI's own scoped file list). `Button.tsx`
(`apps/mobile/src/components/common/Button.tsx:1-96`) confirmed to support only
`primary`/`secondary`/`tertiary` variants (line 5) — no `danger` variant exists yet, consistent
with the WI's own callout about the two delete-account sites staying excluded. Genuinely
independent; safe to run in parallel with everything else in this slice. Its own AC already
mandates splitting into multiple reviewable PRs by screen-area — treat that as a **hint to the
shepherd to NOT track it as a single Workstream-Order slot** but as a rolling background item.

**WI-1142 (Study→Family switch-CTA regression coverage) — confirmed test-only.** Either adds a
new Playwright probe variant to `apps/mobile/e2e-web/flows/mentor-audit/` (seeded in Study mode,
performing the switch-CTA) or a new Jest test exercising
`apps/mobile/src/test-utils/screen-render.tsx`'s React-Query-backed path against
`RequireFamilyContext.tsx`'s `switchingToFamily` guard. No product-code file is a required edit
(the AC's regression target, `RequireFamilyContext.tsx`, is read/exercised, not necessarily
changed — the bug it's protecting against was fixed earlier per WI-878, this item only adds the
missing regression floor). **Test-heavy flag:** this WI is Jest/Playwright-test-heavy — per repo
memory (`feedback_worktree_jest_haste_pathology`,
`feedback_branch_not_worktree_for_jest_work`), Jest has known Haste-map pathology inside
`.worktrees/` isolated checkouts on this repo. **Recommend the shepherd route WI-1142 (and any
other Jest-heavy execution here) through a branch checkout, not an isolated worktree.**

---

## 5. Dependency graph + recommended ×100 Workstream Order

```
100  WI-1208  (pick-book Back — live-nav verify first; likely closes as already-fixed)
100  WI-1212  (SubjectHubPreparing animation swap — Auto candidate)
110  WI-1210  (subject.ts + use-subject-hub.ts — data-layer empty-state fix)
120  WI-1209  (subject-hub goBack fix — soft-depends on 1210's approach; see §3)
200  WI-1248  (Button sweep tail — rolling background, multi-PR, run whenever bandwidth allows)
200  WI-1142  (Study→Family regression test — branch checkout, not worktree)
300  WI-1184  (child subject route wedge — blocked on live staging repro, §2; unblocks nothing else, blocks on nothing else)
```

Already-Ready, not re-sequenced: **WI-1204** — pull first whenever the shepherd starts
Executing this workstream; it needs no further refinement.

**Parallel vs. serial:**
- **Fully parallel, any order:** WI-1208, WI-1212, WI-1248, WI-1142, WI-1184 — five mutually
  file-disjoint items. Each can run in its own isolated worktree (except WI-1142 — branch
  checkout per the Jest-haste note above) with zero merge risk against each other or against
  the 1210/1209 pair.
- **Soft-serial (100→110→120):** WI-1210 before WI-1209. Rationale: WI-1210's fix decides
  whether a new `emptyKind` is introduced; if it is, WI-1209's file
  (`subject-hub/[subjectId]/index.tsx`) gets touched by both in different line ranges (243-287
  vs. 108-116) — safe to serialize by merging 1210 first so 1209 rebases onto the settled
  render-switch shape rather than guessing at it. If the shepherd is confident WI-1210 will not
  add a new state (i.e. the fix is purely inside `getSubjectCurriculumStatuses` /
  `computeEmptyKind`'s existing three-branch precedence), these two may instead run in parallel
  — flagged as the shepherd's call, not a hard gate.
- **WI-1184 blocks nothing and is blocked by nothing** in this slice — it sits at order 300
  purely to reflect it's the lowest-priority (P3), least-actionable-right-now item, not because
  anything depends on it.

---

## 6. Open questions / design-UX forks

These are not answerable from canon (`navigation-contract.ts`,
`docs/flows/mobile-app-flow-inventory.md`, AGENTS.md) and need an operator/product call before
the affected item can be fully refined to Ready:

1. **WI-1210's unification rule.** Should a subject with zero generated books but ≥1 unpicked
   `bookSuggestions` row show the *same* empty state as a subject with zero books and zero
   suggestions (both "preparing"), or should the existing three-way split (preparing / pick-book
   / stuck) be preserved but with corrected precedence (e.g. "has suggestions, no generated
   book" should never render "Building curriculum" copy since nothing is actually generating)?
   This is a product decision about what to tell the user, not something derivable from
   `apps/api/src/services/subject.ts` or canon — it directly gates whether WI-1210's fix touches
   `subject-hub/[subjectId]/index.tsx`'s render switch (see §3's conditional file-overlap risk).
2. **WI-1209's back-target scope.** Should Back from any subject-hub empty state *always*
   discard native back-history and replace to Subjects (simplest, matches the AC literally), or
   only bypass native back when the back-stack's origin is confirmed outside the Subjects domain
   (preserving, e.g., a same-screen Manage-sheet-adjacent back if one ever exists)? The AC as
   written implies the former (simple, unconditional replace) — flagging only because
   `goBackOrReplace` is a shared helper used by several other screens
   (`apps/mobile/src/lib/navigation.ts:87-97`, its docstring explicitly warns callers about
   fallback-target correctness), so a fix localized to just this call site vs. a change to the
   shared helper's semantics is a design choice with wider blast-radius implications the
   shepherd should rule on, not something this researcher should presume.
3. **WI-1208's true repro path**, if the live-nav verify in §2 disposition (100, run first)
   confirms the symptom still reproduces — the actual origin screen and Back sequence that
   triggers it would need re-establishing before root-causing, since `handleBack` as currently
   written does not exhibit the described fallback on the flow this researcher traced.
