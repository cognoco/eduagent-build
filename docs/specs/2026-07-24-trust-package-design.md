---
title: MVP trust package — five-slice product design
date: 2026-07-24
status: approved
owner: Zuzka
work_item: WI-1767
operator_question: OPQ-40
build_items:
  - WI-1497
  - WI-1498
  - WI-1499
  - WI-1501
  - WI-1502
---

# MVP trust package — five-slice product design

## 1. Decision and scope

This is the build source of truth for the five MVP trust-package slices. Zuzka
approved the product rulings in conversation on 2026-07-24; implementers may
choose ordinary component and persistence details that follow current
architecture, but must not reopen the product behavior defined here.

The selected artifact is one written, git-versioned specification. A separate
external mockup set was considered and rejected because these slices extend
existing app surfaces and a split source of truth would add more drift risk than
visual value. No ADR is required: this decision is bounded, reversible, and
does not establish a new architectural primitive.

### 1.1 Shared rules

- Use the existing design system and semantic tokens. Do not introduce a new
  trust-package visual language.
- Source copy below is the approved English direction. Put user-visible strings
  through i18n and localize meaning and Mentor tone, not word order.
- Never imply that a learning plan, memory write, feedback report, or review
  schedule succeeded until its authoritative write succeeded.
- Every dismiss/acknowledge control must have an accessible name, a minimum
  44-by-44-point target, and screen-reader state where state exists.
- A learner and a supporter learning for themselves receive the same
  self-learning behavior. These slices never expose a supportee's notes, Mentor
  memory, answers, or transcript to a supporter.

## 2. Slice map

| Build item | Slice | Primary surface | Reused foundation |
|---|---|---|---|
| WI-1497 | First-week Mentor plan | First useful Session end; then the same self-scope Mentor attention item | Session Summary, self-scope Mentor feed, shared seen/dismiss state |
| WI-1498 | Mentor-memory education | One Mentor interaction message after the first useful memory | Mentor Memory screen and its existing consent/access gates |
| WI-1499 | Uncomfortable-reply reporting | Overflow/report action on each persisted Mentor reply | Existing per-message actions and feedback transport |
| WI-1501 | Support and recovery | Account, Subscription, and Session Summary | Existing feedback sheet and global shake gesture |
| WI-1502 | Visible review promise | Session end after a review was actually scheduled | Retention schedule and existing `retention_due` Mentor card |

## 3. WI-1497 — first-week Mentor plan

### 3.1 Product intent

After the learner has completed their first useful learning session, show what
happens next without pretending the Mentor already knows personal facts it has
not earned. A short or abandoned interaction—for example, three messages with
no useful learning result—does not trigger the plan.

### 3.2 Trigger and placement

The trigger is the first successfully completed session that produced a useful
learning result, such as a persisted next focus, useful memory signal, or real
retention schedule. Mere exchange count, opening a session, an error, an
abandoned session, or a session with no useful result is insufficient.

Render the plan:

1. at the end of that qualifying Session, after the normal recap/summary
   success state; and
2. as the same self-scope Mentor attention item for up to seven calendar days
   from creation, until acknowledged, dismissed, or expired.

These are two presentations of one logical item with one stable identity and one
server-owned acknowledge/dismiss state. Dismissing it at Session end removes it
from Mentor; dismissing it in Mentor prevents it from reappearing elsewhere.
Do not create duplicate cards per device or per surface.

### 3.3 Content and source copy

Use a compact card/message, not a new screen.

- **Title:** “Your plan for the next few days”
- **Next focus row:** “Next: {{nextFocus}}”
- **Memory explanation:** “I keep track of what helps your learning and what to
  revisit. You can review or remove this anytime in Mentor memory.”
- **Review row, only when a real schedule exists:** “Review:
  {{reviewTopic}}. I’ll bring it back when it’s time.”
- **Primary action:** the existing action that opens/resumes `nextFocus`.
- **Acknowledge action:** “Got it”
- **Dismiss accessibility label:** “Dismiss your first-week plan”

The card may say generally what Mentor Memory tracks. It must not proactively
list interests, strengths, difficulties, accommodations, remembered statements,
or any other personal memory fact.

The review row identifies only a genuinely persisted scheduled topic. It does
not show or promise a fixed date: the retention engine may adapt the timing.

### 3.4 States

| State | Behavior |
|---|---|
| Not eligible | No plan; the normal Session-end experience remains complete |
| Eligible, data committing | Keep the normal completion state; do not show a skeleton promise |
| Visible at Session end | Show the compact plan once the required source data is authoritative |
| Visible in Mentor | Show the same logical item, not a copy, until acknowledged/dismissed/expired |
| Acknowledged or dismissed | Remove everywhere and do not recreate for that learner |
| Expired | Remove after seven calendar days without negative or guilt copy |

### 3.5 Failure behavior

- If no useful next focus exists, do not create the plan.
- If a next focus exists but review scheduling failed or no review is due to be
  scheduled, omit the review row; never invent a review.
- If the acknowledgement write fails, keep the item visible, restore the
  control, and show the standard retryable error. Do not claim it was dismissed.
- If Mentor feed loading fails, Session completion still succeeds. The plan is a
  trust cue, not a gate on completing learning.
- Never reset the seven-day lifetime because a device was reinstalled, the card
  was fetched again, or copy changed.

### 3.6 Implementation anchors and acceptance examples

Likely anchors are Session Summary and the self-scope Mentor/Now feed. Reuse the
shared seen-state approach used by feed attention items rather than local
component state.

Acceptance examples:

- A first session with three messages and no useful result shows no plan.
- A qualifying first session shows one plan at Session end; the same item later
  appears in Mentor.
- Dismissal from either surface removes both presentations.
- The plan never contains a remembered personal fact.
- The item disappears after seven days even if it was never dismissed.

## 4. WI-1498 — Mentor-memory education

### 4.1 Product intent

Teach the learner that Mentor Memory exists at a moment when the explanation is
useful, without repeatedly reciting what the Mentor remembers. The cue is an
ordinary Mentor interaction message, not a modal, persistent banner, onboarding
step, or new card type.

### 4.2 Trigger and placement

Show the first cue only after the first useful Mentor Memory has been
successfully persisted under the existing memory-consent and access rules.
“Useful memory” means a durable memory item that can affect future teaching; a
pending inference, rejected write, empty section, or consent-disabled attempt
does not qualify.

Place the cue in the same learning interaction immediately after the relevant
successful Mentor response, or at the next safe Mentor message boundary if the
memory write completes asynchronously. Do not interrupt streaming and do not
insert it inside the learner's text.

The destination is:

`More → Your learning → Mentor memory`

That screen remains the place where the learner can review, remove, clear, and
control use of memory.

### 4.3 Content and source copy

- **Message:** “I can remember useful things about how you learn, so I can help
  better next time. You can review or remove these anytime in More → Your
  learning → Mentor memory.”
- **Inline action:** “Open Mentor memory”
- **Accessibility label:** “Open Mentor memory settings”

Do not include the newly remembered fact in this proactive education message.
The learner can choose to inspect facts on the dedicated screen.

### 4.4 Repeat rule

After the first cue, repeat it only when all three conditions are true:

1. Mentor Memory has materially changed since the last cue;
2. at least ten additional completed learning sessions have occurred; and
3. at least 30 calendar days have elapsed.

This is an AND rule, not “ten sessions or 30 days.” Count completed learning
sessions per learner in durable server state. Reinstalling, changing device, or
clearing a local cache must not reset the cadence.

### 4.5 States

| State | Behavior |
|---|---|
| Memory disabled, declined, or pending consent | No cue |
| Memory write pending or failed | No cue |
| First useful memory persisted | Show one education message |
| No material memory change | Never repeat, regardless of time/session count |
| Changed but cadence incomplete | Wait |
| Changed and both cadence thresholds met | Show one repeat cue and reset its durable baseline |
| Destination unavailable | Omit/disable the action; do not show a dead link |

### 4.6 Failure behavior

- The memory write and consent gate remain authoritative. Never show copy that
  says the Mentor remembered something after a failed or disallowed write.
- Failure to write the cue's “shown” receipt must not create a rapid repeat
  loop. Retry at a later safe boundary with idempotency.
- If the learner opens Mentor Memory directly before the cue, that does not
  invent a memory or bypass consent. It may count as education seen only if a
  useful memory already exists.
- Do not expose memory facts in analytics, breadcrumbs, notifications, or the
  cue payload.

### 4.7 Implementation anchors and acceptance examples

The current destination is
`apps/mobile/src/app/(app)/mentor-memory.tsx`, reached from
`apps/mobile/src/app/(app)/more/index.tsx`. The existing Session Summary cue that
uses `totalSessionCount >= 2` is not the approved trigger and must not remain as
a competing cadence.

Acceptance examples:

- A consent-disabled learner receives no cue.
- The first durable useful memory produces exactly one cue.
- A memory change after 12 more sessions but only 20 days produces no repeat.
- A memory change after 35 days but only nine more sessions produces no repeat.
- Once all three conditions are true, one repeat cue appears without revealing
  the changed fact.

## 5. WI-1499 — “This made me uncomfortable” reply report

### 5.1 Product intent

Keep the existing “too hard,” “too easy,” “explain differently,” helpful,
not-helpful, and correction controls. Add a distinct safety feedback path for a
reply that felt uncomfortable; do not misclassify it as ordinary pedagogy
feedback and do not make the learner explain themselves before they can report.

### 5.2 Trigger and placement

Add “This made me uncomfortable” to a report/overflow menu attached to every
complete, persisted Mentor reply that has an event identity. Do not show it on a
learner message, system row, quota/error card, or an incomplete streaming
fragment.

The overflow affordance must be reachable without replacing the current
thumbs-up, thumbs-down, correction, or quick-chip actions. It remains available
on older persisted Mentor replies in the loaded Session, not only the latest
reply.

### 5.3 Interaction and source copy

Overflow item:

- **Label:** “This made me uncomfortable”
- **Accessibility label:** “Report this Mentor reply as uncomfortable”

On selection:

1. submit the safety report for that reply;
2. stop any automatic continuation caused by ordinary negative feedback; and
3. replace the action state with a calm acknowledgement.

Acknowledgement:

- **Title:** “Thanks for telling us.”
- **Message:** “You don’t need to explain. We’ll use this report to improve the
  experience.”
- **Optional action:** “Add details” opens an optional text field.
- **Close action:** “Done”

Free text is always optional. The acknowledgement must not imply that a human is
currently monitoring, promise a response time, diagnose harm, or tell the
learner to continue the conversation.

### 5.4 Data and privacy boundary

Send the persisted assistant event identifier, Session identifier, learner
scope, app version, and safety-feedback category. Do not copy the surrounding
transcript or learner answers into ordinary feedback telemetry.

If authorized safety review needs the reported reply text, resolve that single
assistant event server-side under the existing learner scope and retention
rules. Never grant a supporter a new path to the report, reply, or transcript.

### 5.5 States

| State | Behavior |
|---|---|
| Eligible reply | Overflow action available |
| Submitting | Disable duplicate submission and show quiet progress |
| Submitted | Show calm acknowledgement; mark only that reply as reported |
| Already submitted | Preserve acknowledged state; do not submit twice |
| Optional details open | Permit empty close; never require text |
| Offline/error | Say the report was not sent, preserve optional draft locally for retry, and keep the action available |

### 5.6 Failure behavior

- Never show success before the server accepts the report.
- Never send a system prompt to the Mentor or generate a new Mentor answer from
  this action.
- Never silently fall back to `not_helpful` or `incorrect`.
- A reporting failure must not delete or hide the Mentor reply.
- Prevent rapid double taps with an idempotency key tied to learner and reply.

### 5.7 Implementation anchors and acceptance examples

Extend `SessionMessageActions.tsx` without removing the existing feedback
buttons. The current teaching-stage gate must not make the safety action
unavailable on an otherwise eligible persisted Mentor reply.

Acceptance examples:

- Every eligible Mentor reply exposes the overflow item.
- Selecting it sends one report and produces no new Mentor message.
- The learner can finish without entering text.
- Offline submission is not presented as successful.
- Other reply-feedback controls continue to work unchanged.

## 6. WI-1501 — support and recovery

### 6.1 Product intent

Put recovery beside the three MVP surfaces where confusion or failure is most
costly, while retaining the existing Help & feedback destination and global
shake shortcut.

### 6.2 Placement

Add a small secondary action labeled “Something wrong?” to:

1. Account;
2. Subscription; and
3. Session Summary.

The action opens the existing feedback sheet with an initial `bug` category and
an allow-listed source-surface value. It does not open email first and does not
create three separate forms.

The existing More → Help & feedback → Report a problem entry remains. On mobile,
teach the global shortcut with this exact direction:

“Give your phone a good shake from any screen to report a problem.”

Show the shake education in Help & feedback and in the contextual feedback
sheet. Do not repeat it as a toast on every screen.

### 6.3 Form behavior and source copy

- **Contextual action:** “Something wrong?”
- **Sheet title:** retain “Give us feedback”
- **Message label:** retain “Tell us what happened”
- **Submit success title:** retain “Thank you!”
- **Submit success message:** “We’ve received your report and will look into
  it.”
- **Shake hint:** “Give your phone a good shake from any screen to report a
  problem.”

The user still writes the report for this general path; the prefilled category
and source context reduce friction but do not submit anything without a deliberate
Send action.

### 6.4 Allow-listed diagnostic context

The feedback request may attach:

- source surface enum: `account`, `subscription`, or `session_summary`;
- app version/build;
- platform and OS version;
- current non-sensitive flow-state enum;
- stable error code or operation/request identifier when one already exists.

It must not attach:

- a transcript or surrounding messages;
- learner answers, notes, Session Summary text, or Mentor Memory;
- card number, payment method, receipt body, purchase token, or billing address;
- access tokens, authorization headers, secrets, or raw request/response bodies.

Do not attach arbitrary navigation params. Context construction is an explicit
allow-list, not object spreading.

### 6.5 States

| State | Behavior |
|---|---|
| Idle | Contextual action is visible but visually secondary |
| Sheet opened contextually | Category is `bug`; source surface is set; message is empty |
| Typing | User controls content and may cancel without submission |
| Submitting | Disable duplicate Send; retain typed content |
| Submitted | Show confirmation; clear content only after success |
| Error/offline | Keep content, show retryable error, and do not show confirmation |
| Shake unavailable | Contextual and More-page actions still work; do not claim shake support on web |

### 6.6 Failure behavior

- Account, purchase, and Session completion flows must never fail because the
  feedback sheet or shake detector failed.
- Shake opens at most one sheet and must not trigger while the sheet is already
  open.
- Do not include sensitive diagnostic context even when a submission error
  makes investigation harder.
- If context serialization fails, submit the user's text plus basic app/device
  metadata; omit the broken context field.

### 6.7 Implementation anchors and acceptance examples

Reuse `FeedbackProvider`, `FeedbackSheet`, and `useShakeDetector`. The current
form already submits app version, platform, and OS version, and Help already
teaches shaking; this build extends the opener contract and tightens the copy
and allow-list.

Acceptance examples:

- All three named surfaces open the same feedback sheet with the correct source
  enum.
- A report never contains transcript, learner-answer, payment, or secret data.
- Success appears only after the submission succeeds.
- A good shake from an ordinary mobile screen opens one feedback sheet.
- Web and devices without shake support retain the explicit support paths.

## 7. WI-1502 — visible review promise

### 7.1 Product intent

Make the adaptive review loop visible at the moment it is genuinely created,
then let the existing Mentor due-review card fulfill the promise. This is quiet
continuity copy, not an upcoming-review dashboard.

### 7.2 Trigger and placement

At Session end, after the server has successfully persisted at least one
`nextReviewAt` value for learning from that Session, show one quiet line below
the normal completion content:

“I’ll bring this back for review when it’s time.”

The line is informational and has no required action. If no review was
scheduled, the schedule write failed, or the Session produced no reviewable
learning, show nothing.

When the persisted review becomes due, continue to use the existing
`retention_due` self-scope Mentor card and its review deep link. Do not create a
second persistent “upcoming review” card.

### 7.3 States

| State | Behavior |
|---|---|
| Schedule pending | Do not show the line yet |
| Schedule persisted | Show the quiet line once at Session end |
| No schedule | Show nothing; no empty placeholder |
| Schedule write failed | Show nothing; Session completion still succeeds |
| Review not yet due | No persistent upcoming card |
| Review due | Existing `retention_due` Mentor card appears |
| Review schedule later adapts | Follow authoritative `nextReviewAt`; no stale date copy exists to correct |

### 7.4 Copy constraints

- Do not show a fixed date or say “tomorrow,” “in seven days,” or equivalent.
- Do not imply that a reminder/notification will be sent.
- Do not say the learner “must,” “should,” or “needs to” return.
- The first-week plan may identify the genuinely scheduled review topic and use
  the same “when it’s time” language; it must not add a fixed-date promise.

### 7.5 Failure behavior

- The Session-end line is derived from the successful schedule result, never
  optimistically from Session completion.
- If several topics were scheduled, show the line once, not once per topic.
- If the due-review card later fails to load, do not manufacture a replacement
  from stale client state.
- Review scheduling and due-card failures follow normal observability; neither
  should block Session completion.

### 7.6 Implementation anchors and acceptance examples

The authoritative schedule is the retention card's `nextReviewAt`. The existing
due projection in `apps/api/src/services/now-feed.ts` already emits
`retention_due` only when `nextReviewAt <= now` and deep-links to review.

Acceptance examples:

- A successful schedule produces exactly one Session-end line.
- A failed or absent schedule produces no promise.
- No fixed date appears.
- No upcoming-review card appears before the review is due.
- At due time, the existing Mentor card—not a new surface—offers the review.

## 8. Cross-slice delivery checklist

Each build item must:

- preserve all current successful learning, memory-consent, feedback, support,
  purchase, and retention behavior outside its slice;
- add unit or integration coverage for its state table and failure behavior;
- add mobile accessibility coverage for new actions;
- use i18n keys and pass the hardcoded-JSX and no-clinical-copy guards;
- use server/durable receipts for cross-device cadence, dismissal, and
  idempotency rather than local-only storage;
- avoid supporter access to self-scope learning artifacts; and
- cite this specification in its work-item `Found In` property.

## 9. Product review record

Zuzka approved:

- first useful Session as the first-week-plan trigger and one shared dismissal;
- general memory education without proactive personal-memory facts;
- a dedicated uncomfortable-reply safety action with no required explanation
  and no automatic continuation;
- contextual support on Account, Subscription, and Session Summary plus the
  “good shake” instruction; and
- the quiet review promise only after a real schedule succeeds, fulfilled later
  by the existing due-review Mentor card.

This approval closes the product-definition question. Implementation evidence
and code review remain the responsibility of the five build items.
