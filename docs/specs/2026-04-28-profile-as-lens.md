# Profile-as-Lens — Reporting, Navigation, and Quiet Defaults

**Date:** 2026-04-28 (rev 4 — 2026-04-29 — phased rollout, premise-tested gates)
**Status:** Phase 1 ready for review · Phase 2/3 conditional on validation
**Author:** Driven by parent-flow audit findings (BUG-896 → BUG-911)
**Related:** [`project_parent_visibility_spec.md` (memory)](../../) — extends progress-highlights work

## Purpose

The app supports four user shapes — solo learner, parent + learner, parent only, child — but today's UI fully serves only two. This spec defines a single architectural pattern that serves all four shapes from the same primitives.

The guiding principle is that **the user should rarely have to decide anything**. Defaults are smart, behaviors emerge naturally from sustained patterns, and controls are reachable when sought but never in the user's path. Friction (a card to dismiss, a toggle to flip, a confirmation to acknowledge) is itself a UX cost.

Three design rules:

1. **Shape is derived; controls are accessible but not in the path.**
2. **No prompts, no modals, no entry cards in normal navigation.**
3. **Transitions are announced once, quietly.**

## Phasing — read this first

This spec describes a multi-phase design. Each phase has an explicit gate: a phase only ships when the previous phase's premises are validated by telemetry or user research.

- **Phase 1 — Foundation.** No-regrets refactoring + microcopy + per-profile reporting on `/progress`. Closes 7 of the 10 audit bugs this spec covers (BUG-898, 900, 901, 903, 904, 906, 909). Architecturally reversible. Approved for immediate implementation.
- **Phase 2 — Architectural moves.** Family tab, multi-lens Home, Privacy & Lenses panel, soft states, per-profile notifications. Larger structural commitment. **Gated on validating the Phase 1 premises** (see "Premises and Unknowns" below).
- **Phase 3 — New features.** Send a Nudge, child user-shape design pass, withdrawal consent rev. Depends on Phase 2 surfaces. **Gated on Phase 2 telemetry showing the architecture is working.**

The phasing is the single most important commitment in this document. Skipping ahead defeats the point — Phase 2's design will be informed by Phase 1's evidence, not by my guesses.

## Premises and Unknowns

The whole spec rests on a small number of beliefs about what users want. Each is plausible but unverified. The Phase 2/3 gate is whether each premise earns evidence during Phase 1.

| Premise | Why we believe it (today) | What would falsify it (during Phase 1) |
|---------|---------------------------|----------------------------------------|
| **P1. Parents want their own learning report.** | Audit observation: parent has rich child reporting, no own. Home already shows two intent cards ("Check child's progress" + "Learn something") implying dual identity. | <10% of parents with ≥1 own-session visit `/progress` monthly. OR <10% of parents have any own-sessions in 90 days. OR explicit user research saying "I'm here for my kid, not for me." |
| **P2. A Family tab improves on the current scattered surfaces.** | Audit BUG-905 (back button hardcoded to /more), navigation burial of /dashboard, scattered child management across More + child/ + dashboard. | User research showing parents don't expect a Family tab and find it confusing. OR analytics showing post-launch tab tap rate <5% with high bounce. |
| **P3. Per-profile quota breakdown is wanted.** | Audit BUG-906: parent dashboard says "0 sessions" while child detail says "2 sessions" — parents have no clear ownership of usage. | Top user-reported quota concern is "running out" not "who's using it." Per-profile breakdown is rarely viewed (tracked via section impressions on `/subscription`). |
| **P4. Self-lens on Home is wanted (vs. just on `/progress`).** | Phase 1 will show whether parents who use `/progress` reports also wish they were on Home. | Phase 1 telemetry: parents who visit `/progress` ≥3x/month do not request a Home shortcut (qualitative); or `/progress` is rarely visited. |
| **P5. Send-a-Nudge solves a real parent need.** | Industry pattern (Duolingo family pings); audit-implicit observation that parent dashboard says "TestKid hasn't practiced this week" without offering action. | Phase 2 user research showing parents already nudge off-platform (text, in-person) and don't want app-mediated. |
| **P6. Children deserve their own design pass distinct from generic learner.** | 11+ user base, many will be solo or guardian-supervised; child-specific privacy concerns (siblings, parent-visibility). | Telemetry showing child profiles barely interact with settings; no privacy-related issues raised. |

**Falsification protocol:** If Phase 1 telemetry falsifies P1, P2, or P3, Phase 2 does not ship in its current form. The team writes a new Phase 2 spec accounting for what was learned, or stops here. P4, P5, P6 are evaluated at Phase 2 → Phase 3 transition.

## Goals

1. Every learner gets reporting on their own learning, using the same components.
2. The app's structure adapts naturally to relationships and behavior, with quiet announcements when it does.
3. The user reaches for controls; controls don't reach for the user.
4. Settings, quota, and notifications are scoped explicitly. Owner of every surface is named.
5. Children are a first-class shape with appropriate copy and respect.

## Non-goals

- No stored "user shape" field.
- No bottom-nav variation across shapes within a single render. (Family tab presence depends on relationships but is announced when added.)
- No mode toggles.
- No activity-triggered modals or prompts.
- No co-parent / multi-guardian UX coordination in this spec — separate spec.
- No shared-subject hooks.
- No `/child/[profileId]/*` URL prefix rename.

## User shapes

| Shape | `family_links` | Phase 1: Where reports live | Phase 2: Lenses on Home |
|-------|----------------|------------------------------|--------------------------|
| **Solo learner** | empty | `/progress` (already) | Self only |
| **Parent + learner** | guardian-of(child) | `/progress` (own) + `/child/[id]` (kid) | Self + per-child + Family ops (mechanism TBD by P4 evidence) |
| **Parent only** | guardian-of(child) | `/child/[id]` (kid) only | Per-child + Family ops |
| **Child** | learner-of(parent) | `/progress` (own) | Self only |

In Phase 1, no Self lens appears on Home for any shape. Reports for the active profile are accessible through the existing Progress tab, with Phase 1 PR 3 making them functional. In Phase 2, the multi-lens Home is built — but the **mechanism** for surfacing Self lens (auto-derived threshold, explicit user toggle, preview card, or some hybrid) is determined by Phase 1 evidence rather than guessed today.

## Phase 1 — Foundation

The four no-regrets PRs. None require architectural commitments; all close audit bugs immediately.

### Move 1 — Profile-agnostic reporting components (PR 1)

Lift `WeeklyReportCard`, `MonthlyReportCard`, `GrowthChart`, `RecentSessionsList`, `MasteredTopicsCard`, `VocabularySummary`, `ReportsList` out of `/child/[profileId]/*` into `apps/mobile/src/components/reporting/`. Each takes `profileId` as a prop. The `/child/[profileId]/*` screens become thin wrappers for page chrome.

Effort: ~1 sprint. Risk: refactor only, behavior unchanged.

### Self-reporting on `/progress` (PR 3)

Mount the lifted components inside `/progress` for the active profile, displayed if the active profile has any session history.

- For solo learners and children: shows naturally (they have history).
- For parent + learner: shows once they have ≥1 own-session.
- For parent only with zero own-sessions: shows an empty state with a "Start your own learning" CTA (which is itself a fine answer to "I want to learn too" — they tap it, do a session, the reports appear next time).

This is the **single change** that Phase 1 makes to user-facing surfaces beyond bug fixes. No Home card, no auto-enable, no toggle. The Progress tab is where progress lives — straightforward.

The decision about whether to additionally surface this on Home (and how) is Phase 2, gated on whether `/progress` is actually used.

### Per-profile quota breakdown (PR 2)

`/subscription` USAGE THIS MONTH gets a per-profile rendering owner-only (not shared with non-owners in Phase 1):

```
Usage this month       90 / 1500 questions used
  Your share            30
  TestKid               60
  Family aggregate      90 / 1500
Quota resets on May 15
Subscription renews on May 18
```

Backend already tracks per-profile usage; extend `GET /v1/subscription/usage` to return `by_profile` breakdown. Owner sees the full breakdown by default. Phase 2 adds the "share with non-owners" privacy toggle.

Closes BUG-906 (data inconsistency surface), BUG-898 (dual-date confusion now labeled clearly).

### Microcopy pass (PR 4)

A focused sweep across `/more`, `/child/[id]/*`, `/create-profile`, `/subscription`:

1. **Sentence case for owner-scoped headers everywhere.** "Your learning mode" / "Liam's learning mode." Replaces all `tracking-wider uppercase` styles for owner-scoped content.
2. **CSS `text-transform: uppercase` banned for any user-facing content** that may include non-ASCII characters. Headers, buttons, badges, labels, anything user-facing. Use sentence case at source string.
3. **Forms branched by URL/navigation context.** `/create-profile?for=child` shows "your child's age." `/create-profile` (no param) shows "your age."
4. **Cross-links scale to N profiles.**
   - 0 children: no cross-link.
   - 1 child: *"To change {Child}'s preferences, open their profile →"*.
   - 2+ children: *"To change a child's preferences, open Family →"* (Phase 1: link is to `/dashboard`; Phase 2: to `/family`).

Effort: ~1 day. Closes BUG-900, BUG-909.

### Phase 1 acceptance criteria

A reviewer can verify Phase 1 is met by:

1. **Solo learner can locate their monthly report in ≤ 2 taps from any starting screen.**
2. **Parent + learner who has completed ≥1 own-session sees their reports on `/progress`.**
3. **Parent + learner who has never run an own-session sees a "Start your own learning" CTA on `/progress`** with no other UI elements claiming to track them.
4. **Owner viewing `/subscription` sees per-profile breakdown rows under USAGE THIS MONTH.**
5. **Non-owner viewing `/subscription` sees only their own slice and the family aggregate, never per-profile breakdown for other profiles.**
6. **`/create-profile?for=child` shows "your child's age" / "your child's birth date."**
7. **No CSS `text-transform: uppercase` exists in any user-facing string** that could contain non-ASCII content.
8. **No new top-level navigation surface (Family tab) is added in Phase 1.**
9. **No automatic Home card or modal asks the user about tracking their own learning.**

### Phase 1 telemetry to collect (informs Phase 2 gates)

To validate or falsify the premises before Phase 2 ships, Phase 1 PRs include analytics events:

- `progress_report_viewed` with `profile_id`, `is_active_profile_owner`, `report_type` (weekly / monthly).
- `subscription_breakdown_viewed` with `is_owner`, `breakdown_section_visible`.
- `child_progress_navigated` with source (Home intent card / More → Family / direct deep link).
- `progress_empty_state_cta_tapped` for parent-only "Start your own learning" CTA.

After 30-60 days of Phase 1 in production, these events become the Phase 2 gate input.

## Phase 2 — Architectural moves (gated on P1, P2, P3 validation)

Phase 2 ships only after Phase 1 telemetry and a brief user-research session validate (or refine) the premises. The design content here describes the *intended shape* of Phase 2; specific decisions (Self-lens entry mechanism, lens stacking rules, etc.) are made with Phase 1 evidence in hand.

### Move 2 — Family tab (PR 6)

Bottom nav: `Tabs.Screen` for `Family` is conditionally mounted when `useFamilyLinks().length > 0`. Family tab is the home for cross-profile concerns: children list, child reports, family pool / subscription summary, add a child, family settings.

- **Adding a child:** Family tab appears on next render. First visit: single dismissible inline cue. Dismissed once, gone.
- **Withdrawing consent:** Banner on Home and Family — *"{Child}'s account closes in {N} days · Reverse"*. Push notification 24h before grace expires. After grace: tab updates to "Closed accounts" or disappears entirely (Phase 3 detail).
- **`/dashboard`:** indefinite redirect to `/family`, with 90-day deprecation cycle if ever sunset.

Effort: ~1.5 sprints. Closes BUG-896, BUG-897, BUG-905.

### Move 3 — Multi-lens Home (PR 7) — Self-lens mechanism deferred to Phase 2 design

Composition rules:
- **Self lens** appears according to a mechanism determined at Phase 2 design time. Candidates (in rough order of friction):
  - **Mechanism A (auto-enable):** appears after sustained own-learning (e.g. 3 sessions / 7 days). One toast announcement; one-tap hide on the lens. *Risk:* threshold may not match real usage.
  - **Mechanism B (explicit but non-friction):** Privacy & Lenses panel has a single toggle "Show my own learning summary on Home." Default off for parents. *Risk:* discoverability — most parents never visit Privacy & Lenses.
  - **Mechanism C (preview card):** A small, dismissible card on Home shows the user what their Self lens *would* look like (filled with their actual data) with a "Show this on Home" tap. *Risk:* still a card to dismiss, friction-y.
  - **Mechanism D (no Home surface):** Self lens never appears on Home; lives only on `/progress`. *Risk:* parents don't discover their own reporting.
  Mechanism is chosen at Phase 2 design time based on Phase 1 evidence: how often parents visit `/progress`, what they say in user research, observed friction patterns.
- **Per-child lens** appears once per child where the user hasn't explicitly hidden it. Default visible.
- **Family ops lens** appears iff `family_links.length > 0`.

#### Lens order (auto, no setting)

Per-child lenses are sorted most-recent-activity-first, recomputed every render. Small label *"Sorted by recent activity"* sits above the per-child stack. No order-mode setting in Phase 2.

For families with ≥4 children, lenses 3+ collapsed by default to one-line headlines.

Long-press a per-child lens for menu — **Move up · Move down · Move to top · Hide on Home**. The first long-press silently switches that child's order to manual mode. No mode toggle, no setting screen — discovered by gesture.

#### Empty Home and Stale Returning

- **Empty Home:** If Self lens hidden AND no children AND no own-sessions → starter Home with two cards (Start learning / Add a profile).
- **Stale Returning:** If Self lens visible AND last own-session > 30 days → soft "Welcome back" lens with refresh CTA, no streak counter, no growth chart.

### Privacy & Lenses settings panel (PR 5)

Five rows. Most users never visit:

```
Show my own learning summary on Home          [varies by mechanism]
Per-child preferences                         [collapsible group]
Share family pool breakdown with everyone     [toggle, owner only]
When I withdraw consent for a child           [Auto · Always archive · Never archive]
Notifications                                 [collapsible group]
```

The first row's behavior depends on which Self-lens mechanism Phase 2 chose. The "When I withdraw consent" setting is forward-looking — never asked at the grief moment of withdrawal.

### Per-profile notifications (PR 5 sub)

- **`self_notifications_enabled`** — solo / child default `true`. For parents, defaults match Self-lens visibility (or stays `false` if Self-lens never enabled).
- **`child_notifications_enabled`** — guardian-side. Default `true`.
- **`nudge_notifications_enabled`** — child-side. Default `true` per child profile (Phase 3 detail).

OS-level master switch in More remains as kill switch above all of these.

### Soft states (PR 9)

| Soft state | Trigger | Per-child lens behavior |
|------------|---------|--------------------------|
| **Active** | Normal | Full lens with stats and CTAs |
| **Paused** | Parent paused | "Paused — resume" CTA |
| **Quota-locked** | Pool exhausted | "Family pool used up" + manage CTA |
| **Trial expiry imminent** | <72h to trial end | Banner "Trial ends Friday — manage" |
| **Withdraw consent grace** | 7-day grace | Countdown on Home + Family |
| **Archived** | Past grace, ≤30d | Read-only inside "Closed accounts" |
| **Deleted** | Past grace + retention | All references gone |

### Drafts (Phase 2, no toggle)

Auto-save / auto-restore via AsyncStorage with key `draft:v1:{profileId}:{surface}:{contextId}`. 24h TTL. Non-blocking toast on restore — no Restore button, content auto-fills.

### Quota usage breakdown — sharing toggle (Phase 2)

Builds on Phase 1's owner-only breakdown. Phase 2 adds the `family_pool_breakdown_shared` toggle (owner-only setting in Privacy & Lenses). When enabled, non-owners see the full per-profile breakdown. Default off.

Children never see the breakdown unless owner explicitly enables sharing.

### Phase 2 acceptance criteria (subset; full set written at Phase 2 design time)

1. **Family tab appears on next render after a parent adds their first child.**
2. **First visit to Family tab shows a single dismissible orientation cue.**
3. **A child profile, even with breakdown sharing enabled, never sees other children's per-profile usage.**
4. **A 4-child family Home renders without overflow on a 5.8" device.** Lenses 3 and 4 collapsed by default.
5. **Privacy & Lenses panel has ≤5 always-visible top-level rows.**
6. **A draft survives an app kill within 24h** and auto-restores on next launch with a non-blocking toast.
7. **Subscription tier changes mid-session do not interrupt** and do not surface banners until the user opens Subscription or Family.
8. **Withdraw Consent grace surfaces a countdown banner on both Home and Family.** Push fires 24h before expiry.
9. **For an under-13 child, all data is deleted at grace expiry. No archive.** (Phase 3 detail; Phase 2 ships the surface.)
10. **The Self-lens mechanism (chosen during Phase 2 design) does not show modals, prompts, or activity-triggered cards.** Verified by completing a session and observing no new UI.

## Phase 3 — New features (gated on P5, P6 validation + Phase 2 telemetry)

### Send a Nudge (PR 8)

Full subspec, kept intact from v4:

**Consent at child profile creation.** Single inline toggle (default ON) inside the child-creation flow. Stored as `receive_nudges_enabled` on the child profile. Child can revoke any time from their own More.

**Behavior.** Send-a-nudge button on per-child Home lens or `/family/[childId]`. If `receive_nudges_enabled === false`, button greyed with helper text *"Nudges paused"*. Info popover *"Nudges are paused for {Child}."* No causal disclosure.

If enabled and within throttle, push fires:
- Title: *"{Parent} cheering you on"*
- Body: *"Up for a quick MentoMate session today?"*
- Tap → deep-link to `/library`.

**Throttle.** Per parent → per child: max 1/day, 3/week. After cap: button greyed with *"Weekly nudges sent. Resets Monday."*

**Failure cases.** Push delivery fails: silent. OS-level push disabled: silent. Logging: `nudge_sent` event.

### Child user-shape design pass (PR 10)

What children see:
- Self lens with their own weekly snapshot, growth chart, recent sessions, mastered topics, vocabulary.
- Simple *"{N} questions left today · {M} left this month"* — total remaining, never per-profile breakdown.

What they don't see:
- Other children's data, ever.
- Per-profile usage breakdown, unless owner explicitly enabled `family_pool_breakdown_shared`.
- The Family tab — never appears for child profiles regardless of relationships.
- Subscription management, pricing, plan cards.

Microcopy register for children:
- "Your week," not "Your learning summary."
- Avoid "growth," "mastery," "retention" — words that sound like grading. Use "what you learned," "your steady wins," "what came back to you this week."
- Streak counters use neutral framing.

### Withdrawal consent rev (PR 11)

Single confirmation in the withdraw flow:

> **Withdraw consent for {Child}?**
> {Child}'s account and learning data will be deleted after a 7-day grace period. *(For under-13 accounts, deletion is immediate at grace expiry to align with privacy law.)*
> [ Withdraw ] [ Cancel ]

No archive toggle inside the flow. The archive behavior is determined by:
1. If `archive_when_i_withdraw_consent` is set (forward-looking setting in Privacy & Lenses) — use it.
2. Else if child age < 13 — no archive.
3. Else — 30-day archive.

After grace expiry: one-time toast confirms.

The child sees their own exit acknowledged from their own seat.

## Failure modes

### Phase 1 failure modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| **`/progress` empty for parent + learner** | No own-sessions yet | "Start your own learning" empty-state with subject picker CTA | Tap CTA |
| **Per-profile quota endpoint unavailable** | API not yet deployed | Aggregate-only render; inline note "Per-profile breakdown unavailable" | Graceful degrade |
| **Microcopy mismatch on existing deep-linked screens** | User has stale URL bookmarked | Existing pre-microcopy copy renders; updated on next deploy | None needed |

### Phase 2 failure modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| **`family_links` lookup fails** | Network drop | Full-screen "Couldn't load · Retry" with auto-retry on foreground | Visible Retry + auto-retry |
| **Profile-as-lens stale `profileId`** | URL outlived profile | Empty state with two CTAs: "Go to Family" / "Go to Home" | Two visible buttons |
| **Subscription tier changes mid-session** | RevenueCat webhook | No interruption. Numbers updated silently. | None needed |
| **Active edit on Family tab when shape changes** | Grace expiry mid-edit | Edit persisted to AsyncStorage; auto-restored on next launch | No action |
| **Withdrawal countdown push fails** | OS push down | In-app banner remains on Home + Family | In-app surface always present |
| **Long-press for manual reorder unintuitive on web** | RN Web platform | Privacy & Lenses panel exposes per-child reorder explicitly | Settings fallback |

### Phase 3 failure modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| **Nudge sent to child with `receive_nudges_enabled === false`** | Edge case | Greyed button + neutral helper text | Respect choice |
| **Nudge throttle exceeded** | 4th attempt this week | "Weekly nudges sent. Resets Monday." | Wait |

## Migration path

| Phase | PR | Scope | Effort | Closes |
|-------|----|----|--------|--------|
| **1** | 1 | Component lift — extract reporting into `components/reporting/` | ~1 sprint | Foundation |
| **1** | 2 | Per-profile quota endpoint + owner breakdown rendering | ~3 days | BUG-906, BUG-898 |
| **1** | 3 | Self-reporting on `/progress` for active profile (when has data) | ~3 days | BUG-901, BUG-903, BUG-904 |
| **1** | 4 | Microcopy pass — sentence case, uppercase ban, `for=child`, scaling cross-links | ~1 day | BUG-900, BUG-909 |
| **--** | -- | **Phase 1 → Phase 2 gate: validate P1, P2, P3 with telemetry + user research (~30-60 days)** | -- | -- |
| **2** | 5 | Privacy & Lenses settings panel + per-profile notifications + breakdown sharing toggle | ~3 days | New surface |
| **2** | 6 | Family tab + indefinite /dashboard redirect + cross-tab withdrawal countdown + 24h push | ~1.5 sprints | BUG-896, BUG-897, BUG-905 |
| **2** | 7 | Multi-lens Home (mechanism for Self-lens chosen at Phase 2 design time, recency-sorted per-child, Empty Home, Stale Returning, long-press reorder, kebab hide) | ~1.5 sprints | New shape |
| **2** | 9 | Soft-state lens rendering | ~3 days | New surface |
| **--** | -- | **Phase 2 → Phase 3 gate: validate P5, P6 with user research; Phase 2 architecture proven solid** | -- | -- |
| **3** | 8 | Send a Nudge — consent at profile creation, throttle, neutral copy | ~1 sprint | New feature |
| **3** | 10 | Child user-shape design pass — copy register, restricted views, withdrawal acknowledgement | ~1 sprint | Children-as-users |
| **3** | 11 | Withdrawal consent rev — age-conditional default, forward-looking setting, no in-flow toggle | ~3 days | Privacy alignment |

PR 6 + PR 7 ship behind `home_lens_v2` flag. Phase 2 and Phase 3 PRs each behind their own flag.

## Resolved open questions

- **Q1 (Self-lens recency threshold):** Resolved — no threshold in Phase 1. Mechanism for Phase 2 chosen at Phase 2 design time based on Phase 1 evidence.
- **Q2 (5+ children layout):** Resolved — collapse 3+ by default; long-press for manual order.
- **Q3 (draft storage layer):** Resolved — AsyncStorage, namespaced keys, 24h TTL, no opt-out toggle.
- **Q4 (archive duration regional variance):** Resolved — fixed 30-day for 13+; immediate deletion for under-13. Region-specific extensions deferred to legal review.
- **Q5 (comprehension threshold for acceptance):** Resolved — Phase 2 informal user study with ≥5 representative users.

## Remaining open questions

(None blocking Phase 1. Phase 2/3 questions to resolve at their respective design steps.)

1. **Phase 2 Self-lens mechanism** (auto-enable vs. explicit toggle vs. preview card vs. no Home surface). Decided at Phase 2 design time with Phase 1 evidence.
2. **Phase 2 ordering of PRs** (5/6/7/9 are interdependent in subtle ways) — sequenced when Phase 2 starts.

## Out of scope (explicit)

- Multi-guardian / co-parent UX coordination — separate spec.
- Shared-subject hooks between profiles.
- Onboarding flow redesign.
- `/child/[profileId]/*` URL prefix rename.
- Child sees parent's progress.

## Bugs this spec closes

Phase 1 closes: BUG-898, BUG-900, BUG-901, BUG-903, BUG-904, BUG-906, BUG-909.
Phase 2 closes: BUG-896, BUG-897, BUG-905.
Phase 3 doesn't close audit bugs directly but addresses unfiled gaps (parent-as-learner UX, child user-shape, withdrawal-flow refinement).

Not closed by this spec (separate work): BUG-881, BUG-902, BUG-907, BUG-908, BUG-910, BUG-911.

## Critique mapping

### Round 1 (20 findings, addressed in rev 1)
Tab announcements, lens visibility consent, lens suppression, no flicker, parent-only on-ramp, all-caps + diacritics, social quota, lens stacking, Send-a-Nudge subspec, /dashboard redirect, visible-button recoveries, draft preservation, children first-class, user-facing criteria, resolved open questions, solo→parent orientation, per-profile notifications, soft states, multi-child cross-links, full-screen retry on errors.

### Round 2 (20 findings, addressed in rev 2)
Promotion prompt → passive entry card; first-own-session heuristic dropped; nudge consent at profile creation; neutral throttle/disabled copy; archive opt-in with under-13 default deletion; Empty Home; comprehension criteria; consent unbundled; progressive disclosure; ↑/↓ buttons; recency label; silent mid-session subscription; uppercase ban generalized; surface stacking priority; cross-tab countdown; render-based criteria; Stale Returning; co-parent out of scope; Q1/Q2/Q3 resolved; "indefinite + 90-day deprecation" replaces "permanent."

### Round 3 (4-message principle, addressed in rev 3)
v3 over-corrected — every behavior an explicit user decision. v3 traded surveillance for friction. Principle: **default to quiet, infer from sustained behavior, surface controls only when the user reaches for them.**

### Round 4 (premise + phasing, addressed in rev 4 — this revision)
Three core changes: (a) auto-enable Self lens dropped from Phase 1 entirely — no Home surface for Self lens until Phase 2 with evidence-based mechanism design; (b) phased rollout structure with explicit gates and falsification protocol; (c) Premises and Unknowns section names load-bearing assumptions and what would falsify each. The spec now reads as "here's the foundation, here's what we don't know yet, here's how we'll know it" rather than "here's what we're building."
