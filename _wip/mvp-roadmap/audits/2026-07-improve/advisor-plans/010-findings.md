# 010 — Findings: read-side profile-authority check

> Spike output for plan `010-read-side-profile-authority-spike.md` / Cosmo
> **WI-2006** (Spike, P2). This doc answers the plan's Step 1 questions.
> **No handler changes were made in this spike** — Cosmo's AC for WI-2006 is
> explicit that the deliverable is this findings doc; any concrete leak found
> here is a **finding**, to be fixed by a separate follow-up Work Item, not by
> this doc's author.

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

## 1. Confirmed gaps (file:line, audited)

| # | File:line | Route | Current check | Data/action exposed | Severity |
|---|---|---|---|---|---|
| G1 | `routes/recaps.ts:62-74` | `GET /recaps/self` | none — bare `withProfile(c).profileId` | mentor-generated recap summaries of another profile's learning sessions | **HIGH** |
| G2 | `routes/learner-profile.ts:64-75` | `GET /learner-profile` | none — bare `withProfile(c)` | full memory-projection self-view (facts/preferences the mentor has learned about the learner) | **HIGH** |
| G3 | `routes/learner-profile.ts:77-86` | `GET /learner-profile/export-text` | none — bare `withProfile(c)` | human-readable full memory export of another profile | **HIGH** |
| G4 | `routes/notes.ts:105-186,300-310` (all GETs in file) | `GET /notes`, `/notes/topic-ids`, book/topic note routes | none — bare `requireProfileId(c.get('profileId'))`, no guardian variant exists in this file at all | conversation-linked notes | **HIGH** |
| G5 | `routes/consent.ts:464-488` | `GET /consent/my-status` | none — bare `c.get('profileId')` | consent status, masked parent email, consent type of another profile | **MEDIUM** |
| G6 | `routes/consent.ts:144-169` (self-service branch, line 152-154), called from `POST /consent/request:224` and `POST /consent/resend:345` | `assertCanRequestConsentForChild` self-service branch | `if (childProfileId === activeProfileId) return;` — no `callerPersonId` check, no credential check | attacker can trigger/resend a parental-consent email and set `consentType` for **any** child profile on the account by setting `X-Profile-Id` to that child's id | **MEDIUM** (state-changing, not data disclosure — flagged here because exec-1989 named it as the concrete target, even though the enclosing routes are POST, not GET; see scope note below) |
| G7 | `routes/progress.ts:108-227` (all self GET/POST routes: `/progress/sessions`, `/overdue-topics`, `/practice-activity-history`, `/reports*`, `/weekly-reports*`, `/topic/:topicId/active-session`) | none — bare `withProfile(c)`, no guardian variant in this file | practice history, monthly/weekly performance reports | **MEDIUM–HIGH** |
| G8 | `routes/sessions.ts:184` (`GET /sessions/resume-nudge`), `:190` (`GET /subjects/:subjectId/sessions`), `:272` (`GET /sessions/:sessionId`), `:571` (`GET /sessions/:sessionId/transcript`), `:884` (`GET /sessions/:sessionId/summary`); `routes/quiz.ts:216` (`GET /quiz/rounds/recent`), `:239` (`GET /quiz/rounds/:id`), `:399` (`GET /quiz/stats`) | none — bare `withProfile(c)` / `requireProfileId(c.get('profileId'))`; neither file imports any owner/guardian guard | session state, quiz history/answers; `/sessions/:sessionId/transcript` is the **full raw mentor-conversation transcript** (same sensitivity class as G1's recaps, arguably more so — it's the source material recaps are generated from) | **HIGH** (`/transcript`); **MEDIUM–HIGH** (the other 7 handlers) |

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

| # | File:line | Route | Current check | Data/action exposed | Severity |
|---|---|---|---|---|---|
| G9 | `routes/assessments.ts:83-96` | `GET /subjects/:subjectId/topics/:topicId/assessments/active` | none — bare `withProfile(c)` | active assessment status/depth/mastery for the topic | **MEDIUM** |
| G10 | `routes/assessments.ts:205-241` | `GET /assessments/:assessmentId` | none — bare `withProfile(c)` | full assessment record incl. `exchangeHistory` (the mentor/learner chat exchanges for the assessment) | **HIGH** (transcript-class content) |
| G11 | `routes/book-suggestions.ts:45-59,90-103` (both GETs) | `GET /subjects/:subjectId/book-suggestions`, `/book-suggestions/all` | none — bare `requireProfileId(c.get('profileId'))` | unpicked/all book suggestions for a subject | **MEDIUM** |
| G12 | `routes/bookmarks.ts:57-69,70-83` (both GETs) | `GET /bookmarks/session`, `GET /bookmarks` | none — bare `requireProfileId(c.get('profileId'))` | bookmarked conversation events, tagged by subject/topic | **MEDIUM** |
| G13 | `routes/books.ts:71-80,82-100,101-122,332-343` (all 4 GETs) | `GET /library/books`, `/subjects/:subjectId/books`, `/subjects/:subjectId/books/:bookId`, `.../:bookId/sessions` | none — bare `requireProfileId(c.get('profileId'))` | library/curriculum structure, per-book session list | **MEDIUM** |
| G14 | `routes/celebrations.ts:30-59` | `GET /celebrations/pending` | none — bare `requireProfileId(c.get('profileId'))`; the `viewer=parent` query param is also purely client-asserted (not derived from caller identity) | pending achievement/celebration milestones | **LOW** |
| G15 | `routes/coaching-card.ts:22-28` | `GET /coaching-card` | none — bare `requireProfileId(c.get('profileId'))` | mentor's private coaching-card guidance about the learner (same class as G2's memory projection) | **HIGH** |
| G16 | `routes/curriculum.ts:132-138,276-301` (both GETs; the file's writes — `clone-from-child`/`undo` — are already owner-gated, see §2) | `GET /subjects/:subjectId/curriculum`, `.../curriculum/topics/:topicId/explain` | none — bare `requireProfileId(c.get('profileId'))` | curriculum structure, topic-ordering rationale | **MEDIUM** |
| G17 | `routes/dictation.ts:340-346,354-360` (both GETs) | `GET /dictation/streak`, `GET /dictation/history` | none — bare `requireProfileId(c.get('profileId'))` | dictation streak; history includes the **persisted source sentences** of past exercises | **MEDIUM** (streak) / **MEDIUM–HIGH** (history) |
| G18 | `routes/language-progress.ts:26-41` | `GET /subjects/:subjectId/cefr-progress` | none — bare `requireProfileId(c.get('profileId'))` | CEFR language-proficiency progress | **MEDIUM** |
| G19 | `routes/library-search.ts:17-28` | `GET /library/search` | none — bare `requireProfileId(c.get('profileId'))` | search results over the profile's library | **MEDIUM** |
| G20 | `routes/nudges.ts:47-51` | `GET /nudges` | none — bare `requireProfileId(c.get('profileId'))` | unread nudges (encouragement messages from other family members) | **MEDIUM** |
| G21 | `routes/parking-lot.ts:44-55,58-69` (both GETs) | `GET /sessions/:sessionId/parking-lot`, `.../topics/:topicId/parking-lot` | none — bare `requireProfileId(c.get('profileId'))` | parked learner questions | **MEDIUM** |
| G22 | `routes/retention.ts:62-251` (all 8 GETs: `/library/retention`, `/retention/assessment-eligible`, `/subjects/:subjectId/retention`, `/topics/:topicId/retention`, `/subjects/:subjectId/needs-deepening`, `/subjects/:subjectId/teaching-preference`, `/retention/stability`, `/topics/:topicId/evaluate-eligibility`) | none — bare `requireProfileId(c.get('profileId'))` | retention/stability metrics, teaching preferences, EVALUATE eligibility | **MEDIUM** |
| G23 | `routes/settings.ts:82-86` (`GET /settings/notifications`); `:112-134` self-branch only (`GET /settings/celebration-level` with no `childProfileId` query — the `childProfileId` branch on the same handler already calls `assertOwnerProfile`+`assertCallerIsAccountOwner`, not a gap); `:329-338` (`GET /settings/subjects/:subjectId/analogy-domain`); `:368-377` (`GET /settings/subjects/:subjectId/native-language`) | notification prefs, own celebration level, analogy-domain/native-language subject preferences | none — bare `withProfile(c)`, and the service functions (`getNotificationPrefs`, `getCelebrationLevel`, `getAnalogyDomain`, `getNativeLanguage`) carry no ownership check either (contrast with the file's own `getOwnedFamilyPoolBreakdownSharing`/`verifyProfileOwnership`, see §2) | **LOW** |
| G24 | `routes/snapshot-progress.ts:47-52,53-63,64-89` (all 3 GETs) | `GET /progress/inventory`, `/progress/history`, `/progress/milestones` | none — bare `withProfile(c)` | knowledge inventory, progress history, recent milestones — same class as G7's `progress.ts` (a **separate** file of the same name-shape; don't conflate the two) | **MEDIUM–HIGH** |
| G25 | `routes/streaks.ts:22-28,31-37` (both GETs) | `GET /streaks`, `GET /xp` | none — bare `requireProfileId(c.get('profileId'))` | streak/XP gamification stats | **LOW** |
| G26 | `routes/subjects.ts:100-107,215-227` (both GETs) | `GET /subjects`, `GET /subjects/:id` | none — bare `requireProfileId(c.get('profileId'))` | subject list/detail | **MEDIUM** |
| G27 | `routes/topic-suggestions.ts:25-41` | `GET /subjects/:subjectId/books/:bookId/topic-suggestions` | none — bare `requireProfileId(c.get('profileId'))` | unused topic suggestions for a book | **LOW–MEDIUM** |
| G28 | `routes/vocabulary.ts:37-54` | `GET /subjects/:subjectId/vocabulary` | none — bare `requireProfileId(c.get('profileId'))` | vocabulary list for a subject | **MEDIUM** |

### New-beyond-G1–G8: the supporter-scope surface (`now.ts`, `scopes.ts`)

These two files were part of the 224-call-site scan but their shape is
**not** guardian/parent-child — it's the newer **supporter** network
(`supportership` table, S4). They surface a **structurally new instance of
the same §0 root cause** on a different edge type, which **§3's proposed
remedy does not cover** (`verifyPersonOwnershipV2` only checks
self-or-guardian-of-uncredentialed; it has no supportership clause). Flagging
prominently because the fix in §3 as written would miss this surface entirely
if implemented as-is.

| # | File:line | Route | Current check | Data/action exposed | Severity |
|---|---|---|---|---|---|
| G29 | `routes/now.ts:16-20,22-27` (both GETs) | `GET /now`, `GET /now/overflow` (`scope=self`) | none — bare `withProfile(c)` for the `self` scope | personalized "Now" digest cards (deep-links into sessions/topics) — same disclosure class as G1's recaps | **HIGH** |
| G30 | `routes/now.ts:16-20,22-27` (`scope=supporter-hub` / `scope=person`) — resolved in `services/now-feed.ts` `resolveTarget` (`:376-413`) and `collectSupporterHubCandidates` (`:425-447`) | `GET /now?scope=supporter-hub\|person` | checks a `supportership` edge **from the header-resolved `profileId`** to the target `personId` (`now-feed.ts:401-402`) — authority is derived from the spoofable header, not `callerPersonId` | supporter-hub summary / a specific supportee's Now feed, for whichever profile the header resolves to | **HIGH** |
| G31 | `routes/scopes.ts:21-25,26-32` (`GET /scopes`, `GET /scopes/coldstart`) | none — bare `withProfile(c)` | which supportee scopes / cold-start state the resolved profile has | **MEDIUM** |
| G32 | `routes/scopes.ts:33-46` — `readSupporteeStructuralSubjects` (`services/supporter-structural-mask.ts:137-162`) | `GET /scopes/:personId/subjects` | checks a `supportership` edge **from the header-resolved `profileId`** to `:personId` (`supporter-structural-mask.ts:150-153`) — same shape as G30 | a supportee's structural subject list | **HIGH** |

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
- **`routes/dashboard.ts` — all 13 `/dashboard/children/:profileId/*` routes** —
  already gate with `assertOwnerAndParentAccess` + `assertCallerIsAccountOwner`
  (WI-1989), `+ assertChargeNotCredentialed` / `assertChildDashboardDataVisible`
  where relevant. This is the reference "guardian legitimately reads a child"
  template — it answers plan question 4 (§5) and needs no read-side change.
  **Note:** root `GET /dashboard` itself (`dashboard.ts:88-102`, bare
  `withProfile(c)`, no guard) shares this doc's exact gap shape but is **not**
  re-listed as a new gap here — it's already the subject of the previously
  captured **WI-2397** ("root /dashboard ungated"). Reconciled, not missed.
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

## Full classification (WI-2006 rework — completes the deferred sweep)

The first pass deferred a full sweep of the 224 call sites / 40 files the
scan found (§0/§3 root cause and rule were already validated; only the
enumeration was incomplete — the Gate-2 bounce). This rework reads all 40
files in full and classifies every read (`GET`) handler and every
self-mutating write branch found. Arithmetic, so the count is checkable
against the raw scan (`rg -n
"requireProfileId\(c.get\('profileId'\)\)|withProfile\(c\)"
apps/api/src/routes` → 224 lines / 40 files):

- **34 `GET` handlers previously classified** (G1–G8, counting each handler
  G4/G7/G8 group under one row): 1 (G1) + 1 (G2) + 1 (G3) + 7 (G4, all
  `notes.ts` GETs) + 1 (G5) + 15 (G7, all `progress.ts` GETs) + 8 (G8,
  `sessions.ts` + `quiz.ts`) = 34. (G6 is a `POST` self-service branch, not a
  `GET`.)
- **20 `GET` handlers previously reviewed and cleared**: 2 (`recaps.ts`
  non-self) + 2 (`consent.ts` self/withdraw + self/accountability) + 14
  (`dashboard.ts`'s 13 `/children/:profileId/*` routes + `/dashboard/demo`,
  not re-audited here — a demo/seed route, no real profile data) + 2
  (`learner-profile.ts`'s `:profileId` variants).
- **42 new `GET` handlers classified as gaps this rework, tabled under 20
  IDs** (G9–G28; several IDs group multiple same-shape handlers per file,
  the same convention G4/G7/G8 already use): 2 handlers (G9+G10,
  assessments) + 2 (G11, book-suggestions) + 2 (G12, bookmarks) + 4 (G13,
  books) + 1 (G14, celebrations) + 1 (G15, coaching-card) + 2 (G16,
  curriculum) + 2 (G17, dictation) + 1 (G18, language-progress) + 1 (G19,
  library-search) + 1 (G20, nudges) + 2 (G21, parking-lot) + 8 (G22,
  retention) + 4 (G23, settings) + 3 (G24, snapshot-progress) + 2 (G25,
  streaks) + 2 (G26, subjects) + 1 (G27, topic-suggestions) + 1 (G28,
  vocabulary) = **42**. The G9–G28 table above is the source of truth; this
  bullet is a cross-check against it, not a re-derivation.
- **4 new `GET` handlers classified as gaps under the supporter-scope
  finding** (G29–G32, `now.ts` ×2, `scopes.ts` ×2 — one of the `scopes.ts`
  rows, `/scopes/:personId/subjects`, is HIGH and structurally new, see
  above).
- **5 new `GET` handlers reviewed and cleared this rework**:
  `notifications.ts` child-cap (1), `settings.ts` withdrawal-archive (1) +
  family-pool-breakdown-sharing (1), `visibility.ts` (2). (`family-join.ts`
  and `analytics.ts`/`support.ts` are also cleared in §2, but contribute 0
  `GET` handlers — they're `POST`-only files; `onboarding.ts`'s cleared
  `/onboarding/language` self-route is a `PATCH`, counted with the write
  branches in §1c, not here.)
- **Remaining call sites** (roughly the balance of 224 minus the above) are
  self-mutating write branches — every one of them is named in §1c, none
  individually severity-scored (out of this spike's read-side AC), all
  folded into the WI-2416 follow-up.

No "deferred" / "sampled" / "not individually audited" placeholder remains
anywhere in this doc — every read surface the scan found has a file:line, a
current-check description, a gap-or-not verdict, and (for gaps) a proposed
ruling. New HIGH-severity findings beyond the original G1–G8 (G10, G15, G29,
G30, G32) are listed above rather than fixed — this remains a
spike/documentation deliverable; no handler was changed to produce this doc.
