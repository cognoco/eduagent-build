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
| G8 | Sampled: `routes/sessions.ts` (4 GETs), `routes/quiz.ts` (3 GETs) — confirmed same bare-self shape, no owner/guardian guard import present in either file | session/quiz history | **MEDIUM–HIGH**, not individually line-audited | same shape as G4/G7 |

**Proposed ruling — same remedy for G1–G8:** a shared authority check, reusing
existing primitives (§3), applied per-handler (§4) at each of the above. **Not
implemented in this spike** — Cosmo AC forbids handler changes here; each
confirmed gap should become its own (or a batched) follow-up WI, mirroring how
WI-2397/WI-2398 were captured from the WI-1989 sweep.

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
family as WI-2397/WI-2398.

## Scope note (deferred sweep)

Per the source plan's own allowance ("Deferred: a full sweep of every
profile-scoped read route beyond the spike's initial surface, if the spike
scopes the first PR to a subset"), this doc audits 6 route groups to file:line
rigor (recaps, learner-profile, notes, consent, progress, dashboard) and
samples 2 more (sessions, quiz) to confirm the shape generalizes. The
remaining route groups sharing the identical bare
`withProfile(c)`/`requireProfileId(c.get('profileId'))` self-read pattern —
`subjects.ts`, `curriculum.ts`, `books.ts`, `dictation.ts`, `assessments.ts`,
`vocabulary.ts`, `nudges.ts`, `bookmarks.ts`, `snapshot-progress.ts`,
`book-suggestions.ts`, `streaks.ts`, `homework.ts`, `challenge-round.ts`,
`celebrations.ts`, `topic-suggestions.ts`, `speaking-practice.ts`,
`coaching-card.ts`, `language-progress.ts`, `library-search.ts`, `filing.ts`,
`parking-lot.ts`, `notices.ts`, `now.ts`, `scopes.ts`, `support.ts`,
`settings.ts` (non-owner-gated reads), `retention.ts` — were located by
`rg -n "requireProfileId\(c.get\('profileId'\)\)|withProfile\(c\)" apps/api/src/routes`
(224 call sites total across ~40 files) but not individually re-derived to
file:line in this pass. The follow-up implementation WI should sweep these for
the fix's actual blast radius rather than re-litigate reachability — the root
cause and the rule (§3) are already established.
