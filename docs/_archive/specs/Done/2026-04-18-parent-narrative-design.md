# Parent Narrative — From Metrics to Story

**Status:** Design spec — pending review
**Author:** Product + Claude brainstorm, 2026-04-18 (follows the end-user test pass in `docs/flows/end-user-test-report-2026-04-18.md`, continuation #4)
**Depends on:** PV-S1/S2/S3 (parent-visibility-privacy) shipped; PEH-S1/S2 (progress empty-states + highlights) shipped
**Companion specs:** `2026-04-18-parent-visibility-privacy-design.md`, `2026-04-18-progress-empty-states-highlights-design.md`

## Problem

The parent surface — dashboard, child detail, subject drill-down, topic detail, session feed — is built around **raw data availability**. Every number the backend can compute shows up somewhere. This was the right instinct for a first cut, but the end-user test pass found that a tired, anxious parent at 10pm cannot turn the data into an answer to the three questions they actually have:

1. **Is my kid OK?**
2. **Are they actually learning or just clicking?**
3. **What do I say to them about their learning?**

PV-S1/S2/S3 (privacy + streak/XP + curated memory) and PEH-S1/S2 (lowered thresholds + highlights) are real steps toward this — especially session highlights, which start to replace the removed transcript with something parents can read. But four gaps remain after those land:

1. **Vocabulary confusion.** "Mastered", "explored", "in progress", "Thriving", "problems", "guided", "exchanges", "active min" appear across parent screens with no definitions and no consistent semantics. Two of them ("0% mastery" + "Thriving" on the same screen) actively contradict each other.
2. **Opacity of sessions.** After PV-S1 removed the transcript, parents see "2 exchanges · 36 min · learning" with no insight into what happened. PEH-S2 highlights help — one line — but a parent wants a paragraph-shaped narrative plus something they can say to their kid at dinner.
3. **Empty states that punish existing users.** "Your first report will appear after the first month", "After 3 more sessions you'll see trends", "Progress becomes easier to spot after a few more sessions" — all of these fire for paid users on day 1, creating a waiting-room product. PEH-S1 lowered the thresholds but did not add **teaser content** for the locked surfaces.
4. **Zero guidance on parent-side decisions.** Learning Accommodation has four cryptic radios (None / Short-Burst / Audio-First / Predictable) with no "when to pick which" copy. Mentor Memory has an empty-controls screen before any data exists. There is no parent onboarding. Parents make decisions blind.

**Out of scope for this spec:** the real bugs (F-033, F-034, F-035, F-036, F-037) that were filed separately in the test report's Bug Ledger. Those will be fixed as code bugs; this spec is about what to build on top.

## Design principles (applies to every section below)

| Principle | Meaning | Anti-pattern to avoid |
|---|---|---|
| **Story > metric** | When both a number and a human-readable sentence can be shown, lead with the sentence | "2 problems · 0 guided · 1 sessions" as the first thing the parent sees |
| **One interpretation per screen** | If two metrics could contradict (mastery % vs. retention signal), merge them into a single hybrid | "0% mastery" + "Thriving" on the same topic detail |
| **Empty states teach, never gate** | If a surface is locked by threshold, show what the parent WILL see once unlocked, with sample data | "After X more sessions, you'll see..." with no preview |
| **Make the parent a better parent** | Give them something to DO with what they see — a conversation prompt, a follow-up, a sharing moment | Dashboard that answers "what happened" but not "what's next" |
| **Plain English, no jargon** | No app-internal vocabulary (exchange, active min, surfaced, rung, mastered, gated, discovery) in parent copy | Keep "exchange" in telemetry, not in UI |
| **Trust via concreteness** | Prefer specific "TestKid asked X about Y" over generic "TestKid is doing well" | Reassurance copy that could apply to any user |

## Vocabulary canon

This table is the authoritative parent-facing vocabulary. Every parent screen must conform.

| Concept | Parent-facing term | Deprecated synonyms |
|---|---|---|
| A learning conversation with the AI | **session** | exchange (ok internally), chat |
| How long the kid spent in a session | **time on app** (wall-clock, minutes) | "active min" is internal, must never appear in parent UI |
| A unit of study (ex: "Adding Whole Numbers") | **topic** | lesson, unit |
| A group of topics (ex: "Numbers Galore") | **book** | shelf, curriculum |
| A subject area (ex: "Mathematics") | **subject** | — |
| Progress on a topic, 0–100% | **understanding** (with a plain-English label) | mastery, mastered (reserved for verified) |
| Retention health (spaced-recall signal) | **remembering well / getting rusty / needs review** | retention, strong, fading, thriving |
| A week-over-week activity change | **more than last week / less than last week** | delta, trend |
| A countable achievement (first session, 3 sessions, 5 topics) | **milestone** | — |
| What the AI remembers about the child | **what the mentor knows about [child]** | mentor memory, profile, inferences |

### Understanding label mapping

Percentage ranges are mapped to plain-English labels on all parent surfaces:

| Score | Parent-facing label |
|---|---|
| 0% | Just starting |
| 1–30% | Getting familiar |
| 31–60% | Finding their feet |
| 61–85% | Getting comfortable |
| 86–99% | Nearly mastered |
| 100% | Mastered |

The raw percentage may still be shown in parentheses as a small secondary detail for parents who want precision. The label is always primary.

### Retention signal

Single source of truth — never show both a percentage and a label that contradict:

| Spaced-recall state | Parent-facing label | Icon |
|---|---|---|
| All cards fresh, no fading | **Remembering well** | green dot |
| Some cards starting to fade | **A few things to refresh** | yellow dot |
| Multiple cards due/overdue | **Needs a review** | orange dot |
| No retention data yet | (hide the signal — don't show "Thriving" on a topic with 0 sessions) | — |

Implementation note: the current `retentionStatus` enum (`strong` / `fading` / `weak` / `thriving`) and the separate `masteryScore` percentage both surface on the parent topic-detail screen and conflict on screens with no data. The new label derives from **both** inputs: if `completionStatus === 'not_started' || totalSessions === 0`, no retention signal is shown at all. This removes the "0% mastery + Thriving" cognitive dissonance.

---

## Section 1: Plain-English session recap

### Problem

After PV-S1 removed the session transcript, the parent sees `learning · 2 exchanges · 36 min` on a session card and no narrative of what happened. PEH-S2 adds a one-line `highlight` surfaced on the card — a quote or insight from the session. That is a good start but insufficient. Parents asking "is my kid OK?" need at minimum:

- **What topic was covered** (already in session metadata)
- **How the kid engaged** — were they stuck, breezing through, confused, curious?
- **What the AI did well for them** — an analogy, a pacing choice, a follow-up
- **A conversation prompt** the parent can use to follow up

### Schema changes

Extend the `session_summaries` table (already extended by PEH-S2 with `highlight`). Add three more columns generated by the same Inngest pipeline:

```
session_summaries
  highlight            text NULL   -- existing (PEH-S2)
  narrative            text NULL   -- new: 2–3 sentence recap, parent voice
  conversation_prompt  text NULL   -- new: one question parent can ask child
  engagement_signal    text NULL   -- new: 'curious' | 'stuck' | 'breezing' | 'focused' | 'scattered'
```

All four columns are generated in the same `generate-session-highlight` Inngest step ([PEH-S2 Task 5](../plans/2026-04-18-progress-empty-states-highlights.md)), producing a single structured LLM call per session summary with JSON output:

```json
{
  "highlight": "…",
  "narrative": "…",
  "conversation_prompt": "…",
  "engagement_signal": "curious"
}
```

The prompt template lives in `apps/api/src/services/session-highlights.ts` alongside the existing `highlight` generator. Add prompt-injection break tests for each new field matching the `PEH-BT1..4` pattern.

### API changes

`GET /v1/dashboard/children/:id/sessions` (existing) — add to each session row:
- `narrative: string | null`
- `conversationPrompt: string | null`
- `engagementSignal: 'curious' | 'stuck' | 'breezing' | 'focused' | 'scattered' | null`

`GET /v1/dashboard/children/:id/sessions/:sessionId` (PV-S1 Task 5b) — same three fields, plus the existing `highlight` and `displaySummary`.

### Mobile changes

**Session card** in Recent Sessions on child detail: leads with `narrative` if present, falls back to current `displaySummary`. The `engagement_signal` renders as an icon chip (curious = ✨ · stuck = 💭 · breezing = 🚀 · focused = 🎯 · scattered = 🌀). Time and "exchanges" count move to a secondary row.

**Session detail screen** (`child/[profileId]/session/[sessionId].tsx`): layout is
1. Topic title + subject
2. Engagement signal chip + "Time on app" (wall-clock, per vocab canon)
3. **Narrative** — the 2–3 sentence recap in a prominent card
4. **Highlight quote** — the PEH-S2 one-liner, rendered as a pull-quote
5. **Conversation prompt** in its own card: "Ask [child]: '{prompt}'" with a "Copy" button
6. Subject / topic / XP metadata (small, de-emphasized)

### Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Narrative generation in progress | Inngest job hasn't finished yet (<60s post-session) | "Recap generating — check back in a minute" with refresh | Polling + manual Retry |
| Narrative generation failed | LLM error, exceeded retries | Session card shows metadata only; detail screen falls back to `displaySummary`; conversation_prompt hidden | N/A — silent degrade |
| Prompt-injection attempt | Structured-output validator rejects | `narrative=NULL`, `conversation_prompt=NULL`, telemetry event fired | Same as above |
| All four fields null (existing pre-PEH-S2 sessions) | No backfill | Card + detail fall back to the legacy layout with `displaySummary` | Optional: background backfill job |

---

## Section 2: Teaser empty states

### Problem

Every threshold-gated surface ("Monthly reports after 1 month", "Retention trends after N sessions", "Your growth after a few sessions") renders **locked copy** with nothing to aspire to. Paying parents see a waiting room.

### Pattern

Every threshold-gated empty state gets three elements:

1. **What's locked + why** — one sentence, plain English. "Retention trends need a few sessions to spot the pattern."
2. **When it unlocks** — a concrete countdown. "After 3 more sessions." (The count must update live as the child progresses.)
3. **A blurred/sample preview** — a visual mock of what will appear, with anonymized sample data or a "this is what another family sees" framing. Renders behind a subtle overlay with the unlock text.

The sample preview is **mandatory** for every gated surface. If we can't design one, the surface shouldn't be gated.

### Surfaces to update

| Surface | Current empty copy | New pattern |
|---|---|---|
| Dashboard teaser (`parent-dashboard-teaser`) | "After 3 more sessions, you'll see TestKid's retention trends..." | Keep copy; add blurred inline mini-chart preview behind the text |
| Child detail → Monthly reports | "Your first report will appear after the first month of activity" | Render a sample report card (anonymized) with "First real report: {date 1 month from first session}" overlay |
| Child detail → Recent growth | "Progress becomes easier to spot after a few more sessions" | Show sample 4-week trend-line for a fictional kid with an overlay; add "Yours will appear after 3 more sessions" |
| Progress → Your growth | "You just started. Keep going and your growth will appear here." | For `totalSessions >= 3`: swap to "You've put in {n} sessions. Growth becomes visible as you master your first topic." (addresses F-035 copy condition) |
| Progress → Recent milestones | "Keep going. Your milestones will collect here as your knowledge grows." | Show the *next upcoming milestone* as a chip ("Next: 10 sessions — 3 more to go"), replacing the generic empty copy |

### Implementation note on F-035 backfill

The PEH-S1 threshold lowering created a cohort of existing users who crossed thresholds before the new values shipped. A one-off Inngest backfill job should:

1. Query all profiles with `total_sessions >= 1`.
2. For each, run `detectCrossedMilestones` against a synthetic "previous" state of `{sessions: 0, topics: 0, streak: 0}` and the current metrics.
3. Insert the resulting milestones with `crossed_at = created_at` of the profile's most recent session summary (not the current timestamp — so parents see them as historical, not brand-new notifications).

This prevents existing users from seeing no milestones at all despite meeting the new criteria.

---

## Section 3: Mastery / retention disambiguation

### Problem

Parent topic detail screen renders:
- **Status:** In progress
- **Mastery:** 0%
- **Retention:** Thriving

"0% mastery + Thriving" is literally contradictory. The retention signal is meant to show spaced-recall health; the mastery score is meant to show topic understanding depth. Both surface unconditionally even on topics with zero sessions.

### Resolution

Apply the vocabulary canon above (section header). Specifically:

1. **Replace the two-metric display with a single "Understanding" card** that uses the plain-English label from the canon (`Just starting` / `Getting familiar` / …).
2. **Show the Retention signal only when the topic has ≥1 completed session AND has been opened at least once for spaced review.** Never show "Remembering well" on a topic with zero activity — the signal is meaningless there.
3. **If retention and understanding genuinely diverge** (ex: 85% understanding + "Needs a review" because overdue), show both but with an explanatory line: "Understood well in-session, now due for a quick review."

### Mobile changes

`apps/mobile/src/app/(app)/child/[profileId]/topic/[topicId].tsx`:
- Remove the `topic-mastery-card` showing raw `masteryScore` percent
- Replace with `topic-understanding-card` showing the mapped label + optional `({score}%)` secondary
- Gate the `topic-retention-card` on `completionStatus !== 'not_started' && totalSessions >= 1`
- When both show, ensure they don't contradict — if they do, render the reconciliation line

Apply the same logic on:
- Subject card on child detail (remove subject-level "Thriving" on 0-session subjects — `retention-signal-strong` should only render with data)
- Child detail dashboard "Visible progress" card

### Schema changes

None. The plain-English mapping happens client-side.

---

## Section 4: Accommodation guidance

### Problem

The accommodation radio group on child detail offers `None / Short-Burst / Audio-First / Predictable` with one-line descriptions:

- None — Standard learning experience
- Short-Burst — Shorter explanations and frequent breaks
- Audio-First — Voice-driven learning with less text
- Predictable — Consistent structure and clear expectations

Parents who suspect their kid needs an accommodation don't know which one. Parents who don't suspect anything don't know whether to explore. The radios require a confident decision without giving the parent a way to be confident.

### Design

Add a **"Not sure which to pick?"** expandable row above the radios. When opened, it shows a short decision guide:

| If your child… | Consider |
|---|---|
| Loses focus after 10 minutes | Short-Burst |
| Prefers listening over reading | Audio-First |
| Gets anxious with surprises or open-ended tasks | Predictable |
| None of the above | None (the default) |
| Has a diagnosed condition (ADHD, dyslexia, autism) | Read our [Accommodation guide](link) for combinations |

Also add:

- **"Try it for a week"** sub-copy below the radios: "You can change this anytime. It takes effect on TestKid's next session."
- **"How it's working"** chip on the child detail header once an accommodation has been active for 7+ days, linking to a per-accommodation insight ("Sessions since switching to Short-Burst are 22% longer on average").

### Schema changes

None initially. The "how it's working" insight requires a simple query against existing session metrics, which the mobile client can run client-side from inventory data.

### Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Parent changes accommodation mid-session | Child has a session in flight when parent toggles | Toast: "Will take effect on TestKid's next session." — currently silent | Show toast |
| Accommodation has no effect (LLM doesn't honor prompt) | Bug in session prompt routing | Parent sees radio saved but kid's experience unchanged | Out of scope here — see LLM routing spec |

---

## Section 5: Parent onboarding (new surface)

### Problem

A parent who just upgraded to family tier + added a child lands on the parent gateway with no tour. There are 8 sections on child detail with no priority ordering, 4 accommodation radios with no guidance, a mentor-memory surface with empty controls before any data exists, and nothing telling the parent what the weekly digest will look like. All decisions blind.

### Design

A **3-step onboarding overlay** triggered the first time a parent opens the dashboard after their first child is added and has completed ≥1 session. Dismissable, rerunnable from More → "Parent tour".

**Step 1 — "Here's where to look first"**
Overlay on the child-detail screen highlighting three spots with callouts:
- "Time on app" — "How much time TestKid spent learning this week."
- "Recent Sessions" — "The most important thing you'll read. Tap any session to see a recap + a question you can ask TestKid."
- "What the mentor knows" — "Review and edit what the AI remembers about TestKid. You're in charge."

**Step 2 — "Set up how the mentor teaches TestKid"**
Highlights the accommodation section + surfaces the "Not sure?" expandable from Section 4 above. Optional skip.

**Step 3 — "Sample of what you'll get by email"**
Shows a mockup of the first weekly digest a parent will receive. Checkbox "Email me a weekly recap" (default on). Optional opt-in for SMS.

Each step has a "Skip tour" escape. The full sequence lives behind a `parent-onboarding-overlay` testid at the container level plus `parent-onboarding-step-{1,2,3}` per step.

### Schema changes

Add one column to `profiles`:
```
profiles
  parent_onboarding_completed_at  timestamptz NULL
```

Set on final step "Done" tap. The overlay trigger checks `profile.isOwner AND profile.parent_onboarding_completed_at IS NULL AND has any child with >=1 session`.

### Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Overlay renders before data loads | Dashboard query inflight when overlay mounts | Overlay waits; no-data placeholder behind it | Already handled by the underlying screen's loading state |
| Parent dismisses then wants to retake | — | More → "Parent tour" re-runs the same overlay | Sets `parent_onboarding_completed_at` back to NULL or adds a second column tracking view count |

---

## Section 6: Weekly parent digest

### Problem

Parents want a pull-style summary. Dashboards are fine but require intent. An email (or push) every Sunday evening that says "Here's what TestKid learned this week" closes the loop for busy parents. This also feeds the Section 5 onboarding ("Here's a sample") — we need the real product to ship.

### Design

Once per week, per child, an Inngest cron job composes and delivers a digest to the parent's email (existing `profiles.email`). The digest contains:

1. **Top line** — "TestKid spent 42 minutes learning this week, completed 3 sessions across Math and Science."
2. **Three session recaps** — reuse the `narrative` field from Section 1; one sentence each linking to the session detail in-app.
3. **Highlight of the week** — the most-interesting `highlight` from the week, chosen by simple LLM scoring.
4. **Three conversation prompts** — the top 3 `conversation_prompt` values, formatted as "Ask TestKid:" bullets.
5. **Milestones** — any crossed this week.
6. **One concern flag if applicable** — `engagement_signal === 'stuck'` appeared in >50% of sessions → "TestKid seemed stuck on X this week. Consider reviewing together or switching accommodation mode."
7. **Footer** — link to full dashboard, unsubscribe, change frequency.

### API / service changes

New Inngest function `weekly-parent-digest` on `cron(0 19 * * 0)` (Sunday 7pm local-to-server):

- Queries all `profiles WHERE is_owner = true AND weekly_digest_enabled = true`
- For each owner, loops owned children, builds per-child digest rows from the week's session_summaries
- Renders the email via a simple MJML template
- Sends via existing email provider
- Logs a structured metric per delivery

Schema:
```
profiles
  weekly_digest_enabled  boolean NOT NULL DEFAULT true
  weekly_digest_last_sent_at  timestamptz NULL
```

Setting visible in More → Settings → Weekly recap (already exists as a toggle in `ACCOUNT-07` per the test report).

### Failure modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| No sessions this week | Child had no activity | Don't send (silent skip) — avoid "this week TestKid did nothing" emails | — |
| Email bounce | Address invalid | Retry 2x, then mark `weekly_digest_enabled=false` and surface a banner on next dashboard open: "We couldn't reach you at {email}. Update email?" | Banner + in-app update |
| LLM digest generation fails | Highlight/narrative null for all sessions | Fall back to metadata-only email | Silent degrade |

---

## Section 7: Guided-label tooltip pass

### Problem

The PARENT-09 coverage row noted: "No specific tooltip testid found." Several parent screens show metrics (guided vs. independent, active min, retention) with no way for the parent to understand what they mean.

### Design

Every parent-facing metric gets an **info dot** — a small ⓘ icon adjacent to the label, accessibility-labeled, tappable to show a 1–2 sentence explanation in a bottom-sheet popover.

Metrics to cover:
- "Time on app" (wall-clock explanation)
- "Sessions this week"
- "Guided vs. independent" (if still surfaced after vocab cleanup — otherwise remove)
- "Understanding" (the new plain-English label)
- "Remembering well / Needs review" retention signal
- "Thriving" etc. on subject cards (if retained — see Section 3)
- Every milestone card

Tooltip content lives in a static `parent-vocab.ts` dictionary (single source for content maintenance) imported by each metric component. Testid pattern: `metric-info-{metric-key}`.

---

## Rollout plan

Because this spec is broad, split it into four stacked implementation phases. Each phase is independently valuable and reviewable.

| Phase | Sections | Rationale |
|---|---|---|
| **1. Vocabulary canon + mastery/retention disambiguation** | §3 + vocab canon | Highest-impact / lowest-risk. Mostly copy + conditional render changes. No new DB columns |
| **2. Plain-English session recap** | §1 | Biggest single win. Requires Inngest pipeline extension + mobile rework of session detail. Independent of phase 1 |
| **3. Teaser empty states + milestone backfill + tooltips** | §2 + §7 | Relieves the "paying parent, locked rooms" feeling. Tooltip pass bundled because it reuses the vocab canon |
| **4. Accommodation guidance + parent onboarding + weekly digest** | §4 + §5 + §6 | Biggest net-new surface area. Requires schema migration + email infrastructure |

## Success metrics

Post-launch, we should see:

- **qualitative:** Parent-survey question "In one sentence, what did [your child] learn this week?" — answered confidently by >70% of weekly-active parents
- **quantitative:**
  - Session detail view depth (% of dashboard visits that open at least one session detail) — from current baseline to 2x within 30 days
  - Accommodation mode switch rate (parents who change from None) — non-zero
  - Weekly digest email open rate — >40% within 30 days (benchmark for similar products)
  - "Not sure which to pick?" expandable tap rate on the accommodation section — useful signal to keep or deprecate

## Non-goals

- **Full conversation replay.** PV-S1 deliberately removed this for privacy. Don't reinstate.
- **Parent-facing grade book.** We're not a school LMS. Stay qualitative.
- **Parent dashboards for the child's side.** Kids' surfaces stay kid-focused; this spec is exclusively the parent side.
- **Gamifying the parent.** No parent streaks, parent XP, parent leaderboards.

## Open questions

1. **Do we want the narrative recap to be editable by the parent?** Parents may correct or annotate ("This is actually wrong — TestKid was stuck because their iPad was out of battery"). Adds complexity but increases trust. Defer to v2.
2. **Who writes the copy for the accommodation guide?** The "If your child… consider X" table needs a child-psychologist/pedagogy review before shipping. Owner: [?].
3. **Voice digest?** Some parents prefer a 90-second audio recap over email. Interesting but out of scope until v2.
4. **Sibling comparison framing.** Multi-child dashboards inherently invite comparison. We should decide if we actively suppress comparison framing or lean into "celebrate each kid's path" copy. Defer to PARENT-02 design work.
