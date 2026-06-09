# Mentor-Is-The-App — Shell Redesign Spec

**Status:** Draft · 2026-06-09 · **Branch:** `new-llm` · **Profile:** design
**Problem source:** ~88 screens exist; most users never discover more than ~10. This is a **discovery problem, not a navigation problem** — the goal is to serve users what they don't know exists, at the right time.
**Inputs:** [30-agent codebase atlas](../reviews/2026-06-09-codebase-atlas/INDEX.md) · [One-screen second opinion](../reviews/2026-06-09-codebase-atlas/one-screen-second-opinion.md) (frequencies synthesis — this spec rules its open fork, see §10) · ratified identity model (`_wip/identity-foundation/`, person-based, edge-scoped mentor) · [audience matrix](../audience-matrix.md)
**What this spec is:** the converged product direction from the 2026-06-09 brainstorm — vision, shell, scope model, privacy contract, backend primitives, strangle sequencing. It is **not** an implementation plan; each phase in §11 gets its own plan under `docs/plans/` before build.
**ADR obligations:** §12 lists the ADR-class decisions inside this spec. None is ratified until its `MMT-ADR` lands in lockstep with the canon change (per MMT-ADR-0000). Until then this document is direction, not law.

---

## 1. Vision

**The mentor is the app.** Today the app is 88 rooms and the mentor lives in one of them. The redesign inverts this: the user's primary surface is the mentoring relationship, and screens exist only where a persistent surface genuinely beats a conversation moment. Target: ~88 screens → ~25.

Executed as a **strangle, not a greenfield rewrite**: every step in §11 is independently shippable, independently reversible, and independently valuable. The existing 88 screens remain the deterministic floor until evidence retires them.

## 2. Principles (acceptance criteria, not vibes)

Each principle has a mechanism and a checkable form:

| # | Principle | Mechanism | Checkable as |
|---|---|---|---|
| P1 | **Mentor drives, user steers** — at every layer the mentor proposes, the user can always decline or redirect | `GET /now` ranked feed + ever-present input bar | Every proposal surface has a decline; the input bar is reachable from every scope |
| P2 | **Moments, not screens** — value arrives as a moment in the feed, not a destination to discover | Activity ledger rows → feed cards | No new feature ships as a destination screen if its value is a moment |
| P3 | **Park-and-return is the magic** — "I don't get this, later" is honored and comes back | Existing primitives (parking lot, due-queue, `needs_deepening_topics`) surfaced through the feed + conversation | Park-and-return scenarios in the eval harness (`pnpm eval:llm`) **before** the exit funnel is dissolved; deterministic backstop in `/now` ranking (§8.1) |
| P4 | **The mentor narrates the invisible machine** — the 58+ Inngest functions become visible as mentor activity | Activity ledger, **template-rendered by default; LLM only when genuinely personal** | Every ledger `templateKey` renders without an LLM call; LLM narration is an explicit opt-in per row kind |

P2 and P4 share one mechanism (the ledger): P2 is what the user experiences, P4 is how the machine produces it.

P3 is the one principle the deterministic floor cannot protect — re-weaving lives in the conversation layer and degrades silently. Hence the eval-coverage gate and the deterministic backstop.

## 3. The shell — three tabs, every scope, no exceptions

Everyone sees the same three tabs. Tab *shape* never varies by role, age, mode, or ownership; only scope *content* varies.

| Tab | Job | Content |
|---|---|---|
| **Mentor** | Home. The conversation spine. | The `/now` card stack (1–3 ranked next actions, declinable) · moment cards from the activity ledger · the ever-present input bar with **camera button and Homework quick-chip** |
| **Subjects** | One hub per subject. | Per subject: "Next up" block, chapter sections, topic mastery, subject-scoped notes (§5) |
| **Journal** | The paper trail of the relationship. | Recaps · notes (cross-subject view) · mentor memory ("what the mentor knows about me") — per-scope semantics in §6.3 |

**Account/admin lives behind the avatar (top corner), never in a tab:** settings, language, billing, security, privacy/GDPR, add-child/linking admin. Owner gating applies inside the avatar sheet. Rationale: nobody browses admin; it's an errand, and the avatar→account pattern is a universal convention with zero discovery cost. This dissolves today's "More" tab and the You-tab hodgepodge.

**Two entry channels on the Mentor tab, by information origin:**

- **The feed** proposes *app-known* work (due cards, unfinished sessions, parked items, challenge-readiness, ledger moments). Mentor drives.
- **The bar (+ camera + Homework chip)** receives *world-known* work the app cannot know about — above all **homework** (a first-class session mode today: photo upload, `help_me` vs `check_answer`, homework-state sync, dictation-homework). User drives. Homework is the most frequent weekday reason a school kid opens the app and gets a permanent one-tap affordance, never discoverability-through-typing.

**App-open lands on the Mentor tab as a card feed** (deterministic, instant), not auto-opened into chat. This rules the second-opinion doc's open fork as **option A** — the proposal is glanceable and the conversation is opt-in per session, preserving the deterministic floor.

## 4. Scope model — the chip

**A scope is not a person's world — it is a relationship lens.** Me scope = my relationship with my own learning. Emma scope = my relationship with *Emma's* learning, rendered from edge-data the mentor maintains for me — never from Emma's private space. Scope-switching is never impersonation and never proxy. Same chip, same three tabs in every scope; only the lens changes.

### 4.1 Two account shapes, one shell

| Shape | Chip | Default scope |
|---|---|---|
| **Learner** (solo, or credentialized teen) | No chip (single implicit Me) | Me |
| **Supporter** | `[ Support hub ] [ <person> ]… [ Me — only if/when they study ]` | Support hub |

Today's matrix — guardian/learner tab shapes × V0/V1 × proxy mode × isOwner branching — collapses into chip scopes. "Supporter" is role-generic (parent, grandparent, any adult with an edge to a "charge" in the identity canon's terms); nothing in the model assumes "family".

### 4.2 Supporter lifecycle (three states)

1. **Signed up, nothing linked.** Chip shows Support hub only; the hub's content *is* the linking flow ("who are you supporting?" → invite/link). No Me scope, no empty learner furniture.
2. **Linked.** Hub + one scope per linked person. Hub = everything *addressed to the supporter*; person scopes = the relationship lens on each person (§6). The hub never duplicates a person's world; a person's scope never contains things addressed to the supporter.
3. **Supporter starts studying.** A **Me** scope appears in the chip — full learner experience. Default scope **stays the Support hub**. If they stop studying, Me persists (their Journal record remains) but goes quiet.

**Ruled: a supporter has no personal learner space until they actively start studying.** "Parent is a learner too by default" was rejected as behaviorally false — most supporters won't study, and a default scope with empty learner furniture is the design apologizing for itself.

Keep hub and person scopes separate even with a single linked person — the hub answers "what should I, the supporter, know or do?" (addressed to me); the person scope answers "what is my relationship with Emma's learning?". Collapsing them re-creates parent-flavored re-renderings that drift.

## 5. The Subjects tab — hub anatomy

One hub per subject, merging today's shelf + `progress/[subjectId]` + scattered per-subject surfaces. **Max depth 2, with structure** (the existing data model is subject → books/chapters → topics; the hub keeps it):

1. **"Next up" block on top** — the computed continuation (same source as the `/now` card), so a learner who just wants to keep going never reads the tree.
2. **Chapter sections below** — collapsible sections on the hub screen (not separate screens), topics inside with mastery state.
3. **Topic detail = sheet**, slid up over the hub, with detail and actions.
4. Subject-scoped notes live on the hub; the cross-subject notes view lives in Journal. **One store, two origins (my notes vs saved-from-mentor, authorship always visible), two views.**
5. If a subject grows past ~10 chapters / ~50 topics, the hub gains a search/filter line; the structure holds.

The Mentor-feed card never lists topics — it shows exactly one next action. Twenty physics topics never float anywhere.

## 6. Privacy & visibility — the supporter contract

The brainstorm's strongest ruling: **the supportee must never feel a supporter poking around their space** — even with chats walled off, browsable access to notes/journal/memory makes the kid perform instead of confess, and confession of confusion is the raw material of the product.

### 6.1 The contract

- **Structural data ("the grades layer") — visible to supporters:** subjects, mastery per chapter, streaks, activity level, next-up. Kids already live under this contract at school.
- **Artifacts — never reachable in everyday UI, on any edge:** the supportee's notes, Journal content, mentor memory, chat transcripts. Not "hidden by default" — *no screen exists* on which a supporter renders them.
- **The mentor is the channel:** the supporter's input bar in a person scope talks to the *supporter's own mentor* about that person ("how is Emma really doing in math?") and gets a curated, pedagogically-relevant answer from her data — interpretation, not raw exhaust.
- **Two-way transparency:** everything the mentor reports to a supporter about a person, that person can read. The supporter's per-person Journal (shared record, §6.3) and the supportee's "what was shared with your supporter" view are **one document read from two sides**. Nothing exists about you that you can't see.
- **Safety escalations cross every wall**, regardless of account type or contract — the existing tripwire design (escalate-not-refuse). Kid-visible contract wording: "your space is private, *unless you're not safe*."
- **Rights-exercise ≠ everyday visibility:** a guardian's GDPR rights on a managed account (export, deletion) live in the admin layer (avatar → privacy), deliberate and logged — never as ambient daily browsing.

### 6.2 Account types carry the visibility tier

Two account types replace any age-banded permission matrix:

| | **Managed** (under-13: managed only) | **Credentialized** (13+, own login) |
|---|---|---|
| Created by | Supporter; supporter holds consent + full admin | The person themselves |
| Contract event | Account creation *is* the ceremony | **Linking ceremony** — both sides see and accept the same visibility contract |
| Reporting tier | Richer default (fuller recaps, more granular attention items) | Strict edge model as in §6.1 |
| Artifacts (notes/chats/memory) | Still not in everyday UI (pedagogy is age-independent) | Never |
| Rights | Guardian exercises via admin layer | Person's own |

**Graduation** (managed → credentialized) is a designed product moment, not just an account migration: the visibility contract visibly upgrades, the kid is told exactly what their supporter sees from now on, and the mentor narrates it ("this is now your own space") — a natural activity-ledger moment.

### 6.3 What the three tabs render per scope

| Tab | Learner Me scope | Supporter — Support hub | Supporter — person scope (e.g. Emma) |
|---|---|---|---|
| **Mentor** | My feed (`/now` + moments) + my bar | Aggregated feed across all my people (attention items, milestones, family-wide recap) + bar to my mentor as advisor | *My feed about Emma* (attention items, milestones for her) + bar to *my* mentor *about* her — never her conversations |
| **Subjects** | My hubs, full | Overview rows grouped by person (subject, health, last activity) deep-linking into person scopes | Emma's hubs in the **structural rendering** — same hub component, permission-masked: chapters, mastery, activity, next-up; no notes, no artifacts |
| **Journal** | My recaps, notes, mentor memory | Family/cross-person recap archive + mentor memory *of me as supporter* | **The shared record**: every report ever made to me about Emma — mirrored readably on Emma's side |

A person scope must *read* as "the mentor reporting to you about Emma" — never as a redacted copy of her app. The poking feeling returns or stays away on that rendering choice alone.

## 7. What dies (target state; nothing dies before §11 says so)

- The **ModeSwitcher** (Study/Family) and **proxy mode** — replaced by chip scopes.
- The **tab-shape matrix** (V0 5-tab guardian / V1 4-tab guardian / learner) — one shell.
- **`ParentHomeScreen`** as a special shell — its heir is the Support-hub Mentor feed.
- The **More tab** and the **You-tab hodgepodge** — admin moves behind the avatar.
- The **3-screen session exit funnel** — dissolves into the mentor's wrap-up conversation turn, **only after** P3 park-and-return eval coverage exists (§2).
- The **Library tab** as a destination — search-first archive surfaces inside Subjects hubs and Journal.
- Most of the ~78 redundant front doors the atlas catalogued — the feed and bar are the front door; collapse follows usage evidence, not precedes it.

**Hard constraint until explicitly retired:** the V0 5-tab production shape (`MODE_NAV_V0_ENABLED=false` state) must not regress. The new shell rides behind its own flag (working name `MODE_NAV_V2_ENABLED`) alongside V0/V1, same staging pattern as the V1 guardian redesign. Retiring the constraint is a §13 open decision with a designated milestone, not a side effect.

## 8. Backend primitives (the only backend changes the shell needs)

### 8.1 `GET /now` — deterministic ranked feed

Server-computed, **no LLM in the ranking path**, template-rendered copy. Inputs per scope: unfinished session, due retention cards, parked items (with an aging rule so a parked item is *guaranteed* to surface within a bounded window even if the conversation layer never re-weaves it — the P3 deterministic backstop), challenge-readiness, ledger moments pending surfacing; for supporter scopes: attention items per edge. Output: 1–3 ranked cards `{ kind, templateKey, params, deepLink, scope }`. Deep links resolve through a **closed, server-validated route catalog** and push full ancestor chains (per the cross-stack-push rule).

### 8.2 Activity ledger — append-only mentor activity

One table (working name `mentor_activity_ledger`): `id, personId, edgeId|null, actorJob, kind, templateKey, params jsonb, visibility ('self'|'supporter'|'both'), createdAt, surfacedAt|null`. Every Inngest function that does user-relevant work writes a row via a helper wrapping `safeSend` semantics (a ledger write failure never breaks the job). The ledger feeds: feed moment cards, the supporter shared record (§6.3), GDPR-timer countdowns, and the graduation narration. **Rows render from `templateKey` + `params` with no LLM call; LLM narration is per-kind opt-in for genuinely personal moments only** — otherwise every background job becomes an LLM bill and a latency.

### 8.3 Retention gate

`applyRetentionUpdate()` as the single chokepoint unifying the ~5 existing write paths into `retention_cards`, so the feed's due-work ranking has one consistent source of truth.

Everything else backend stays as-is. The shell change is deliberately read-heavy.

## 9. Identity coupling

The scope chip, edges, managed/credentialized types, and the visibility contract **require the identity-foundation model to land** (person-based, edge-scoped mentor). The early strangle steps deliberately do not: `GET /now`, the activity ledger, the subject hub, and the Journal/avatar split all work against today's profile model. Sequencing in §11 keeps identity-independent phases first so the redesign never blocks on (and never blocks) the identity runway.

## 10. Rulings imported from / exported to the second-opinion doc

The [frequencies synthesis](../reviews/2026-06-09-codebase-atlas/one-screen-second-opinion.md) is adopted whole: proposal+chat is the product, the registry/route-catalog is the engine, the palette is demoted to search-first Library surfaces, progressive disclosure is hygiene, Pulse-style proactive outreach waits (passive cards only — pushing nudges at minors brushes the DSA Art 25/28 manipulation floor). Its open fork (A: Home-with-card vs B: open-into-chat) is **ruled A** by this spec (§3).

## 11. Strangle sequencing

Each phase ships independently, behind flags, and is valuable alone. Per-phase implementation plans go to `docs/plans/` before build.

| Phase | Ships | Identity-coupled? | Independently valuable because |
|---|---|---|---|
| **S0** | Activity ledger table + writer helper; `GET /now` endpoint; retention gate. Dark — no UI change. | No | Ledger starts accumulating history immediately; `/now` testable against real data |
| **S1** | New Mentor home (card feed + bar + camera/homework chip) behind `MODE_NAV_V2_ENABLED`, as "screen #89" — old nav untouched | No | The single highest-frequency surface; cheapest validation of the whole direction |
| **S2** | Subject hub (shelf + progress merge, §5) — also linkable from the *current* nav | No | Kills the worst redundancy cluster even if nothing else ships |
| **S3** | Journal tab + avatar admin split; park-and-return eval scenarios into `pnpm eval:llm` | No | You-tab hodgepodge dies; P3 gate satisfied |
| **S4** | Scope chip, Support hub, person scopes, structural rendering mask | **Yes** — needs identity-foundation | Mode/proxy/tab-matrix collapse |
| **S5** | Visibility contract surfaces: linking ceremony, two-way transparency views, managed/credentialized tiers, graduation moment | **Yes** | The trust layer |
| **S6** | Cutover & deletions: exit funnel dissolves (gated on S3 evals), old tabs retire, V0 constraint retirement **ruling executed** (§13) | — | The ~25-screen end state |

## 12. ADR obligations

ADR-class decisions in this spec (per the MMT-ADR-0000 significance gate), to be written in lockstep with their canon changes before the affected phase builds:

1. **One-shell/scope-chip model replacing mode/proxy/tab-shape matrix** (affects S4) — supersedes parts of the navigation-contract design.
2. **Supporter visibility contract** (edge-data only, mentor-as-channel, two-way transparency, safety exception) (affects S4/S5).
3. **Managed/credentialized as the visibility-tier carrier; under-13 managed-only; graduation** (affects S5) — may partially belong to the identity canon; reconcile with `_wip/identity-foundation/CANONICAL-SET.md` rather than duplicating.
4. **Activity ledger as the narration/moments substrate with template-first rendering** (affects S0) — borderline; write it if the ledger becomes load-bearing for compliance timers (it does, per §8.2 GDPR countdowns).

## 13. Open decisions (block the affected phase, not the spec)

1. **V0-preservation constraint retirement** — when (which S6 evidence threshold) does the `MODE_NAV_V0_ENABLED` no-regress constraint formally retire? Owner: product (Zuzana). Blocks S6 only.
2. **Identity-foundation sequencing confirmation** — S4/S5 assume the ratified `_wip/identity-foundation/` model lands first; confirm the runway's own timeline tolerates this consumer. Blocks S4.
3. **Managed-tier reporting richness** — exactly which extra granularity managed supporters get over credentialized (specced per-phase in S5's plan; the §6.1 artifact wall is not negotiable within it).
4. **Journal naming** — "Journal" vs "Notebook" (kid-test at S3; default Journal).

## 14. Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Feed unavailable | `GET /now` errors or >2s | Cached last feed + a deterministic local "continue where you left off" card; tabs fully functional | Pull-to-refresh; standard `ErrorFallback` (retry primary, Subjects secondary) |
| Empty feed | New account, nothing started | Onboarding proposal card ("let's set up your first subject") | Tap into onboarding conversation |
| LLM down | Provider outage | Bar replies with honest unavailable message; feed, hubs, Journal, review flows all still work (deterministic floor) | Automatic when provider recovers; nothing else degrades |
| Homework photo fails | Upload error / offline | Photo retained locally, inline retry on the card | Retry; or continue by typing |
| Parked item never re-woven | Conversation layer fails to resurface it | Item still appears as a `/now` card within the bounded aging window (§8.1 backstop) | None needed — backstop is automatic |
| Ledger write fails | DB/transient error in an Inngest job | Nothing — the job's core work completes; the moment card is simply absent | Sentry capture per safe-non-core pattern; no user action |
| Supporter, no links yet | Fresh supporter account | Support hub = linking flow, not an empty dashboard | Send/re-send invite |
| Link invite expired/declined | Time or supportee action | Hub card stating status plainly | Re-invite; or remove pending link |
| Person-scope fetch fails | Edge-data endpoint error | Scope-level `ErrorFallback`: retry primary, "back to Support hub" secondary | Retry |
| Turned 13, not yet graduated | Birthday passes on a managed account | Managed experience continues unchanged; graduation prompt card for supporter + child | Run graduation flow when ready; no forced cutover |
| Safety escalation, supporter unreachable | Tripwire fires, no reachable supporter channel | (Internal) escalation follows existing tripwire fallback policy | Per tripwire design; out of this spec's scope |
| Old nav regression risk | Any S1–S5 PR | Nothing — V0 5-tab mode is flag-isolated and test-guarded | Hard constraint per §7; CI test required per navigation-contract spec |

## 15. Ruled-decision log (brainstorm, 2026-06-09)

For traceability — all ruled in conversation with the product owner:

1. Direction = "core reframe" (mentor-is-the-app), executed as a strangle; ranked #1 over Vipps-modular-home, keep-88+registry, moments-reframe, research stack, intent-card hub, collapse-to-3, graph-DB (rejected outright).
2. Four principles adopted as acceptance criteria with mechanisms (§2), incl. template-first narration discipline.
3. Tabs = Mentor / Subjects / **Journal**; admin behind avatar (You-tab hodgepodge rejected).
4. Homework = first-class world-known entry: permanent camera + Homework chip on the bar.
5. Subject hub keeps chapter structure; Next-up block; topic sheets; max depth 2; no floating topic clouds.
6. Supporter has **no Me scope until they actively study**; Support hub is the supporter default ("person-first parent" rejected).
7. Scope = relationship lens, not impersonation; same three tabs in every scope (mantra preserved after a near-miss collapse of person scopes).
8. Supporters never reach supportee artifacts (notes/Journal/memory/chats) in everyday UI; structural "grades layer" + mentor reports only; two-way transparency; safety crosses all walls.
9. Managed (under-13 only option) vs credentialized accounts carry the visibility tier; graduation is a designed moment.
10. App-open = Mentor tab card feed (second-opinion fork ruled A).

---

## Annex A — Doc disposition: what parks if this spec is built

**Status:** Analysis · 2026-06-10 · produced by a 14-agent sweep of every doc in `docs/specs/` and `docs/plans/` (36 docs, excluding this spec), each classified against §3/§4/§7/§9/§11.

**Method.** Each doc was read in full alongside this spec and assigned exactly one relationship label. Classifications are evidence-cited per doc in the source sweep; this annex is the rolled-up ledger. It is **direction, not a status flip** — no doc's `status:` header is changed by this annex. Flipping headers (or annotating `epics.md`) is a follow-up action, owner: product.

**Headline.** Building this spec does **not** park the backlog wholesale. Because the redesign is a strangle that keeps the backend and data model (§8: "everything else backend stays as-is"), only the **shell / nav / parent-surface** docs die. The recurring shape for feature plans is *identity-independent slice ships now (S0–S3); proxy/parent/identity-coupled half folds into S4/S5*.

**Disposition tally:** 6 fully park · 15 partial · 1 folds in · 2 feed in as prerequisites · 11 survive untouched · 1 needs annotation (epics.md). (Some "partial" docs also carry a prerequisite half — counted once under partial.)

### A.1 — Fully park (superseded by §7 "what dies")

These design the exact constructs §7 demolishes (Study/Family ModeSwitcher, tab-shape matrix, `ParentHomeScreen` as a special shell, old `family_links`/org-membership RLS).

| Doc | Why it parks |
|---|---|
| `specs/2026-05-19-study-and-family-mode-navigation-FULL` | Study/Family mode + tab-shape matrix → replaced by scope chip (§4) |
| `plans/2026-05-19-study-and-family-mode-navigation-FULL` | Implementation of same; shipped infra (migration `0089`, recaps API) becomes an S4 strangle target, not a foundation |
| `specs/2026-05-13-parent-child-surfaces-information-architecture` | `ParentHomeScreen`-launcher model; heir is the Support-hub feed (§6.3) |
| `plans/2026-05-30-parent-home-mentor-briefing` | Redesigns the very `ParentHomeScreen` §7 deletes |
| `plans/2026-05-31-identity-t3-access-control-rls` | Built on the reverted old-identity `T1` org/membership schema; dead under the ratified `_wip/identity-foundation/` clean-cut |
| `plans/2026-04-15-S06-rls-phase-2-4-enforcement` | `family_links`-based RLS; the person/edge model removes `family_links` |

> Parking the two nav-mode docs does **not** mean deleting shipped V0/V1 nav — §7's hard constraint keeps `MODE_NAV_V0_ENABLED=false` from regressing until the §13 S6 retirement ruling. Park the *plan* ≠ delete the *flag-isolated shipped code*.

### A.2 — Partial (do-now slice survives; feature-half parks or folds to S4/S5)

| Doc | Survives now | Parks / folds |
|---|---|---|
| `plans/2026-06-09-more-off-nav-home-launched` | Practice-tab promotion | "More off-nav" — superseded by S3 avatar split |
| `plans/2026-05-09-progress-tab-currently-working-on` | backend helper + report-card bugfixes | new card + section reorder → S2 hub |
| `specs/2026-05-12-chat-notes-bookmarks` | Steps 1–4 (shipped) | Step 5 (Library search) → folds into Subjects/Journal |
| `specs/2026-06-08-memory-task-review-continuity` | `retrieval_events` + relearn queue = prereq plumbing for `/now` | standalone "opener" surface → S3 |
| `plans/2026-05-31-product-continuity-low-hanging-fruit` | recap/mic copy items (Phase C) | proxy-coupled tasks (Phase B) park; copy layer folds into feed |
| `specs/2026-05-18-trial-intent-save-onboarding` | intent/preview/claim mechanics | parent-landing routing (§4.2) |
| `specs/2026-05-27-warm-chat-greeting` | greeting template (UI-only) | "auto-open into chat" framing → superseded by card-feed (§3 option A) |
| `plans/2026-05-31-notification-reachability-nudges` | reachability bugfix `T1`–`T3` | child→parent nudges `T4`–`T6` → S4/S5 |
| `plans/2026-05-31-billing-recovery-learner-capacity` | payment-failed alerts `T1`–`T2` | child-capacity/top-up `T3`–`T5` → S4/S5 |
| `specs/2026-04-07-epic-17-voice-first-design` | session-layer STT/TTS on the bar (Phase A/B) | home-entry framing superseded; hands-free/time-limits identity-coupled |
| `specs/2026-05-06-hidden-wins-phase-1-2-prereqs` | consent-redaction + push-classification (2A/2B, shipped) | Phase 1 `ParentHomeScreen` types superseded (already shipped) |
| `specs/2026-06-03-owner-impact-audit-top-10` | ~all items survive as backlog | 2 nav-collapse runners-up gate on S6 |
| `plans/2026-05-29-layered-codebase-risk-audit` | backend findings | `T9` parent/family/tab-matrix findings target soon-deleted screens |
| `plans/2026-05-30-topic-mastery-three-states` | backend (mastery columns/API) = prereq for S2 hub | library-UI tasks re-home into the S2 plan |

### A.3 — Feeds in (the spec needs these; doesn't replace them)

- `specs/2026-06-08-forever-notebook-north-star` — **folds in** as the design invariants for the Journal tab (S3) + Subjects-hub notes (S2).
- `specs/2026-06-08-concept-capture-layer-design` — **prerequisite** data layer (concepts/mastery tables) the Journal/Subjects note-states render; gated on the identity baseline reset.

### A.4 — Survives untouched (parallel, no shell coupling)

`specs/2026-06-06-llm-routing-and-judge-architecture` · `specs/2026-06-06-llm-routing-gpt-oss-cerebras-build` · `specs/2026-05-26-commit-pr-pipeline-gates` · `plans/2026-05-12-shared-test-utility-framework-plan` · `plans/2026-05-19-mobile-lab-macos-setup-plan` · `plans/2026-05-25-agents-claude-md-merge-plan` · `plans/2026-05-24-pending-notices-type-pgenum-migration` · `plans/2026-05-31-resumable-practice-state` · `plans/2026-05-31-profile-setup-personalization-corrections` · `plans/2026-06-08-note-correctness-and-challenge-draft` (already parked on identity, not by this spec) · `specs/2026-06-03-review-relearn-findings-and-high-impact-todos` (findings; survives as reference).

Already **done/shipped** (nothing to park): `plans/2026-05-31-learning-library-cleanup` · `plans/2026-06-08-identity-foundation-canon-shape-scrub`.

### A.5 — Needs annotation, not parking

- `specs/epics.md` (living register + frozen ARCH-N): annotate superseded items — Epic 12 (Home/Book/More target shell), Epic 4 parent-dashboard/UX-13, Epic 7 Library-as-tab, `FR6` ("switch into child's profile" — conflicts directly with the §6.1 artifact wall), `WEB-A` parent-control-center stories. Epics 15/16 (visible progress, adaptive memory) become *more* load-bearing as activity-ledger inputs (§8.2).

### A.6 — Sequencing signal

The clean split across all 36 docs: **proxy / parent-home / scope** work waits for identity-foundation (S4/S5); **backend-data or read-rendering** work can proceed now (S0–S3). Three docs are already parked for *identity* reasons independent of this spec (`note-correctness`, `resumable-practice` re-triage, `billing-recovery`) — this spec doesn't change their verdict, it gives them a destination.
