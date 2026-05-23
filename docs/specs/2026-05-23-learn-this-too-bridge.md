# Learn-this-too Bridge

**Status:** Draft — pending review
**Date:** 2026-05-23
**Related:**
- [`docs/specs/2026-05-21-navigation-contract.md`](./2026-05-21-navigation-contract.md) — defines PR 6c slot and the `topic/relearn` route.
- [`docs/audience-matrix.md`](../audience-matrix.md) — current state of parent/child surfaces.
- `CLAUDE.md` → "Profile Shapes" — Family-mode and parent-native review context.

---

## Decision

Add a one-tap **"Learn this too"** affordance on parent-native child-review surfaces that **clones a topic from the child's curriculum into the adult's own curriculum**. The clone is silent: it adds rows to the adult's subject/book/topic tables but does **not** start a session, does **not** create a `needs_deepening_topics` queue entry, and does **not** notify. The topic appears in the adult's Library the next time they open it.

The bridge is a write into the adult's profile, not a live link to the child's data. Once cloned, the adult's copy is independent: the child can finish, drop, or have their family-link revoked, and the adult's copy stays put.

**Dependency:** this feature is gated on PR 4 of the nav-contract migration shipping `recaps/[recapId]` detail. The Recaps list row is **not** an acceptable trigger surface for V1 — the spec deliberately waits.

Trigger surfaces (post nav-contract PR 4 + PR 6):
- Recaps detail (`recaps/[recapId]`)
- Child curriculum topic detail (`child/[profileId]/curriculum/...` — exact route TBD with PR 5)
- Child session detail (`child/[profileId]/session/[sessionId]`)

The button is **never** shown when the active profile is in proxy mode — proxy mode means "acting as the child," and cloning to the child from itself is nonsense. Per the navigation contract `gates.showLearnThisToo: boolean`, the gate is true only when:
- active profile is adult owner,
- active profile has a non-archived family-link to the source child,
- contract `effectiveAppContext === 'family'`,
- `isParentProxy === false`.

---

## Why This Exists

Parents review their child's learning every day. Today, when a parent sees a topic the child is working on — fractions, photosynthesis, the present perfect — and wants to learn or refresh it themselves, the only path is:

1. Open their own Study profile manually.
2. Search the same subject by name (or create it if missing).
3. Add the topic by hand or trust the AI to surface it.

This is enough friction that it never happens. The product loses an obvious value moment: shared learning between parent and child.

The bridge collapses that path into a single tap from the surface where the parent already is.

**Goal:** a parent reviewing their child's recap or curriculum can clone any topic into their own Study profile in one tap, with the adult immediately landed on the existing `topic/relearn` confirmation screen so they can pick their teaching method and start.

**Non-goal:** any kind of two-way link, shared progress, or "we learned this together" record. The two profiles are independent after the bridge fires.

---

## Inputs and Surfaces

### Child-side read

The bridge needs a parent-scoped read endpoint that returns a copy-ready topic descriptor:

```ts
type ChildTopicSnapshot = {
  childProfileId: string;        // family-link verified server-side
  subjectName: string;           // e.g. "Mathematics"
  subjectLanguage: string;       // ISO code, for adult's clone
  bookTitle: string | null;      // null if topic is not book-anchored
  bookAuthor: string | null;
  topicTitle: string;
  topicDescription: string | null;
  // ageBracket of source learner — used so the cloned topic can be re-framed
  sourceAgeBracket: 'eleven_twelve' | 'thirteen_fifteen' | 'sixteen_plus';
};
```

This is **not** a new schema. It is a projection of existing child topic data, served via a new GET route that runs the same family-link scope check Recaps uses (`getChildrenForParent` ownership), then projects the columns above. No raw topic IDs from the child are exposed beyond what already appears in Recaps.

### Adult-side write — clone-only, no session, no queue

The clone is performed server-side in one transaction. **Critically, the bridge does not call `startRelearn` and does not insert into `needs_deepening_topics` or `learning_sessions`.** Those writes happen later, when the adult opens the cloned topic from Library and goes through the normal teaching-method picker.

1. **Resolve subject.** Match by `(profileId = adultId, lower(name) = lower(snapshot.subjectName), language = snapshot.subjectLanguage, status != 'archived')`. If none, create a new active subject for the adult with the same name and language. Record whether this was newly created.
2. **Resolve book** (if `bookTitle` is non-null). Match by `(subjectId = resolvedSubjectId, lower(title) = lower(snapshot.bookTitle))`. If none, create a new book under the resolved subject. Record whether this was newly created.
3. **Resolve topic.** Match by `(bookId = resolvedBookId OR subjectId = resolvedSubjectId for bookless topics, lower(title) = lower(snapshot.topicTitle))`. If none, create a new topic with the snapshot's title and description. Record whether this was newly created.
4. **Stop.** Do not create a session. Do not enqueue. Do not call `startRelearn`. Return.
5. **Return.** Respond with `{ topicId: resolvedTopicId, subjectId: resolvedSubjectId, alreadyExisted: boolean, createdIds: { topicId?: string, bookId?: string, subjectId?: string } }`. `createdIds` lists only what this call newly created — used by the undo endpoint.

The cloned topic is now a normal topic in the adult's curriculum. The first time the adult opens it (from Library or from the toast's Open action), the existing teaching-method picker on `topic/relearn` runs, the adult picks a method, and the existing `startRelearn` writes the session and queue entry — exactly the path they would follow for any topic they added themselves.

### Adult-side landing — silent + optional toast

On a successful bridge tap, the parent stays on the surface they tapped from. A non-blocking toast appears:

> Added "Photosynthesis" to your Mathematics.
> [Open]   [Undo]

- **Default:** toast auto-dismisses after 5 seconds. Topic remains in adult's curriculum. No navigation.
- **Open:** navigates to `/topic/relearn?topicId=...&source=parent_bridge`. The adult lands on the teaching-method picker; from there it is identical to picking a relearn topic from their own list.
- **Undo:** calls the undo endpoint with `createdIds`, which deletes only the rows this call newly created (topic, then book if newly created, then subject if newly created). Pre-existing rows are never touched.

The `?source=parent_bridge` query param, when the adult uses Open, lets the relearn screen show a subtle one-line header: "Added from {{childName}}'s learning." Decorative only.

---

## Authorization

This is the security-critical part.

1. **Read side.** The child-topic snapshot endpoint must verify, on every call, that the requesting adult has a **non-archived** `family_links` row to the source child. If not → 404 (same shape as existing dashboard child endpoints). Never 403, never reveal whether the topic ID exists.
2. **Write side.** The clone writes only to the adult's profile. Use `createScopedRepository(adultProfileId)` for all writes. `subjects.profileId`, `curriculum_books.subjectId → subjects.profileId`, `curriculum_topics.bookId → curriculum_books.subjectId → subjects.profileId` all enforce ownership.
3. **No child mutation.** The bridge has no write path to the child's data. Reject any request that tries to pass a child profile ID in a write context.
4. **Link revocation.** If the family-link is revoked between the read and the write (race window measured in ms), the write succeeds but no further clones from that child are possible. The cloned topic on the adult side remains — it is the adult's own topic now. **Revocation does not retroactively delete cloned topics.** This is intentional: once an adult chose to learn fractions, the fact that they originally saw it on their child's recap does not give the child or anyone else a right to remove it.
5. **Audit trail.** Log a structured analytics event `learn_this_too.bridge` with `{ adultProfileIdHash, childProfileIdHash, subjectName, topicTitle, isNewSubject, isNewBook, isNewTopic, source: 'recap' | 'child_curriculum' | 'child_session' }`. No raw display names, no birth years, no IDs.

---

## Data Trace Decision

**Do we store `source_child_profile_id` on the cloned topic?**

No.

Reasoning:
- It would create a permanent cross-profile reference that violates the "two profiles are independent after the bridge fires" principle.
- It would force special-case handling on GDPR delete: when the child's profile is deleted, the adult's topic would either need its source nulled out or the row would need updating — extra failure mode for no product value.
- The audit event above already captures the bridge for product analytics; the topic row itself does not need to know its origin.

The only place the origin matters in UX is the one-line "Added from {{childName}}'s learning" header on the first relearn screen, and that is driven by the `?source=parent_bridge` query param at navigation time, not by a stored column. Once the adult starts the session, the origin is forgotten — exactly like any other topic they added.

---

## LLM and Personalization

The cloned topic is treated as adult-authored from the moment it is written:
- `pedagogyMode` is set from the adult's profile.
- `ageBracket` (for prompt selection) is the adult's bracket.
- The topic title and description are stored verbatim from the child snapshot. The LLM re-frames at session time using existing adult prompts — there is no "originally child" flag flowing into prompts.

This means an adult who clones their 11-year-old's "Photosynthesis" topic will get adult-level conceptual depth in the first exchange, even though the child's version of the same topic ran with younger framing. This is the desired outcome — the adult is learning for themselves, not previewing what their child saw.

If the adult wants to preview what their child saw, that is a separate flow (Recaps detail is exactly that).

---

## UI Flow

### Trigger placement (post PR 4 + PR 6)

| Surface | Placement | Copy |
|---|---|---|
| Recaps detail (`recaps/[recapId]`) — **required**; spec blocks on this | Secondary CTA below the recap narrative | "Learn this too" |
| Child curriculum topic detail | Action row alongside "Open in your view" | "Learn this too" |
| Child session detail (`child/[profileId]/session/[sessionId]`) | Action row, below the subject/topic header | "Learn this too" |

### One-tap with undo toast

Tap the button → bridge fires immediately, no modal:

> Added "Photosynthesis" to your Mathematics.
> [Open]   [Undo]

The toast lives for 5 seconds. The parent stays where they were, free to keep reviewing recaps. The cloned topic sits silently in their Library until they choose to engage.

Justification: the bridge does not start a session, queue, or notification — the only effect of a misfire is a topic appearing in the adult's Library. Undo within 5 seconds removes any rows newly created by this call. A modal would add friction for negligible safety gain.

### Already cloned

If the adult has previously cloned the same topic (resolved by the matching rules above), the bridge does not duplicate. Toast copy changes to:

> "Photosynthesis" is already in your Mathematics.
> [Open]

No Undo button is shown — there's nothing to undo, because no rows were newly created.

### Loading and error

- While the mutation is in flight, the button shows a spinner and is disabled. Other surfaces remain interactive.
- On 404 (family-link revoked mid-flow) → toast "This topic is no longer available." No further action.
- On 5xx → toast "Couldn't add this topic. Try again in a moment." Button re-enabled.
- Undo failure (rare; row already gone, network blip) → silent. The toast dismisses; if the row genuinely persisted, the user can delete it manually from Library.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Family-link revoked between read and write | Race condition, ms-scale | 404 toast | Adult re-opens Recaps; child no longer appears in their list |
| Same topic already in adult's curriculum | Repeat tap days apart | Toast switches to "already in your Mathematics" with [Open] only (no Undo) | Tap [Open] to navigate; dismiss to ignore |
| Same topic exists under a *renamed* adult subject | Adult renamed their Math subject to Algebra | Case-insensitive match by name misses; duplicate clone created | Accepted limitation (V1). Manual cleanup via Library. |
| Source child deleted (GDPR) before write | Async deletion mid-flow | 404 toast | Cloned topics already in adult's curriculum are unaffected |
| Adult's subject name conflicts in casing | Case-insensitive match resolves | Topic adds under existing subject | No duplicate subject created |
| Network error on snapshot read | GET fails before tap completes | Trigger button shows inline error state | Retry on next render |
| Bridge fired in proxy mode (defensive) | Contract gate failure or test bug | Button never rendered | Contract `showLearnThisToo === false` in proxy; ratchet test enforces |
| Undo tapped but rows have downstream refs | Edge case if adult somehow already started a session on the clone in <5s | Undo endpoint deletes only newly created topic/book/subject rows; any session row referencing the topic blocks topic delete (FK) → undo fails silently | Adult sees clone persist; can delete manually from Library |
| Cloned topic ignored forever | Adult never opens it from Library | Topic sits as an orphan curriculum row | Same as any adult-added-but-unstarted topic. No special cleanup. |
| Subject language mismatch | Child learns English in `language: 'no-NB'`, adult is `language: 'en-US'` | Subject resolution looks up by `(profileId, name, language)`; creates new adult-language subject if needed | Cloned topic lives under adult's language-specific subject; adult gets adult-language LLM framing |
| Toast missed (auto-dismissed before user noticed) | Slow tap, distracted user | Topic silently in Library | No notification — but topic is in the right place; same outcome as if user successfully undismissed |

---

## Schema Impact

**None on shipping tables.** This is a pure write-into-existing-tables feature:
- `subjects` — may insert one row per new (adult, name, language) tuple
- `curriculum_books` — may insert one row per new (subject, title) tuple
- `curriculum_topics` — may insert one row per new (book/subject, title) tuple
- `needs_deepening_topics` — **not written by the bridge.** Only written later when the adult goes through the normal `topic/relearn` teaching-method picker and `startRelearn` fires as it does today.
- `learning_sessions` — **not written by the bridge.** Same as above.
- `curriculum_topic_source` enum — **add `'parent_bridge'` value if absent** (verify in `subjects.ts` line 33; if the enum already covers it, skip).

If the enum needs the new value, that is a single drizzle migration:

```sql
ALTER TYPE curriculum_topic_source ADD VALUE IF NOT EXISTS 'parent_bridge';
```

Migration is forward-only. No rollback required (Postgres does not support removing enum values cleanly, and there is no data loss risk from leaving the value in place).

---

## API Surface

Three new routes, all under existing route groups:

### `GET /dashboard/children/:childProfileId/topics/:topicId/snapshot`

- Requires authenticated adult profile.
- Verifies family-link ownership via existing `getChildrenForParent` logic.
- Returns `ChildTopicSnapshot` or 404.
- Read-only.

### `POST /curriculum/clone-from-child`

- Body: `{ childProfileId: string, topicId: string }` (the child's topic ID, used by the server to fetch the snapshot then perform resolve-or-create).
- Verifies family-link.
- Performs the resolve-or-create transaction described in "Adult-side write."
- **Does not** call `startRelearn`. **Does not** create a session or queue entry.
- Returns `{ topicId, subjectId, alreadyExisted: boolean, createdIds: { topicId?: string, bookId?: string, subjectId?: string } }`.

Route placement note: this is curriculum-mutation (write subject/book/topic), not retention-mutation (queue entries / sessions). It belongs under a curriculum route, not under `retention.ts`. If a `curriculum.ts` route file does not exist yet, create it; otherwise add this endpoint there.

### `DELETE /curriculum/clone-from-child/undo`

- Body: `{ createdIds: { topicId?: string, bookId?: string, subjectId?: string } }`.
- Verifies each ID belongs to the requesting adult (via `createScopedRepository`).
- Deletes in order: topic, then book (if newly created), then subject (if newly created).
- Aborts with no-op on any FK violation — meaning the row has already been used (e.g. a session was created on it). This is intentional: undo is best-effort within seconds of the clone; once the topic is in active use, manual cleanup is the path.
- Returns `{ deleted: { topic: boolean, book: boolean, subject: boolean } }`.

---

## Mobile Implementation

### New hook

`apps/mobile/src/hooks/use-clone-from-child.ts`:

```ts
export function useCloneFromChild(): {
  cloneFromChild: (args: { childProfileId: string; topicId: string }) => void;
  undoLastClone: (createdIds: CreatedIds) => void;
  isCloning: boolean;
  isCloningFor: (topicId: string) => boolean; // for per-button spinner state
};
```

Backed by `useMutation` from React Query. On success, shows the toast with [Open] and [Undo] actions (if any rows were newly created). Does **not** navigate automatically — the parent stays where they were.

### New component

`apps/mobile/src/components/family/LearnThisTooButton.tsx`:

```ts
type Props = {
  childProfileId: string;
  topicId: string;
  topicTitle: string;
  childDisplayName: string;
};
```

Renders the trigger button + confirmation modal. Reads `useNavigationContract().gates.showLearnThisToo` and returns `null` if false.

### Contract gate

`apps/mobile/src/lib/navigation-contract.ts`:

```ts
gates: {
  // ...existing gates...
  showLearnThisToo: boolean;
};
```

Set true when:

```ts
ctx.role === 'owner'
  && ctx.activeProfile?.hasFamilyLinks === true
  && effectiveAppContext === 'family'
  && ctx.isParentProxy === false
```

Add a matrix row to `navigation-contract.test.ts` covering each precondition.

### Test coverage

- `use-clone-from-child.test.ts` — mutation lifecycle, navigation on success, error toasts.
- `LearnThisTooButton.test.tsx` — gate respected, modal copy switches on `alreadyExisted`, disabled-while-cloning.
- `navigation-contract.test.ts` — `showLearnThisToo` matrix rows.
- API: `retention.test.ts` adds clone-from-child route — family-link enforcement, IDOR rejection, resolve-or-create idempotency, `alreadyExisted: true` path.
- Integration: `tests/integration/family-bridge.integration.test.ts` — full path with real DB, two profiles linked, end-to-end clone + verify adult's curriculum.

---

## Implementation Sequence

### Step 0 — Prerequisite (not part of this PR)

- **Nav-contract PR 4 ships `recaps/[recapId]` detail route.** This bridge is blocked on that.

### Step 1 — Server

- Add `GET /dashboard/children/:childProfileId/topics/:topicId/snapshot` route + service.
- Add `POST /curriculum/clone-from-child` route + service (clone-only; no `startRelearn`).
- Add `DELETE /curriculum/clone-from-child/undo` route + service.
- Add enum value `parent_bridge` if needed.
- Integration test: end-to-end clone with two linked profiles. Verify no `learning_sessions` / `needs_deepening_topics` rows created by the bridge.
- Integration test: undo deletes only newly created rows; pre-existing subject/book stay.

### Step 2 — Contract gate

- Add `showLearnThisToo` to `NavigationContract.gates`.
- Update `resolveNavigationContract` and tests.
- No mobile UI yet.

### Step 3 — Mobile component + hook

- `useCloneFromChild`.
- `LearnThisTooButton`.
- Unit tests.

### Step 4 — Wire to surfaces

- Recaps detail screen — required. Spec is blocked on this.
- Child curriculum topic detail.
- Child session detail.

### Step 5 — Analytics event

- Wire `learn_this_too.bridge` event in the mutation `onSuccess`.

### Step 6 — E2E

- Maestro flow: parent opens Recaps → taps Learn this too → confirms → lands on relearn → can start session.

---

## Out of Scope

- Two-way sync between adult and child progress.
- Sharing the adult's own session recap back to the child.
- Bulk clone ("learn everything my child is learning").
- Clone from another adult's profile (parent-to-parent or co-parent sharing) — would require a different authorization model.
- Web shell. Mobile-only for V1.
- LLM bridge that re-explains the topic at the child's level for the adult; the adult always gets adult-level framing.

---

## Resolved Decisions

1. **Recaps detail dependency.** Block this spec on nav-contract PR 4 shipping `recaps/[recapId]`. No fallback to the Recaps list row.
2. **Already-cloned detection across renames.** Accept the rename-edge-case duplicate (V1). Do not store origin in a column — that would violate the "two profiles are independent after the bridge fires" principle.
3. **One-tap vs modal.** One-tap with undo toast — conditional on the bridge being a clone-only write (no `startRelearn`, no session, no queue). The only effect of a misfire is a topic appearing in Library; Undo within 5s removes any newly created rows.

## Out Of Spec — Defer

- Visual design of the toast (existing toast component is fine).
- Telemetry beyond the `learn_this_too.bridge` event (e.g. conversion to first session, retention impact). Add when data needs grow.
