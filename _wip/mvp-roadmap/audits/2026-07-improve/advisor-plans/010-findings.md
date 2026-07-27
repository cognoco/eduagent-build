# 010 — Findings: read-side profile-authority check

> Spike output for plan `010-read-side-profile-authority-spike.md` / Cosmo
> **WI-2006** (Spike, P2). This doc answers the plan's Step 1 questions.
> **No handler changes were made in this spike** — Cosmo's AC for WI-2006 is
> explicit that the deliverable is this findings doc; any concrete leak found
> here is a **finding**, to be fixed by a separate follow-up Work Item, not by
> this doc's author.

> **Audited at:** `origin/main` @ **`2ce257f001833572eb8a239150922c522b9f7ad2`**
> (the commit that landed this doc, PR #2280).
>
> **Citation unit (drift-immune).** Every **gap** in the enumeration (§1, §1b)
> is cited by its **handler identity** — `` `file.ts · METHOD /route` `` — the
> registered route, stable across line churn. This is the authoritative unit
> the reviewer verifies; §7 is the scripted proof that all of them resolve at
> the audited SHA. Physical line numbers are **optional convenience annotations
> valid only at the audited SHA above**; they are *generated*, not
> hand-maintained, by the re-verify pass (`verify-010-citations.mjs`, output in
> §7), and **head-drift after the audited SHA is not a defect** for this
> point-in-time artifact. The §2 (not-a-gap) and §1c (out-of-scope write)
> references keep their `file.ts:line` locations for the WI-2416 sweep's
> convenience; those line numbers are likewise annotations valid only at the
> audited SHA. Rationale: this doc cites hot files (`sessions.ts`,
> `progress.ts`) that `main` advanced past repeatedly during authoring; pinning
> the audit to one SHA and citing the drift-immune unit ends the moving-target
> race (per the pinned-revision principle, WI-2366 family / PM loop-breaker
> ruling 2026-07-19).

**Verdict: reachable, not refuted.** The plan's premise holds. Same root cause
as WI-1989/WI-1301/WI-1302 (org-membership standing in for caller identity),
now confirmed on the **read** surface: several routes let an authenticated,
**credentialed** non-owner org member (a family-join teen — see §0) read
another org member's data, or trigger a state change on their behalf, by
setting `X-Profile-Id` to that member's profile id.

## 0. Root cause (why this is reachable at all)

`profileScopeMiddleware` (`apps/api/src/middleware/profile-scope.ts:206-219`)
resolves the `X-Profile-Id` header by checking **org membership only**:

```ts
// profile-scope.ts:208-219
const scope = await getPersonScope(db, profileIdHeader, account.id);
if (!scope) { return forbidden(c, 'Profile does not belong to this account'); }
c.set('profileId', scope.profileId);
c.set('profileMeta', { ...scope.meta, resolvedVia: 'explicit-header' });
```

It never checks whether the resolved profile is the **caller's own** identity.
`accountMiddleware` (`apps/api/src/middleware/account.ts`) doesn't either — it
only resolves `callerPersonId` from the Clerk login, it never cross-checks it
against the header-selected profile. This is exactly the seam WI-1989/1301/1302
closed for **owner-gated write** routes (`assertCallerIsAccountOwner`,
`isCallerAlreadyOwner`) — this spike is the same seam on the **general read**
surface, which those WIs did not touch.

The blast radius is specifically **credentialed charges** — a profile with its
own `login` row (docs/adr/MMT-ADR-0008, `prd.md:343` "own device/account" =
credentialed charge; shipped via `routes/family-join.ts`). For an
uncredentialed charge (a young child fully managed by the parent's own login),
there is only one authenticated actor in the sub-tree, so no rival identity can
exploit the header — the gap only bites once a family has 2+ independently
logged-in members.

## 1. Confirmed gaps

Citation unit is the handler identity `` `file.ts · METHOD /route` `` (see header).
Line numbers live in §7 (scripted, valid at the audited SHA), not in these rows.

| # | Handler | Current check | Data/action exposed | Severity |
|---|---|---|---|---|
| G1 | `recaps.ts · GET /recaps/self` | none — bare `withProfile(c).profileId` | mentor-generated recap summaries of another profile's learning sessions | **HIGH** |
| G2 | `learner-profile.ts · GET /learner-profile` | none — bare `withProfile(c)` | full memory-projection self-view (facts/preferences the mentor has learned about the learner) | **HIGH** |
| G3 | `learner-profile.ts · GET /learner-profile/export-text` | none — bare `withProfile(c)` | human-readable full memory export of another profile | **HIGH** |
| G4a | `notes.ts · GET /subjects/:subjectId/books/:bookId/notes` | none — bare `requireProfileId(c.get('profileId'))`, no guardian variant exists in this file at all | all notes for every topic in a book | **HIGH** |
| G4b | `notes.ts · GET /subjects/:subjectId/topics/:topicId/note` | none — bare `requireProfileId(c.get('profileId'))` | single legacy-shape note for a topic | **HIGH** |
| G4c | `notes.ts · GET /notes` | none — bare `requireProfileId(c.get('profileId'))` | all notes for the profile, cursor-paginated | **HIGH** |
| G4d | `notes.ts · GET /notes/topic-ids` | none — bare `requireProfileId(c.get('profileId'))` | topic IDs that have at least one note | **HIGH** |
| G4e | `notes.ts · GET /notes/concept-mastery` | none — bare `withProfile(c)` | derived concept-grain note-mastery signals | **HIGH** |
| G4f | `notes.ts · GET /subjects/:subjectId/topics/:topicId/notes` | none — bare `requireProfileId(c.get('profileId'))` | all notes for a topic | **HIGH** |
| G4g | `notes.ts · GET /subjects/:subjectId/topics/:topicId/sessions` | none — bare `requireProfileId(c.get('profileId'))` | sessions linked to a topic (backs the notes screen's session list) | **HIGH** |
| G5 | `consent.ts · GET /consent/my-status` | none — bare `c.get('profileId')` | consent status, masked parent email, consent type of another profile | **MEDIUM** |
| G6 | `consent.ts · POST /consent/request`, `consent.ts · POST /consent/resend` (both reach the `assertCanRequestConsentForChild` self-service branch, `if (childProfileId === activeProfileId) return;`) | no `callerPersonId` check, no credential check on the self-service branch | attacker can trigger/resend a parental-consent email and set `consentType` for **any** child profile on the account by setting `X-Profile-Id` to that child's id | **MEDIUM** (state-changing, not data disclosure — flagged here because exec-1989 named it as the concrete target, even though the enclosing routes are POST, not GET; see scope note below) |
| G7a | `progress.ts · GET /subjects/:subjectId/progress` | none — bare `withProfile(c)`, no guardian variant in this file | subject progress with topic breakdown | **MEDIUM–HIGH** |
| G7b | `progress.ts · GET /subjects/:subjectId/topics/:topicId/progress` | none — bare `withProfile(c)` | detailed topic progress | **MEDIUM–HIGH** |
| G7c | `progress.ts · GET /progress/overview` | none — bare `withProfile(c)` | overall progress across all subjects | **MEDIUM–HIGH** |
| G7d | `progress.ts · GET /progress/review-summary` | none — bare `withProfile(c)` | total overdue review count + next review topic | **MEDIUM–HIGH** |
| G7e | `progress.ts · GET /progress/overdue-topics` | none — bare `withProfile(c)` | overdue topics grouped by subject | **MEDIUM–HIGH** |
| G7f | `progress.ts · GET /progress/sessions` | none — bare `withProfile(c)` | practice history | **MEDIUM–HIGH** |
| G7g | `progress.ts · GET /progress/practice-activity-history` | none — bare `withProfile(c)` | practice history across all activity types (quiz/review/assessment/dictation/recitation/fluency_drill) | **MEDIUM–HIGH** |
| G7h | `progress.ts · GET /progress/reports` | none — bare `withProfile(c)` | monthly performance reports list | **MEDIUM–HIGH** |
| G7i | `progress.ts · GET /progress/reports/:reportId` | none — bare `withProfile(c)` | monthly performance report detail | **MEDIUM–HIGH** |
| G7j | `progress.ts · GET /progress/weekly-reports` | none — bare `withProfile(c)` | weekly performance reports list | **MEDIUM–HIGH** |
| G7k | `progress.ts · GET /progress/weekly-reports/:weeklyReportId` | none — bare `withProfile(c)` | weekly performance report detail | **MEDIUM–HIGH** |
| G7l | `progress.ts · GET /progress/topic/:topicId/active-session` | none — bare `withProfile(c)` | active/paused session for a specific topic | **MEDIUM–HIGH** |
| G7m | `progress.ts · GET /topics/:topicId/resolve` | none — bare `withProfile(c)` | topic's parent subject (deep-link resolution) | **MEDIUM–HIGH** |
| G7n | `progress.ts · GET /progress/resume-target` | none — bare `withProfile(c)` | unified "continue learning" target for Home/Library/Progress | **MEDIUM–HIGH** |
| G7o | `progress.ts · GET /progress/continue` | none — bare `withProfile(c)` | "continue where I left off" suggestion | **MEDIUM–HIGH** |
| G8a | `sessions.ts · GET /sessions/resume-nudge` | none — bare `withProfile(c)` / `requireProfileId(c.get('profileId'))`; the file imports no owner/guardian guard | resume-nudge state for another profile's paused session | **MEDIUM–HIGH** |
| G8b | `sessions.ts · GET /subjects/:subjectId/sessions` | none — bare `withProfile(c)` / `requireProfileId(c.get('profileId'))` | session list for a subject | **MEDIUM–HIGH** |
| G8c | `sessions.ts · GET /sessions/:sessionId` | none — bare `withProfile(c)` / `requireProfileId(c.get('profileId'))` | session state/metadata | **MEDIUM–HIGH** |
| G8d | `sessions.ts · GET /sessions/:sessionId/transcript` | none — bare `withProfile(c)` / `requireProfileId(c.get('profileId'))` | the **full raw mentor-conversation transcript** — same sensitivity class as G1's recaps, arguably more so (it is the source material recaps are generated from) | **HIGH** |
| G8e | `sessions.ts · GET /sessions/:sessionId/summary` | none — bare `withProfile(c)` / `requireProfileId(c.get('profileId'))` | session summary | **MEDIUM–HIGH** |
| G8f | `quiz.ts · GET /quiz/rounds/recent` | none — bare `withProfile(c)` / `requireProfileId(c.get('profileId'))`; the file imports no owner/guardian guard | recent quiz rounds | **MEDIUM–HIGH** |
| G8g | `quiz.ts · GET /quiz/rounds/:id` | none — bare `withProfile(c)` / `requireProfileId(c.get('profileId'))` | quiz-round detail: history and answers | **MEDIUM–HIGH** |
| G8h | `quiz.ts · GET /quiz/stats` | none — bare `withProfile(c)` / `requireProfileId(c.get('profileId'))` | quiz performance stats | **MEDIUM–HIGH** |

**Proposed ruling — same remedy for G1–G8** (and for the further gaps in §1b
below): a shared authority check, reusing existing primitives (§3), applied
per-handler (§4) at each of the above. **Not implemented in this spike** —
Cosmo AC forbids handler changes here; each confirmed gap should become its
own (or a batched) follow-up WI, mirroring how WI-2397/WI-2398 were captured
from the WI-1989 sweep. **Note on `assertNotProxyMode`:** several gap rows
below cite a handler that already carries `assertNotProxyMode(c)`. That guard
is orthogonal to this doc's root cause — it blocks the *parent-proxy* vector
(a parent's session acting on a child profile), not the *credentialed-sibling
`X-Profile-Id` spoof* this doc is about (§0). A route with
`assertNotProxyMode` and no caller-identity check is still a gap.

## 1b. Full classification — the deferred ~28 route groups (rework)

The first pass of this doc (PR #2272) deferred the remaining route groups the
224-call-site scan found. Gate-2 review bounced that deferral as incomplete
(§0 root cause, G1–G7, and the spike-only/no-handler-change constraint were
all confirmed valid in that review — only the enumeration was short). This
section completes it: every one of the 40 files the scan touched has been
read in full and every `GET`/self-read handler classified below, in the same
file:line/current-check/exposure/severity shape as §1. Handlers already
covered by G1–G8 are not repeated. Self-mutating `POST`/`PATCH`/`DELETE`
branches sharing the same root cause are **not** re-tabled at this rigor
(WI-2006's AC is read-side) — they are named, grouped, and folded into the
WI-2416 follow-up sweep at the end of this section instead.

| # | Handler | Current check | Data/action exposed | Severity |
|---|---|---|---|---|
| G9 | `assessments.ts · GET /subjects/:subjectId/topics/:topicId/assessments/active` | none — bare `withProfile(c)` | active assessment status/depth/mastery for the topic | **MEDIUM** |
| G10 | `assessments.ts · GET /assessments/:assessmentId` | none — bare `withProfile(c)` | full assessment record incl. `exchangeHistory` (the mentor/learner chat exchanges for the assessment) | **HIGH** (transcript-class content) |
| G11 | `book-suggestions.ts · GET /subjects/:subjectId/book-suggestions`, `book-suggestions.ts · GET /subjects/:subjectId/book-suggestions/all` | none — bare `requireProfileId(c.get('profileId'))` | unpicked/all book suggestions for a subject | **MEDIUM** |
| G12 | `bookmarks.ts · GET /bookmarks/session`, `bookmarks.ts · GET /bookmarks` | none — bare `requireProfileId(c.get('profileId'))` | bookmarked conversation events, tagged by subject/topic | **MEDIUM** |
| G13 | `books.ts · GET /library/books`, `books.ts · GET /subjects/:subjectId/books`, `books.ts · GET /subjects/:subjectId/books/:bookId`, `books.ts · GET /subjects/:subjectId/books/:bookId/sessions` | none — bare `requireProfileId(c.get('profileId'))` | library/curriculum structure, per-book session list | **MEDIUM** |
| G14 | `celebrations.ts · GET /celebrations/pending` | none — bare `requireProfileId(c.get('profileId'))`; the `viewer=parent` query param is also purely client-asserted (not derived from caller identity) | pending achievement/celebration milestones | **LOW** |
| G15 | `coaching-card.ts · GET /coaching-card` | none — bare `requireProfileId(c.get('profileId'))` | mentor's private coaching-card guidance about the learner (same class as G2's memory projection) | **HIGH** |
| G16 | `curriculum.ts · GET /subjects/:subjectId/curriculum`, `curriculum.ts · GET /subjects/:subjectId/curriculum/topics/:topicId/explain` (the file's writes — `clone-from-child`/`undo` — are already owner-gated, see §2) | none — bare `requireProfileId(c.get('profileId'))` | curriculum structure, topic-ordering rationale | **MEDIUM** |
| G17 | `dictation.ts · GET /dictation/streak`, `dictation.ts · GET /dictation/history` | none — bare `requireProfileId(c.get('profileId'))` | dictation streak; history includes the **persisted source sentences** of past exercises | **MEDIUM** (streak) / **MEDIUM–HIGH** (history) |
| G18 | `language-progress.ts · GET /subjects/:subjectId/cefr-progress` | none — bare `requireProfileId(c.get('profileId'))` | CEFR language-proficiency progress | **MEDIUM** |
| G19 | `library-search.ts · GET /library/search` | none — bare `requireProfileId(c.get('profileId'))` | search results over the profile's library | **MEDIUM** |
| G20 | `nudges.ts · GET /nudges` | none — bare `requireProfileId(c.get('profileId'))` | unread nudges (encouragement messages from other family members) | **MEDIUM** |
| G21 | `parking-lot.ts · GET /sessions/:sessionId/parking-lot`, `parking-lot.ts · GET /subjects/:subjectId/topics/:topicId/parking-lot` | none — bare `requireProfileId(c.get('profileId'))` | parked learner questions | **MEDIUM** |
| G22a | `retention.ts · GET /library/retention` | none — bare `requireProfileId(c.get('profileId'))` | retention metrics aggregated across all subjects | **MEDIUM** |
| G22b | `retention.ts · GET /retention/assessment-eligible` | none — bare `requireProfileId(c.get('profileId'))` (`assertNotProxyMode` present, orthogonal — see note above the gap tables) | topics eligible for assessment | **MEDIUM** |
| G22c | `retention.ts · GET /subjects/:subjectId/retention` | none — bare `requireProfileId(c.get('profileId'))` | retention status for all topics in a subject | **MEDIUM** |
| G22d | `retention.ts · GET /topics/:topicId/retention` | none — bare `requireProfileId(c.get('profileId'))` | retention card for a single topic | **MEDIUM** |
| G22e | `retention.ts · GET /subjects/:subjectId/needs-deepening` | none — bare `requireProfileId(c.get('profileId'))` | topics needing extra review | **MEDIUM** |
| G22f | `retention.ts · GET /subjects/:subjectId/teaching-preference` | none — bare `requireProfileId(c.get('profileId'))` | teaching-method preference | **MEDIUM** |
| G22g | `retention.ts · GET /retention/stability` | none — bare `requireProfileId(c.get('profileId'))` | topic stability status | **MEDIUM** |
| G22h | `retention.ts · GET /topics/:topicId/evaluate-eligibility` | none — bare `requireProfileId(c.get('profileId'))` | EVALUATE-eligibility check for a topic | **MEDIUM** |
| G23 | `settings.ts · GET /settings/notifications`, `settings.ts · GET /settings/celebration-level` (self-branch only — with no `childProfileId` query; the `childProfileId` branch on the same handler already calls `assertOwnerProfile`+`assertCallerIsAccountOwner`, not a gap), `settings.ts · GET /settings/subjects/:subjectId/analogy-domain`, `settings.ts · GET /settings/subjects/:subjectId/native-language` | none — bare `withProfile(c)`, and the service functions (`getNotificationPrefs`, `getCelebrationLevel`, `getAnalogyDomain`, `getNativeLanguage`) carry no ownership check either (contrast with the file's own `getOwnedFamilyPoolBreakdownSharing`/`verifyProfileOwnership`, see §2) | **LOW** |
| G24 | `snapshot-progress.ts · GET /progress/inventory`, `snapshot-progress.ts · GET /progress/history`, `snapshot-progress.ts · GET /progress/milestones` | none — bare `withProfile(c)` | knowledge inventory, progress history, recent milestones — same class as G7a–G7o's `progress.ts` (a **separate** file of the same name-shape; don't conflate the two) | **MEDIUM–HIGH** |
| G25 | `streaks.ts · GET /streaks`, `streaks.ts · GET /xp` | none — bare `requireProfileId(c.get('profileId'))` | streak/XP gamification stats | **LOW** |
| G26 | `subjects.ts · GET /subjects`, `subjects.ts · GET /subjects/:id` | none — bare `requireProfileId(c.get('profileId'))` | subject list/detail | **MEDIUM** |
| G27 | `topic-suggestions.ts · GET /subjects/:subjectId/books/:bookId/topic-suggestions` | none — bare `requireProfileId(c.get('profileId'))` | unused topic suggestions for a book | **LOW–MEDIUM** |
| G28 | `vocabulary.ts · GET /subjects/:subjectId/vocabulary` | none — bare `requireProfileId(c.get('profileId'))` | vocabulary list for a subject | **MEDIUM** |

### New-beyond-G1–G8: the supporter-scope surface (`now.ts`, `scopes.ts`)

These two files were part of the 224-call-site scan but their shape is
**not** guardian/parent-child — it's the newer **supporter** network
(`supportership` table, S4). They surface a **structurally new instance of
the same §0 root cause** on a different edge type, which **§3's proposed
remedy does not cover** (`verifyPersonOwnershipV2` only checks
self-or-guardian-of-uncredentialed; it has no supportership clause). Flagging
prominently because the fix in §3 as written would miss this surface entirely
if implemented as-is.

| # | Handler | Current check | Data/action exposed | Severity |
|---|---|---|---|---|
| G29 | `now.ts · GET /now`, `now.ts · GET /now/overflow` (both under `scope=self`) | none — bare `withProfile(c)` for the `self` scope | personalized "Now" digest cards (deep-links into sessions/topics) — same disclosure class as G1's recaps | **HIGH** |
| G30 | `now.ts · GET /now`, `now.ts · GET /now/overflow` (the `scope=supporter-hub` / `scope=person` branches — target resolved in `services/now-feed.ts` `resolveTarget` / `collectSupporterHubCandidates`) | checks a `supportership` edge **from the header-resolved `profileId`** to the target `personId` (`services/now-feed.ts`) — authority is derived from the spoofable header, not `callerPersonId` | supporter-hub summary / a specific supportee's Now feed, for whichever profile the header resolves to | **HIGH** |
| G31 | `scopes.ts · GET /scopes`, `scopes.ts · GET /scopes/coldstart` | none — bare `withProfile(c)` | which supportee scopes / cold-start state the resolved profile has | **MEDIUM** |
| G32 | `scopes.ts · GET /scopes/:personId/subjects` — served via `readSupporteeStructuralSubjects` (`services/supporter-structural-mask.ts`) | checks a `supportership` edge **from the header-resolved `profileId`** to `:personId` (`services/supporter-structural-mask.ts`) — same shape as G30 | a supportee's structural subject list | **HIGH** |

**Proposed ruling (G29–G32):** the self-scope rows (G29's `self` case, G31)
take the same self-or-guardian remedy as G1–G28. The supportership-edge rows
(G30, G32) need a **parallel** authority check —
`authorized(callerPersonId, targetPersonId)` iff `callerPersonId ===
targetPersonId` **or** an accepted `supportership` edge exists **from
`callerPersonId`** (not from the header-resolved `profileId`) to
`targetPersonId` — re-deriving the edge lookup against `callerPersonId`
instead of `profileId`. This is a distinct primitive from
`verifyPersonOwnershipV2`; §3's remedy should be extended to name it, not
assumed to cover it. Fold into the same WI-2416 follow-up family as G1–G28.

## 1c. Self-mutating write branches sharing the root cause (named, not tabled — WI-2416)

The 224-call-site scan matches both reads and writes (the pattern doesn't
distinguish). Beyond G6 (already tabled, because exec-1989 named it as the
concrete target), the following self-write branches bind an action to the
**header-resolved** `profileId` with no `callerPersonId` check, so a
credentialed-sibling spoof can act **on another profile's behalf** (state
change, not data disclosure — hence grouped here rather than given individual
severity rows). Every one is the same root cause as G6; none were touched in
this spike:

- `routes/analytics.ts` — none (POST hashes the caller's own resolved profile id only; verified not a gap, see §2).
- `routes/challenge-round.ts:24-76` — `POST /challenge-round/{accept,decline,abort}` — spoof lets a caller accept/decline/abort **another** profile's challenge round.
- `routes/filing.ts:63-323` — `POST /filing/request-retry`, `POST /filing` — spoof files content into / retries filing for another profile's library.
- `routes/homework.ts:36-55` — `POST /subjects/:subjectId/homework` — spoof starts a homework session under another profile (`/ocr` at `:58` is not profile-scoped in any meaningful way — not a gap).
- `routes/learner-profile.ts` self-write routes gated only by `assertCanManageOwnConsent`/`assertNotProxyMode` (not `callerPersonId`): `DELETE /learner-profile/item:114`, `DELETE /learner-profile/all:172`, `PATCH /learner-profile/collection:194`, `PATCH /learner-profile/injection:243`, `POST /learner-profile/consent:292`, `POST /learner-profile/tell:331`, `POST /learner-profile/unsuppress:368`, `PATCH /learner-profile/accommodation-mode:408` — this is the same shape §6 already flagged for 3 of these; extending that observation to all 8 self-routes in the file (the `:profileId` parent-on-behalf variants of each are already owner-gated, not gaps).
- `routes/notices.ts:29-43` — `POST /notices/:id/seen` — spoof marks another profile's notice seen.
- `routes/notifications.ts:85-108` — `POST /notifications/child-cap/notify-parent` — spoof creates a child-cap notification attributed to another profile.
- `routes/nudges.ts:34-46` — `POST /nudges` — spoof sends a nudge with `fromProfileId` set to another profile (identity spoofing in a social feature — worth a closer look in the follow-up given the impersonation angle, not just data exposure).
- `routes/onboarding.ts:161-196,227-252` — `PATCH /onboarding/pronouns`, `PATCH /onboarding/interests/context` (the sibling `/onboarding/language` self-route is **already** gated by `assertOwnerProfile`+`assertCallerIsAccountOwner` — not a gap) — spoof edits another profile's pronouns/interests.
- `routes/speaking-practice.ts:44-75` — `POST /language/speaking-practice/attempts` — spoof records a practice attempt under another profile.
- `routes/support.ts` — none (POST is rate-limited telemetry spillover keyed to the caller's own resolved profile; verified not a gap, see §2).

None of these were implemented in this spike (write-side, out of WI-2006's
AC). They fold into the same WI-2416 sweep as G1–G32; several (nudges'
sender-spoof, learner-profile's consent-toggle spoof already named in §6) are
plausibly HIGH once triaged for real product impact, but that triage is the
follow-up WI's job, not this doc's.

## 2. Reviewed — NOT a gap (positive/reference patterns already in the codebase)

These were checked because they share surface-level shape with the gaps above,
but on inspection already close the caller-identity hole:

- **`routes/consent.ts:596-629` (`PUT /consent/self/withdraw`) and `:638-662`
  (`GET /consent/self/accountability`)** — both bind to `callerPersonId`
  (server-resolved), explicitly documented as avoiding exactly this IDOR
  ("Binding to the active profile would let an account member withdraw ANOTHER
  in-account profile's adult consent"). This is the textbook example of the fix
  this spike would generalize.
- **`routes/profiles.ts:383-491` (`PATCH /profiles/:id`,
  `PATCH /profiles/:id/app-context`)** — the naive self-check
  (`id === activeProfileId`) is layered with `if (c.get('callerPersonId') !== id)
  { await assertChargeNotCredentialed(db, id); }` (lines 420, 484), which
  independently blocks the spoof: a credentialed target can't be
  "self-updated" by a caller who isn't really them. Verified safe.
- **`routes/dashboard.ts` — all 14 `/dashboard/children/:profileId/*` routes**
  (`:105,131,152,173,201,224,283,305,332,353,396,413,458,480` — the rework-3
  handler-parity pass found `GET /dashboard/children/:profileId/progress-history`
  at `:173`, uncited in the prior pass alongside its 13 siblings) — already
  gate with `assertOwnerAndParentAccess` + `assertCallerIsAccountOwner`
  (WI-1989), `+ assertChargeNotCredentialed` / `assertChildDashboardDataVisible`
  where relevant. This is the reference "guardian legitimately reads a child"
  template — it answers plan question 4 (§5) and needs no read-side change.
  **Note:** root `GET /dashboard` itself (`dashboard.ts:88-102`, bare
  `withProfile(c)`, no guard) shares this doc's exact gap shape but is **not**
  re-listed as a new gap here — it's already the subject of the previously
  captured **WI-2397** ("root /dashboard ungated"). Reconciled, not missed.
- **`routes/consent.ts:490-531` (`GET /consent/:childProfileId/status`)** —
  found by the rework-3 handler-parity pass (absent from both prior versions
  of this doc despite consent.ts being a scanned file). Gates with
  `assertOwnerProfile` + `assertCallerIsAccountOwner` (WI-1989 pattern,
  `:496-501`) before reading the named child's consent state. Not a gap.
- **`routes/family-join.ts` (`POST /family-join/invite`, `POST
  /family-join/accept`)** — both route through `withCaller()`, which binds
  every authorized action to `callerPersonId` (server-resolved), never to the
  header-selected `profileId`. This file matched the 224-call-site scan only
  because `withCaller` calls `withProfile(c)` internally to unwrap `db` — the
  authority itself never touches `profileId`. A second reference example of
  the correct pattern, alongside `dashboard.ts`.
- **`routes/visibility.ts` (all 7 routes, incl. the 2 GETs:
  `/visibility/links/:id/contract:128-140`,
  `/visibility/reports/:personId/shared-record:174-190`)** — same pattern as
  `family-join.ts`: every handler resolves authority from `callerPersonId` via
  its own `withCaller()`, and independently re-checks caller-supplied
  identifiers (`supporterPersonId`/`actorPersonId`) against it before acting.
  A third reference example — this surface (the supporter "visibility
  contract" linking ceremony) got the caller-identity model right from the
  start, in contrast to the supporter-scope gap in G30/G32 above.
- **`routes/settings.ts:174-187` (`GET /settings/withdrawal-archive`)** —
  route-level `assertOwnerProfile` + `assertCallerIsAccountOwner` (WI-1989
  pattern). Not a gap.
- **`routes/settings.ts:222-245` (`GET /settings/family-pool-breakdown-sharing`)**
  — the route itself is bare, but the service function it calls,
  `getOwnedFamilyPoolBreakdownSharing` (`services/settings.ts:407-420`), calls
  `verifyProfileOwnership` → `verifyPersonOwnershipV2(profileId, accountId,
  callerPersonId)` internally — i.e. it **already implements exactly the
  remedy §3 proposes**, at the service layer rather than the route layer.
  This is the closest existing precedent for the fix and worth citing in the
  follow-up WI as the pattern to replicate (its sibling
  `getNotificationPrefs`/`getCelebrationLevel`/etc. in the same file do
  **not** do this — see G23 — so the protection is inconsistent even within
  one file).
- **`routes/notifications.ts:53-64` (`GET /notifications/child-cap`)** —
  route-level `assertOwnerProfile` + `assertCallerIsAccountOwner`. Not a gap.
- **`routes/onboarding.ts:90-125` (`PATCH /onboarding/language`)** —
  route-level `assertOwnerProfile` + `assertCallerIsAccountOwner`, unlike its
  sibling self-routes for pronouns/interests (see §1c). Not a gap.
- **`routes/analytics.ts:29-61` (`POST /analytics/hash-profile-id`)** — hashes
  only the caller's own already-resolved `profileId`; the request-body
  `profileId` is checked for equality against it and rejected (403) on
  mismatch. No cross-profile read or write. Not a gap.
- **`routes/support.ts:58-106` (`POST /outbox-spillover`)** — rate-limited
  client-retry telemetry keyed to the caller's own resolved profile; no
  cross-profile surface. Not a gap.

## 3. The authority rule (plan question 2)

Proposed: `authorized(caller, targetProfileId)` iff

- `callerPersonId === targetProfileId` (self), **or**
- `isGuardianOf(callerPersonId, targetProfileId)` **and** the target has no
  `login` row (uncredentialed) — mirroring `verifyPersonOwnershipV2`'s
  self-or-guardian shape (`services/identity-v2/ownership-v2.ts:64-106`).

Recommend **reusing `verifyPersonOwnershipV2` itself**, not writing a new
`assertCanReadProfile` — it already does (a) org-membership defense-in-depth,
(b) self, (c) guardian-only-if-uncredentialed. It's currently a WRITE-authority
primitive (used by `settings.ts` / `learner-profile.ts`'s erasure path); the
same rule holds for reads, dashboard.ts shows org-admin-alone is deliberately
**not** sufficient (it additionally requires the parent-link edge via
`assertParentAccess`), so a 3rd independent "org-admin" clause is unnecessary —
self-or-guardian-edge already covers the owner-reading-their-own-child case
(the owner IS the guardian).

**One wrinkle for Step 2 (not a gap in this spike, an implementation note):**
`verifyPersonOwnershipV2`'s no-authority branch throws a bare `Error`
(`ownership-v2.ts:103-105`), not `ForbiddenError` — a read call site reusing it
verbatim would surface a 500 instead of a 403 unless the call site catches and
remaps, or the primitive is given a `ForbiddenError`-throwing read-oriented
wrapper.

## 4. Enforcement point (plan question 3)

- **(a) Read-side middleware at the profile-scope boundary** — rejected.
  Middleware only sees the header; for the bare-self routes (the majority),
  the "target profile" IS the resolved scope, so middleware can't tell
  "reading resource for X" from "resource is X" without route-specific
  knowledge it doesn't have today.
- **(b) Per-handler `assertCanReadProfile`/`verifyPersonOwnershipV2` call at
  each read site — recommended.** Matches the codebase's existing convention
  (every owner/guardian gate today — `assertOwnerAndParentAccess`,
  `assertCallerIsAccountOwner`, `assertChargeNotCredentialed` — is per-handler,
  not middleware). Needs a forward-only ratchet test (pattern:
  `safe-non-core.guard.test.ts`) so a new read route can't ship ungated —
  deferred to the follow-up implementation WI (plan Step 4).

## 5. What would break naively (plan question 4)

- `dashboard.ts`'s guardian reads: **not broken** — self-or-guardian is a
  superset of what `assertOwnerAndParentAccess` already grants; no change
  needed there.
- Bare self-reads (G1–G8): the fix compares `callerPersonId` against the
  **already-resolved** `profileId` (which IS the target for these routes) — no
  route signature change, no new parameter threading.
- Uncredentialed-charge sub-trees: the fix is a no-op (no rival authenticated
  identity exists to exploit the header) — confirms the blast radius is
  specifically family-join (credentialed) accounts, per §0.

No flow was found where applying the rule would force weakening a legitimate
guardian read back to org-membership-only. STOP conditions in the source plan
(reachability refuted / guardian-edge lookup insufficient / rule breaks a
guardian dashboard) **do not apply** — proceed as a genuine finding set.

## 6. Adjacent, out-of-scope observation (flagging only, not audited to this doc's rigor)

`routes/learner-profile.ts`'s `assertCanManageOwnConsent`-gated **write**
routes (toggle-memory-collection, toggle-memory-injection, grant-memory-consent)
authorize purely on the active (header-resolved) profile's `isOwner`/age
(`services/family-access.ts:122-162`) — same root cause, **write** side, not
bound to `callerPersonId`. A credentialed org member could spoof
`X-Profile-Id` to an adult sibling's profile and toggle *that* sibling's
memory-consent settings. This is outside WI-2006's read-side AC (and outside
this spike's effort budget) — recommend a dedicated follow-up in the same
family as WI-2397/WI-2398. **§1c (added in the rework) generalizes this
observation** to the full set of self-mutating write branches the 224-site
scan surfaced across all 40 files, including 5 more routes in this same file.

## Full classification (WI-2006 rework 3 — exhaustive per-handler enumeration)

The first pass deferred a full sweep of the 224 call sites / 40 files the scan
found (§0/§3 root cause and rule were already validated; only the enumeration
was incomplete — the Gate-2 bounce #1). Rework 2 read all 40 files and
classified every `GET` handler, but cited several groups (notably G7's 15
`progress.ts` handlers, tabled under one `108-227` range) as line-range
lumps instead of individual rows, and undercounted two handlers
entirely — Gate-2 bounce #2. Rework 3 re-derived the handler set from scratch,
per file, and reconciled it 1:1 against every row, but cited it by drift-prone
`file:line` — Gate-2 bounce #3 (`sessions.ts` lines had moved under it).
**This pass (the re-scope) re-expresses every gap citation as its drift-immune
handler identity `` `file.ts · METHOD /route` ``, declares the audited SHA
(header), and re-verifies all of them against that SHA in one scripted pass
(§7).** The reconciliation below holds **at the audited SHA**; the method and
the proof are below.

### Method

For each of the 40 scanned files, every `GET` route registration was located
independently of the doc (`rg -nP "(?<!c)\.get\(" apps/api/src/routes/*.ts`,
filtered to the 40-file list, with multi-line `.get(\n  '/path',` call sites
followed by hand-reading the surrounding lines — a single-line-only regex
undercounts, since roughly a third of this codebase's route registrations put
the path on the line after `.get(`). Every resulting handler was then matched
against a row in this doc (a gap ID or a §2 "not a gap" bullet) by its own
precise file:line span — not by falling inside a broader cited range.

### Coverage proof (all 108 `GET` handlers in the 40 scanned files)

| Disposition | Count | Composition |
|---|---|---|
| Gaps, G1–G8 (originally tabled, now itemized where they were grouped) | 34 | 1 (G1) + 1 (G2) + 1 (G3) + 7 (G4a–G4g, `notes.ts`) + 1 (G5) + 15 (G7a–G7o, `progress.ts`) + 8 (G8a–G8h, `sessions.ts` ×5 + `quiz.ts` ×3) = 34. (G6 is a `POST` self-service branch, not a `GET` — excluded here, tabled in §1.) |
| Gaps, G9–G28 | 42 | 2 (G9+G10, assessments) + 2 (G11, book-suggestions) + 2 (G12, bookmarks) + 4 (G13, books) + 1 (G14, celebrations) + 1 (G15, coaching-card) + 2 (G16, curriculum) + 2 (G17, dictation) + 1 (G18, language-progress) + 1 (G19, library-search) + 1 (G20, nudges) + 2 (G21, parking-lot) + 8 (G22a–G22h, retention) + 4 (G23, settings) + 3 (G24, snapshot-progress) + 2 (G25, streaks) + 2 (G26, subjects) + 1 (G27, topic-suggestions) + 1 (G28, vocabulary) = 42. |
| Gaps, G29–G32 (supporter-scope) | 5 | `now.ts` ×2 (G29+G30, same 2 physical handlers under both scope branches) + `scopes.ts` ×3 (G31 ×2 + G32 ×1). **Correction from rework 2:** the prior arithmetic bullet said "`scopes.ts` ×2", undercounting by 1 — `scopes.ts` has 3 `GET` handlers (`:21`, `:26`, `:32`→`:33`), all three already individually cited across G31/G32; only the summary total (4→5) was wrong, not the row coverage. |
| Cleared, §2 | 26 | 2 (`recaps.ts` — `:47`, `:75`, both owner-gated) + 2 (`consent.ts` — `:638` self/accountability, `:490` `:childProfileId/status`, both `callerPersonId`- or owner-gated) + 15 (`dashboard.ts` — 14 `/children/:profileId/*` routes incl. `:173` `progress-history`, found missing this rework, + `/dashboard/demo`) + 2 (`learner-profile.ts` `:profileId` variants) + 1 (`notifications.ts` child-cap) + 2 (`settings.ts` withdrawal-archive + family-pool-breakdown-sharing) + 2 (`visibility.ts`) = 26. |
| Excluded — tracked under a different, already-open WI | 1 | `dashboard.ts:88-102` root `GET /dashboard` — same gap shape as this doc's other findings, but already captured as **WI-2397**; not re-tabled here to avoid a duplicate WI, per §2. |
| **Total `GET` handlers, 40 files** | **108** | 34 + 42 + 5 + 26 + 1 = **108**, matching the current handler count in `apps/api/src/routes/*.ts` for the 40 scanned files (re-derived independently of this doc — see Method). |

**Two corrections found by this rework's independent re-derivation** (neither
changes a severity verdict or the root-cause finding; both are additions to
§2, not gaps):

1. `routes/consent.ts:490-531` (`GET /consent/:childProfileId/status`) was
   absent from both prior versions of this doc despite `consent.ts` being a
   scanned file. It is owner-gated (`assertOwnerProfile` +
   `assertCallerIsAccountOwner`) — not a gap, now added to §2.
2. `routes/dashboard.ts:173-198` (`GET
   /dashboard/children/:profileId/progress-history`) was the file's 14th
   `/children/:profileId/*` route; the prior doc's §2 bullet said "13" and
   didn't cite it. It carries the same `assertOwnerAndParentAccess` +
   `assertCallerIsAccountOwner` gate as its 13 siblings — not a gap, §2
   bullet corrected.

Self-mutating write branches (`POST`/`PATCH`/`DELETE` matches of the same two
scan patterns) are the balance of the 224 call sites beyond these 108 `GET`
handlers — every one is named in §1c, none individually severity-scored (out
of this spike's read-side AC), all folded into the WI-2416 follow-up.

No "deferred" / "sampled" / "not individually audited" placeholder remains
anywhere in this doc — every read surface the scan found has its own row keyed
by handler identity (a gap ID or a §2 bullet, never a range that spans more
than one handler), a current-check description, a gap-or-not verdict, and (for
gaps) a proposed ruling. New HIGH-severity findings beyond the original
G1–G8 (G10, G15, G29, G30, G32) are listed above rather than fixed — this
remains a spike/documentation deliverable; no handler was changed to produce
this doc.

## 7. Citation re-verify (scripted, at the audited SHA)

Every gap handler-identity in §1/§1b was re-verified in one mechanical pass
against the audited SHA
(`2ce257f001833572eb8a239150922c522b9f7ad2`) with the co-located script:

```
node verify-010-citations.mjs 2ce257f001833572eb8a239150922c522b9f7ad2 --md
```

The script parses every `` `file.ts · METHOD /route` `` citation in this doc,
resolves each against `apps/api/src/routes/<file>` at that SHA (matching the
registered `.<method>('/route', …)` site, single- or multi-line), and exits
non-zero if any citation does not resolve. The line numbers below are its
output — a convenience annotation valid at the audited SHA, not a hand-kept
figure; head-drift after this SHA is not a defect. The table below is that
run's output, pasted verbatim.

| Citation | Resolves | Reg. line @ `2ce257f001` |
|---|---|---|
| `recaps.ts · GET /recaps/self` | ✅ | 62 |
| `learner-profile.ts · GET /learner-profile` | ✅ | 64 |
| `learner-profile.ts · GET /learner-profile/export-text` | ✅ | 77 |
| `notes.ts · GET /subjects/:subjectId/books/:bookId/notes` | ✅ | 105 |
| `notes.ts · GET /subjects/:subjectId/topics/:topicId/note` | ✅ | 125 |
| `notes.ts · GET /notes` | ✅ | 145 |
| `notes.ts · GET /notes/topic-ids` | ✅ | 158 |
| `notes.ts · GET /notes/concept-mastery` | ✅ | 166 |
| `notes.ts · GET /subjects/:subjectId/topics/:topicId/notes` | ✅ | 186 |
| `notes.ts · GET /subjects/:subjectId/topics/:topicId/sessions` | ✅ | 300 |
| `consent.ts · GET /consent/my-status` | ✅ | 464 |
| `consent.ts · POST /consent/request` | ✅ | 198 |
| `consent.ts · POST /consent/resend` | ✅ | 320 |
| `progress.ts · GET /subjects/:subjectId/progress` | ✅ | 65 |
| `progress.ts · GET /subjects/:subjectId/topics/:topicId/progress` | ✅ | 75 |
| `progress.ts · GET /progress/overview` | ✅ | 86 |
| `progress.ts · GET /progress/review-summary` | ✅ | 94 |
| `progress.ts · GET /progress/overdue-topics` | ✅ | 108 |
| `progress.ts · GET /progress/sessions` | ✅ | 116 |
| `progress.ts · GET /progress/practice-activity-history` | ✅ | 134 |
| `progress.ts · GET /progress/reports` | ✅ | 152 |
| `progress.ts · GET /progress/reports/:reportId` | ✅ | 162 |
| `progress.ts · GET /progress/weekly-reports` | ✅ | 188 |
| `progress.ts · GET /progress/weekly-reports/:weeklyReportId` | ✅ | 196 |
| `progress.ts · GET /progress/topic/:topicId/active-session` | ✅ | 221 |
| `progress.ts · GET /topics/:topicId/resolve` | ✅ | 230 |
| `progress.ts · GET /progress/resume-target` | ✅ | 240 |
| `progress.ts · GET /progress/continue` | ✅ | 257 |
| `sessions.ts · GET /sessions/resume-nudge` | ✅ | 185 |
| `sessions.ts · GET /subjects/:subjectId/sessions` | ✅ | 191 |
| `sessions.ts · GET /sessions/:sessionId` | ✅ | 273 |
| `sessions.ts · GET /sessions/:sessionId/transcript` | ✅ | 577 |
| `sessions.ts · GET /sessions/:sessionId/summary` | ✅ | 895 |
| `quiz.ts · GET /quiz/rounds/recent` | ✅ | 216 |
| `quiz.ts · GET /quiz/rounds/:id` | ✅ | 239 |
| `quiz.ts · GET /quiz/stats` | ✅ | 399 |
| `assessments.ts · GET /subjects/:subjectId/topics/:topicId/assessments/active` | ✅ | 83 |
| `assessments.ts · GET /assessments/:assessmentId` | ✅ | 205 |
| `book-suggestions.ts · GET /subjects/:subjectId/book-suggestions` | ✅ | 45 |
| `book-suggestions.ts · GET /subjects/:subjectId/book-suggestions/all` | ✅ | 90 |
| `bookmarks.ts · GET /bookmarks/session` | ✅ | 57 |
| `bookmarks.ts · GET /bookmarks` | ✅ | 70 |
| `books.ts · GET /library/books` | ✅ | 71 |
| `books.ts · GET /subjects/:subjectId/books` | ✅ | 82 |
| `books.ts · GET /subjects/:subjectId/books/:bookId` | ✅ | 101 |
| `books.ts · GET /subjects/:subjectId/books/:bookId/sessions` | ✅ | 332 |
| `celebrations.ts · GET /celebrations/pending` | ✅ | 30 |
| `coaching-card.ts · GET /coaching-card` | ✅ | 22 |
| `curriculum.ts · GET /subjects/:subjectId/curriculum` | ✅ | 132 |
| `curriculum.ts · GET /subjects/:subjectId/curriculum/topics/:topicId/explain` | ✅ | 276 |
| `dictation.ts · GET /dictation/streak` | ✅ | 340 |
| `dictation.ts · GET /dictation/history` | ✅ | 354 |
| `language-progress.ts · GET /subjects/:subjectId/cefr-progress` | ✅ | 26 |
| `library-search.ts · GET /library/search` | ✅ | 17 |
| `nudges.ts · GET /nudges` | ✅ | 47 |
| `parking-lot.ts · GET /sessions/:sessionId/parking-lot` | ✅ | 44 |
| `parking-lot.ts · GET /subjects/:subjectId/topics/:topicId/parking-lot` | ✅ | 58 |
| `retention.ts · GET /library/retention` | ✅ | 62 |
| `retention.ts · GET /retention/assessment-eligible` | ✅ | 69 |
| `retention.ts · GET /subjects/:subjectId/retention` | ✅ | 78 |
| `retention.ts · GET /topics/:topicId/retention` | ✅ | 92 |
| `retention.ts · GET /subjects/:subjectId/needs-deepening` | ✅ | 136 |
| `retention.ts · GET /subjects/:subjectId/teaching-preference` | ✅ | 150 |
| `retention.ts · GET /retention/stability` | ✅ | 222 |
| `retention.ts · GET /topics/:topicId/evaluate-eligibility` | ✅ | 236 |
| `settings.ts · GET /settings/notifications` | ✅ | 82 |
| `settings.ts · GET /settings/celebration-level` | ✅ | 112 |
| `settings.ts · GET /settings/subjects/:subjectId/analogy-domain` | ✅ | 329 |
| `settings.ts · GET /settings/subjects/:subjectId/native-language` | ✅ | 368 |
| `snapshot-progress.ts · GET /progress/inventory` | ✅ | 47 |
| `snapshot-progress.ts · GET /progress/history` | ✅ | 53 |
| `snapshot-progress.ts · GET /progress/milestones` | ✅ | 64 |
| `streaks.ts · GET /streaks` | ✅ | 22 |
| `streaks.ts · GET /xp` | ✅ | 31 |
| `subjects.ts · GET /subjects` | ✅ | 100 |
| `subjects.ts · GET /subjects/:id` | ✅ | 215 |
| `topic-suggestions.ts · GET /subjects/:subjectId/books/:bookId/topic-suggestions` | ✅ | 25 |
| `vocabulary.ts · GET /subjects/:subjectId/vocabulary` | ✅ | 37 |
| `now.ts · GET /now` | ✅ | 16 |
| `now.ts · GET /now/overflow` | ✅ | 22 |
| `scopes.ts · GET /scopes` | ✅ | 21 |
| `scopes.ts · GET /scopes/coldstart` | ✅ | 26 |
| `scopes.ts · GET /scopes/:personId/subjects` | ✅ | 33 |

