# Learn-this-too Bridge

**Status:** Draft v3 — second adversarial review pass
**Date:** 2026-05-23
**Related:**
- [`docs/specs/2026-05-21-navigation-contract.md`](./2026-05-21-navigation-contract.md) — defines PR 6c slot and the `topic/relearn` route.
- [`docs/compliance/audience-matrix.md`](../../../compliance/audience-matrix.md) — current state of parent/child surfaces.
- `CLAUDE.md` → "Profile Shapes" — Family-mode and parent-native review context.

---

## Revisions

**v3 (2026-05-23) — second adversarial review pass.** Findings addressed (citations to current code, not memory):

- **C1-v3** — `returnTo` cannot pass arbitrary paths through `homeHrefForReturnTo` (`apps/mobile/src/lib/navigation.ts:18-26` is a closed token mapper). Spec now defines `FAMILY_RECAPS_RETURN_TO` / `FAMILY_CHILD_RETURN_TO` tokens (coordinate with the matching plan entry in `docs/plans/2026-05-19-study-and-family-mode-navigation-FULL.md:2863-2880`) and threads the source `recapId` / `childProfileId` as separate URL params so the helper can reconstruct the deep href.
- **C2-v3** — Snapshot DTO and clone path updated to satisfy all NOT-NULL columns on `curriculum_topics` (`packages/database/src/schema/subjects.ts:156-209`): `curriculumId`, `bookId`, `sortOrder`, `description`, `estimatedMinutes` are all set. Bookless branch removed — all child topics already carry a `bookId`. Spec now describes resolve-or-create for `curricula` v1.
- **C3-v3** — Subject dedup matches the actual unique index `subjects_profile_name_lower_active_uq` on `(profile_id, lower(name)) WHERE status='active'` (`subjects.ts:78-86`). `language_code` is set lazily when null on first clone and is **not** part of the dedup tuple.
- **C4-v3** — Resolve-or-create uses `INSERT ... ON CONFLICT (...) DO NOTHING RETURNING id` against the existing unique indexes (`curriculum_books_subject_title_lower_uq`, `curriculum_topics_book_title_lower_uq`); a missed RETURNING re-selects. Burst sibling-tap races are now safe.
- **C5-v3** — Topic INSERT explicitly sets `source = 'parent_bridge'`. A test asserts it.
- **H1-v3** — Column name corrected: `profiles.conversationLanguage` (`packages/database/src/schema/profiles.ts:72`), not `primaryLanguage`.
- **H2-v3** — Ownership gate uses `assertParentAccess(db, parentId, childId)` from `apps/api/src/services/family-access.ts:45-53` (not `getChildrenForParent`). Route wraps the thrown `ForbiddenError` into `notFound('Topic')` to preserve the spec's 404 IDOR contract.
- **H3-v3** — Dropped the "non-archived family-link" predicate. `family_links` has no status/archived column today (`packages/database/src/schema/profiles.ts:193-220`); revocation is row deletion. If a soft-archive column is added later, extend `assertParentAccess` in that PR, not this one.
- **H4-v3** — `startRelearn` already upserts the `needs_deepening_topics` row and creates the session (`apps/api/src/services/retention-data.ts:931-990`). §Relearn Screen Adjustments §1 rewritten as a regression-test task, not an open risk.
- **H5-v3** — Dropped the collapsing-counter toast variant. V1 = single visible toast, latest wins. Counter pattern deferred to a follow-up since no existing toast component supports it.
- **H6-v3** — Internal name standardised: analytics event `add_to_my_learning.bridge`, AsyncStorage key `add_to_my_learning.tip_seen`. Matches the H5 display copy.
- **M2-v3** — Provenance chip when origin is null: **omit** (no "previous family member" copy).
- **M3-v3** — Undo deletes the topic only. Empty book/subject containers stay — they're harmless and avoid the orphan-check race.
- **M4-v3** — Subject-rename limitation links to the Library delete-topic flow so the cleanup path is actually discoverable.
- **M5-v3** — Clone endpoint accepts a client-generated `requestId` for idempotency; server dedups by `(adultProfileId, childProfileId, sourceTopicId, requestId)` for 60s to absorb retries.
- **L1-v3** — Route paths use Expo Router form `(app)/topic/relearn`.

**v2 (2026-05-23) — first adversarial review pass.** Findings addressed:

- **C1, C2** — Open URL now carries `subjectId` + `returnTo` and lands on a new "fresh-topic" mode of the relearn screen (no `needs_deepening_topics` row required). New section *Relearn Screen Adjustments* spells out the relearn-side change.
- **H1** — Added `source_child_profile_id` column (nullable, `ON DELETE SET NULL`) on `curriculum_topics`. Origin is now recoverable from Library, not only at first navigation.
- **H2** — Subject language now resolves to the **adult's** primary language, not the child's. Topic title and description stay verbatim from the snapshot.
- **H3** — Toast for already-existing topic now offers `[Add separate copy]` so semantically different topics (same name) don't silently merge.
- **H4** — Undo failure when a session already started is now an explicit toast with a link to Library.
- **H5** — Trigger copy locked to **"Add to my learning"**. "Learn this too" was ambiguous and read as joint learning.
- **H6** — `returnTo` threaded from each trigger surface so device-back returns the parent to where they were reviewing.
- **M2** — On already-existing topic, the bridge refreshes the topic description from the child's latest snapshot (the adult's curriculum row tracks the child's evolving framing while the topic is unstarted).
- **M3** — Already-cloned toast now reflects topic state (`unstarted`, `in_progress`, `completed`).
- **M4** — Toast stacking specified: last-wins with a max of one visible toast; older toasts collapse into a one-line counter.
- **M5** — Library shows a "Recently added" badge for 24h on freshly cloned topics and inserts them at the top of their subject section.
- **M6** — Analytics event records all bridge taps; multi-child attribution preserved across taps even when `alreadyExisted: true`.
- **M7** — First-run inline tip on Recaps detail introduces the feature on first eligible view.
- **M8** — Trigger button caption adds "Private to your learning" affordance.

---

## Decision

Add a one-tap **"Add to my learning"** affordance on parent-native child-review surfaces that **clones a topic from the child's curriculum into the adult's own curriculum**. The clone is silent: it adds rows to the adult's subject/book/topic tables but does **not** start a session, does **not** create a `needs_deepening_topics` queue entry, and does **not** notify. The topic appears in the adult's Library the next time they open it, with a "Recently added" badge for 24h.

The bridge is a write into the adult's profile, not a live link to the child's data. Once cloned, the adult's copy is independent: the child can finish, drop, or have their family-link revoked, and the adult's copy stays put. The cloned topic retains a nullable pointer back to the source child profile (`source_child_profile_id`) for in-app provenance display; this column is `ON DELETE SET NULL` so child deletion does not orphan the adult's data.

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

**Goal:** a parent reviewing their child's recap or curriculum can clone any topic into their own Study profile in one tap, with the adult immediately able to land on the existing `topic/relearn` confirmation screen (in a new fresh-topic mode) so they can pick their teaching method and start.

**Non-goal:** any kind of two-way link, shared progress, or "we learned this together" record. The two profiles are independent after the bridge fires (with one nullable backpointer column for provenance display only — not behavior).

---

## Inputs and Surfaces

### Child-side read

The bridge needs a parent-scoped read endpoint that returns a copy-ready topic descriptor:

```ts
type ChildTopicSnapshot = {
  childProfileId: string;        // family-link verified server-side
  childDisplayName: string;      // for toast + Library provenance copy
  subjectName: string;           // e.g. "Mathematics"
  subjectLanguage: string | null;// ISO code of subject in CHILD's curriculum (informational only; child's subjects.languageCode is nullable)
  bookTitle: string;             // REQUIRED — curriculum_topics.bookId is NOT NULL in schema
  bookAuthor: string | null;
  topicTitle: string;
  topicDescription: string;      // REQUIRED — curriculum_topics.description is NOT NULL in schema
  topicDescriptionHash: string;  // sha256 of (title + description); used to detect semantic divergence on already-existing match
  estimatedMinutes: number;      // REQUIRED — curriculum_topics.estimatedMinutes is NOT NULL in schema; copied verbatim from child topic
  sourceAgeBracket: 'eleven_twelve' | 'thirteen_fifteen' | 'sixteen_plus';
};
```

This is **not** a new schema. It is a projection of existing child topic data, served via a new GET route that runs the family-link ownership check via `assertParentAccess(db, parentId, childId)` (`apps/api/src/services/family-access.ts:45-53`) and converts the thrown `ForbiddenError` to `notFound('Topic')` so the response shape never reveals whether the topic ID exists. No raw topic IDs from the child are exposed beyond what already appears in Recaps.

### Adult-side write — clone-only, no session, no queue

The clone is performed server-side in one transaction. **Critically, the bridge does not call `startRelearn` and does not insert into `needs_deepening_topics` or `learning_sessions`.** Those writes happen later, when the adult opens the cloned topic from Library and goes through the relearn fresh-topic mode (see *Relearn Screen Adjustments* below).

All inserts use `INSERT ... ON CONFLICT (...) DO NOTHING RETURNING id` against the unique indexes that already exist in the schema (`subjects_profile_name_lower_active_uq`, `curriculum_books_subject_title_lower_uq`, `curriculum_topics_book_title_lower_uq` — all in `packages/database/src/schema/subjects.ts` with raw-SQL migration source 0043/0044). If `RETURNING id` is empty because another transaction won the race, re-`SELECT` by the unique key. This makes burst sibling-tap races safe end-to-end.

1. **Resolve subject language.** Subject identity in the adult's curriculum is **language-agnostic by name** — the active unique index is `(profile_id, lower(name)) WHERE status='active'` with no `language_code` column (`subjects.ts:78-86`). The adult's `conversationLanguage` (`packages/database/src/schema/profiles.ts:72` — that is the real column name, not `primaryLanguage`) is used only to populate `subjects.languageCode` when a new subject is created OR when an existing matched subject has `languageCode = NULL`. We do not match on language; we never overwrite a non-null `languageCode`. `snapshot.subjectLanguage` is informational only (carried for analytics and the "Subject Language" failure-mode disambiguation row).
2. **Resolve subject.** Match by `(profileId = adultId, lower(name) = lower(snapshot.subjectName), status = 'active')`. If none, `INSERT ... ON CONFLICT (profile_id, lower(name)) WHERE status='active' DO NOTHING RETURNING id`; on empty RETURNING re-select. New subjects are created with `languageCode = adult.conversationLanguage` and `pedagogyMode` from the adult's profile default. Record whether this was newly created.
3. **Resolve curriculum.** Match by `(subjectId = resolvedSubjectId, version = 1)`. If none, `INSERT ... RETURNING id` (no unique-index conflict possible — subjects always start with curriculum v1 today). Record whether this was newly created.
4. **Resolve book.** Match by `(subjectId = resolvedSubjectId, lower(title) = lower(snapshot.bookTitle))`. If none, `INSERT ... ON CONFLICT (subject_id, lower(title)) DO NOTHING RETURNING id`; on empty RETURNING re-select. `sortOrder = COALESCE(max(existing.sort_order), 0) + 1` over books in the resolved subject. Record whether this was newly created.
5. **Resolve topic.** Match by `(bookId = resolvedBookId, lower(title) = lower(snapshot.topicTitle))`.
   - If no match → `INSERT ... ON CONFLICT (book_id, lower(title)) DO NOTHING RETURNING id` with:
     - `curriculumId = resolvedCurriculumId`
     - `bookId = resolvedBookId`
     - `title = snapshot.topicTitle`
     - `description = snapshot.topicDescription`
     - `estimatedMinutes = snapshot.estimatedMinutes`
     - `sortOrder = COALESCE(max(existing.sort_order), 0) + 1` over topics in the resolved book
     - `source = 'parent_bridge'` (requires the enum value added by migration — see §Schema Impact)
     - `source_child_profile_id = snapshot.childProfileId`
     - `filedFrom` and `relevance` use their column defaults (`pre_generated`, `core`).
     On empty RETURNING re-select and fall through to the match branch below. Record as newly created.
   - If match found AND `existingTopic.descriptionHash === snapshot.topicDescriptionHash` → return existing topic. No write. (`alreadyExisted: true, descriptionDivergent: false`.)
   - If match found AND `existingTopic.descriptionHash !== snapshot.topicDescriptionHash`:
     - If the existing topic is **unstarted** (no `learning_sessions` row, no `needs_deepening_topics` row) → **refresh description** from the snapshot, keep the row. (`alreadyExisted: true, descriptionRefreshed: true`.) This addresses M2: adult's clone tracks the child's evolving framing while still unused.
     - If the existing topic has been started → do not refresh. Return existing. (`alreadyExisted: true, descriptionDivergent: true`.) The toast offers `[Add separate copy]` (see UI Flow).
6. **Stop.** Do not create a session. Do not enqueue. Do not call `startRelearn`. Return.
7. **Return.** Respond with:

```ts
{
  topicId: string;
  subjectId: string;
  alreadyExisted: boolean;
  descriptionDivergent: boolean;        // true if name matched but description differs and topic is in_progress/completed
  descriptionRefreshed: boolean;        // true if name matched, description differed, and we refreshed (unstarted case)
  topicState: 'unstarted' | 'in_progress' | 'completed';  // for toast copy
  createdIds: { topicId?: string; bookId?: string; subjectId?: string };  // only IDs newly created
}
```

The cloned topic is now a normal topic in the adult's curriculum. The first time the adult opens it (from Library or from the toast's Open action), the relearn fresh-topic mode runs, the adult picks a method, and `startRelearn` writes the session and queue entry — the same outcome as picking a relearn topic from their own list.

### Adult-side landing — silent + optional toast

On a successful bridge tap, the parent stays on the surface they tapped from. A non-blocking toast appears whose content depends on the response:

**Newly cloned:**
> Added "Photosynthesis" to your Mathematics. *Private to your learning.*
> [Open]   [Undo]

**Already existed, same description, unstarted:**
> "Photosynthesis" is already in your Mathematics.
> [Open]

**Already existed, description refreshed (unstarted, child's framing changed):**
> Updated "Photosynthesis" in your Mathematics with their latest version.
> [Open]

**Already existed, description divergent, in_progress or completed:**
> "Photosynthesis" is already in your Mathematics — but their version reads differently.
> [Open my copy]   [Add separate copy]

**Already existed, in_progress:**
> "Photosynthesis" is in your Mathematics — you're working on it.
> [Resume]

**Already existed, completed:**
> You've already learned "Photosynthesis".
> [Review]

Behavior:
- **Default:** toast auto-dismisses after 5 seconds.
- **Open / Open my copy / Resume / Review:** navigates to the appropriate destination; see *Relearn Screen Adjustments* below for `Open` URL params.
- **Undo:** calls the undo endpoint with `createdIds`. Only newly created rows are deleted; pre-existing rows are never touched.
- **Add separate copy:** calls the clone API with `forceCopy: true`; bridge creates a new topic with title `"{topicTitle} (copy)"` regardless of name match (or `"{topicTitle} (copy) 2"`, `"{topicTitle} (copy) 3"`, etc. on collision with prior force-copies). The child's display name is **not** embedded in the persisted title — `source_child_profile_id` already drives the live "From {child}" chip via `<TopicProvenance>` at render time, and storing the name inline would survive child-profile deletion (FK is `ON DELETE SET NULL`) and leak PII into any future export/analytics path. Disambiguates false-positive merges (H3).

**Toast stacking (M4, simplified for V1):** at most one visible toast at a time, latest wins. If a new bridge fires while a prior toast is showing, the prior toast is replaced. The collapsing counter pattern ("Plus N more added — tap to see") is deferred — no existing toast component supports it, and building it is out of scope for V1.

The destination URL when the adult uses Open is described in detail under *Relearn Screen Adjustments*.

---

## Authorization

This is the security-critical part.

1. **Read side.** The child-topic snapshot endpoint must verify, on every call, that the requesting adult has a `family_links` row to the source child. Use `assertParentAccess(db, adultProfileId, childProfileId)` from `apps/api/src/services/family-access.ts:45-53`. The helper throws `ForbiddenError`; the route catches it and re-throws `notFound('Topic')` so the response is **404** — never 403, never reveal whether the topic ID exists. *Note:* `family_links` has no status/archived column today (`packages/database/src/schema/profiles.ts:193-220`); revocation is row deletion. If a soft-archive column is added later, extend `assertParentAccess` in that PR.
2. **Write side.** The clone writes only to the adult's profile. Use `createScopedRepository(adultProfileId)` for all writes. `subjects.profileId`, `curriculum_books.subjectId → subjects.profileId`, `curriculum_topics.bookId → curriculum_books.subjectId → subjects.profileId` all enforce ownership.
3. **No child mutation.** The bridge has no write path to the child's data. Reject any request that tries to pass a child profile ID in a write context.
4. **Link revocation.** If the family-link is revoked between the read and the write (race window measured in ms), the write succeeds but no further clones from that child are possible. The cloned topic on the adult side remains — it is the adult's own topic now. **Revocation does not retroactively delete cloned topics.** This is intentional: once an adult chose to learn fractions, the fact that they originally saw it on their child's recap does not give the child or anyone else a right to remove it.
5. **GDPR delete of child.** `source_child_profile_id` is `ON DELETE SET NULL`. When a child profile is deleted, the adult's cloned topic row remains but its origin reference becomes null. Library provenance chip is **omitted** when the column is null — no "previous family member" copy, which reads awkward and rare. No data loss for the adult; no child reference left behind.
6. **Audit trail.** Log a structured analytics event `add_to_my_learning.bridge` with `{ adultProfileHash, childProfileHash, triggerSurface: 'recaps_detail' | 'child_curriculum_detail' | 'child_session_detail' | 'family_progress' | 'family_child', alreadyExisted, descriptionDivergent, descriptionRefreshed, topicState, forceCopy }`. No raw display names, no IDs, no birth years, no subject/topic names. The `triggerSurface` union is owned by `apps/mobile/src/hooks/use-clone-from-child.ts` (`BridgeTriggerSurface`) and is the source of truth — adding a new entry surface must extend that union, not this spec. **Every tap emits an event, even repeated taps on the same topic** — this preserves multi-child attribution (M6) when the same topic is later seen on a sibling's recap. The server may dedup by `(adultProfileId, childProfileId, sourceTopicId, requestId)` over a 60-second window so natural network retries do not double-count; that dedup is server-side and `requestId` is not included in the emitted event payload.

---

## Data Trace Decision (revised v2)

**Do we store `source_child_profile_id` on the cloned topic?**

**Yes — as a nullable column with `ON DELETE SET NULL`.**

Reasoning (revised, addressing H1):
- Without the column, a parent who misses the 5-second toast has no way to learn where a topic in their Library came from. They see "Photosynthesis" they don't remember adding. The original v1 spec acknowledged this as accepted, but the cost is high: mystery topics erode trust in the Library surface.
- GDPR concern (child profile deletion) is solved cleanly by `ON DELETE SET NULL` — child deletion does not orphan, does not require special migration logic, and does not require nulling out via a job. The constraint does it automatically.
- The principle "two profiles are independent after the bridge fires" remains true behaviorally — the adult's topic is not driven by the child's data after creation. The backpointer is provenance metadata for *display*, not a runtime dependency.
- The column also powers the "Recently added" badge (M5), the Library provenance chip ("Added from {{childName}}"), and clean multi-child attribution.

What the column does **not** do:
- Does not propagate child progress to the adult.
- Does not refresh the topic when the child's version changes (M2 refresh logic is a one-time read at clone-or-re-clone, not a subscription).
- Does not gate any feature for the adult.

The column is informational. Behavior remains decoupled.

---

## LLM and Personalization

The cloned topic is treated as adult-authored from the moment it is written:
- `pedagogyMode` is set from the adult's profile.
- `ageBracket` (for prompt selection) is the adult's bracket.
- The topic title and description are stored verbatim from the child snapshot (or refreshed on re-clone of an unstarted topic, per M2). The LLM re-frames at session time using existing adult prompts — there is no "originally child" flag flowing into prompts.
- The adult's `subjects.languageCode` is populated from `profiles.conversationLanguage` when creating a new subject (or filling in a null `languageCode` on a matched existing subject). The topic title remains in whatever language it was authored in (typically the school's instruction language) — parents are expected to recognize "Photosynthesis" or "Pythagorean Theorem" even if it doesn't match their UI language. The LLM teaching language at session time follows the resolved subject's `languageCode`.

This means an adult who clones their 11-year-old's "Photosynthesis" topic will get adult-level conceptual depth in the first exchange, taught in the adult's primary language, even though the child's version of the same topic ran with younger framing in possibly a different language. This is the desired outcome — the adult is learning for themselves.

If the adult wants to preview what their child saw, that is a separate flow (Recaps detail is exactly that).

---

## UI Flow

### Trigger placement (post PR 4 + PR 6)

| Surface | Placement | Copy | Caption |
|---|---|---|---|
| Recaps detail (`recaps/[recapId]`) — **required**; spec blocks on this | Secondary CTA below the recap narrative | "Add to my learning" | "Private to your learning" |
| Child curriculum topic detail | Action row alongside "Open in your view" | "Add to my learning" | "Private to your learning" |
| Child session detail (`child/[profileId]/session/[sessionId]`) | Action row, below the subject/topic header | "Add to my learning" | "Private to your learning" |

**Copy rationale (H5):** "Learn this too" was ambiguous — it read as joint/co-learning or preview, neither of which match the actual behavior (silent clone into private adult profile). "Add to my learning" is unambiguously a clone-to-self action. The "Private to your learning" caption (M8) addresses the parent's implicit question "does my child see this?"

**First-run tip (M6/M7):** the first time an eligible parent lands on Recaps detail, a small inline tooltip appears next to the CTA: *"Tap to add this topic to your own learning, privately."* Dismisses on tap or after 6 seconds. State persisted in `AsyncStorage` key `add_to_my_learning.tip_seen`. Shows once per profile.

### One-tap with undo toast

Tap the button → bridge fires immediately, no modal. Button shows spinner and is disabled while in flight (other surfaces remain interactive).

Toast variants are listed in *Adult-side landing* above. The base case:

> Added "Photosynthesis" to your Mathematics. *Private to your learning.*
> [Open]   [Undo]

The toast lives for 5 seconds. The parent stays where they were, free to keep reviewing recaps. The cloned topic sits in their Library with a "Recently added" badge for 24h (M5).

Justification: the bridge does not start a session, queue, or notification — the only effect of a misfire is a topic appearing in the adult's Library. Undo within 5 seconds removes any rows newly created by this call. A modal would add friction for negligible safety gain.

### Already cloned — multiple sub-cases

See *Adult-side landing* for the full toast variant table. Key behavioral guarantees:

- **Unstarted + description matches:** no-op write, soft toast with `[Open]`.
- **Unstarted + description diverged:** description **refreshed** from snapshot; toast indicates update.
- **Started + description diverged:** **NOT refreshed**; toast offers `[Add separate copy]` so the parent can choose whether the names refer to the same concept (H3 false-positive merge mitigation).
- **In progress / completed:** appropriate verbs ("Resume" / "Review").

### Loading and error

- While the mutation is in flight, the button shows a spinner and is disabled. Other surfaces remain interactive.
- On 404 (family-link revoked mid-flow) → toast "This topic is no longer available." No further action.
- On 5xx → toast "Couldn't add this topic. Try again in a moment." Button re-enabled.
- **Undo failure when topic has been started (H4)** → toast: "Couldn't undo — you've already opened this topic. [Remove in Library]". Tapping the link navigates to the Library row.
- Undo failure for any other reason (network blip, row already gone) → silent. Topic stays.

### Open / Library navigation (H6 returnTo)

The Open action navigates to `(app)/topic/relearn` in a new fresh-topic mode (see *Relearn Screen Adjustments*). The URL is:

```
/(app)/topic/relearn?topicId={topicId}&subjectId={subjectId}&topicName={encodedTitle}&subjectName={encodedSubjectName}&returnTo={tokenName}&returnId={contextId}&source=parent_bridge
```

- `topicId`, `subjectId`, `topicName`, `subjectName` — already supported by `relearn.tsx:123-133`.
- `returnTo` + `returnId` — **`homeHrefForReturnTo` today is a closed token mapper** (`apps/mobile/src/lib/navigation.ts:18-26`) that only knows `own-learning`, `learner-home`, `practice`; any other value falls through to `/(app)/home`. To return the parent to their actual review surface, this PR adds two new tokens — `family-recaps` and `family-child` — and extends the helper to reconstruct the deep href from `returnId`:
  - `returnTo=family-recaps` + `returnId=<recapId>` → `(app)/recaps/[recapId]`
  - `returnTo=family-child` + `returnId=<childProfileId>` → `(app)/child/[profileId]`
  Coordinate with the matching token entries in `docs/plans/2026-05-19-study-and-family-mode-navigation-FULL.md:2863-2880` so the navigation-contract plan and this spec land non-conflicting token sets.
- `source=parent_bridge` — drives the one-line provenance header on the relearn screen.

---

## Relearn Screen Adjustments

The existing `topic/relearn.tsx` is the "pick an overdue topic and pick a method" surface. Its data source (`useOverdueTopics` at line 138) only knows about topics in `needs_deepening_topics`. Because the bridge deliberately does not enqueue, the cloned topic is not in that data set. The screen's existing `directEntry` path (line 136) does already skip the overdue picker and jump to method selection when both `topicId` and `subjectId` are passed — but the underlying `startRelearn` call may assume the topic is queueable.

**Required relearn changes (must be in same PR as bridge):**

1. **Regression test only — `startRelearn` already upserts the queue row.** `apps/api/src/services/retention-data.ts:931-972` checks for an active `needs_deepening_topics` row, inserts one if none exists, then unconditionally creates a `learning_sessions` row. The cloned-but-not-queued topic path therefore already works. **Required:** add an integration test that exercises the fresh-topic case explicitly — clone via bridge → call startRelearn → verify session created and `needs_deepening_topics` row written — to lock current behavior against future regression.
2. **Empty-state copy guard.** In `directEntry` mode, the screen must never fall through to the picker if `useOverdueTopics` returns empty — it must go straight to the method phase. Audit `relearn.tsx:179-206` (the `useEffect` that sets `phase`) — it currently respects `directEntry`, but add a test that this is preserved if a future refactor changes the effect.
3. **Provenance header (decorative).** When `source=parent_bridge` is in the URL params, render a one-line header above the method picker: "Added from {{childName}}'s learning." `childName` is looked up by reading `source_child_profile_id` on the topic and resolving the family-link display name. If the source has been deleted (column null), show "Added from a child's learning" or omit.
4. **Back navigation respects `returnTo`.** Already implemented at `relearn.tsx:208-215` — confirm via test that the bridge's `returnTo` survives the round trip (parent reading recap → bridge → relearn → method picked → returns to recap, not to home).

**Out of scope for this spec:** the relearn screen's existing copy ("Pick a topic that feels the shakiest right now") only renders in the picker phase, which fresh-topic mode skips. No copy changes needed.

---

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| Family-link revoked between read and write | Race condition, ms-scale | 404 toast "This topic is no longer available." | Adult re-opens Recaps; child no longer appears in their list |
| Same topic already in adult's curriculum, same description, unstarted | Repeat tap, no semantic change | Toast: "'X' is already in your Mathematics. [Open]" | Tap [Open] or dismiss |
| Same topic already in adult's curriculum, description diverged, unstarted | Child's framing has matured; adult hasn't started | Toast: "Updated 'X' in your Mathematics with their latest version. [Open]"; description refreshed silently | None needed |
| Same topic already in adult's curriculum, description diverged, started | Adult mid-learning when child's version changes, OR false-positive name match | Toast: "'X' is already in your Mathematics — but their version reads differently. [Open my copy] [Add separate copy]" | Adult chooses: keep their progress, OR create disambiguated copy `"X (copy)"` (`"X (copy) 2"` on collision). Provenance is preserved via `source_child_profile_id`, not the title string. |
| Topic in progress | Adult started days ago | Toast: "'X' is in your Mathematics — you're working on it. [Resume]" | Tap Resume to continue |
| Topic completed | Adult finished previously | Toast: "You've already learned 'X'. [Review]" | Tap Review for results / re-take |
| Same topic exists under a *renamed* adult subject | Adult renamed Math → Algebra | Case-insensitive match misses; duplicate clone created | Accepted limitation (V1). Manual cleanup via Library's topic-delete flow (`apps/mobile/src/app/(app)/library/...` — verify the exact path at implementation time and link from the toast's empty state). |
| Source child deleted (GDPR) before write | Async deletion mid-flow | 404 toast | Cloned topics already in adult's curriculum are unaffected; their `source_child_profile_id` becomes null via FK cascade |
| Source child deleted after clone | GDPR delete after weeks | Library provenance chip hides (omitted when `source_child_profile_id` is null) | None needed; adult's data intact |
| Adult's subject name conflicts in casing | Case-insensitive match resolves | Topic adds under existing subject | No duplicate subject created |
| Network error on snapshot read | GET fails before tap completes | Trigger button shows inline error state + retry icon | Tap retry; otherwise next render |
| Bridge fired in proxy mode (defensive) | Contract gate failure or test bug | Button never rendered | Contract `showLearnThisToo === false` in proxy; ratchet test enforces |
| Undo tapped after session started | Adult tapped Open within 5s, started session, then tapped Undo before toast dismissed | Toast: "Couldn't undo — you've already opened this topic. [Remove in Library]" | Tap link to navigate to Library row and delete |
| Undo tapped, network blip or row gone | Race / disconnect | Silent dismiss; topic persists if row genuinely persisted | Adult can delete manually from Library |
| Cloned topic ignored forever | Adult never opens it from Library | Topic sits with provenance chip in Library; no special cleanup | Same as any adult-added-but-unstarted topic |
| Subject language: child English, adult Norwegian | Cross-language family | Subject created under adult's Norwegian-language curriculum with the snapshot's English topic title verbatim; LLM teaches in Norwegian | Title may look foreign in Library; description is in adult's view |
| Multiple toasts in flight | Parent clones rapidly | Latest toast replaces the prior one (single visible toast, latest wins) | Library shows all freshly-cloned topics with their "Recently added" 24h badge |
| Toast missed (auto-dismissed before user noticed) | Slow tap, distracted user | Topic appears in Library with "Recently added" badge (24h) and provenance chip ("From {{childName}}") | No notification, but origin is visible in Library |

---

## Schema Impact

**One new column.** Otherwise pure write-into-existing-tables:

```sql
ALTER TABLE curriculum_topics
  ADD COLUMN source_child_profile_id UUID
    REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX idx_curriculum_topics_source_child
  ON curriculum_topics (source_child_profile_id)
  WHERE source_child_profile_id IS NOT NULL;
```

- `subjects` — may insert one row per new (adult, lower(name)) where status='active' (matches existing unique index `subjects_profile_name_lower_active_uq`). `languageCode` set from `profiles.conversationLanguage` on insert; left untouched on match.
- `curricula` — may insert one row per new (subject, version=1) tuple. Required by `curriculum_topics.curriculumId` (NOT NULL FK).
- `curriculum_books` — may insert one row per new (subject, lower(title)) tuple. `sortOrder = max + 1` over books in the subject.
- `curriculum_topics` — may insert one row per new (book, lower(title)) tuple, setting `source = 'parent_bridge'`, `source_child_profile_id = childProfileId`, `description` and `estimatedMinutes` from snapshot, `sortOrder = max + 1`. `source_child_profile_id` is null on all non-bridge rows.
- `needs_deepening_topics` — **not written by the bridge.** Only written later when the adult goes through the relearn fresh-topic mode and `startRelearn` fires.
- `learning_sessions` — **not written by the bridge.** Same as above.
- `curriculum_topic_source` enum — **must add `'parent_bridge'`**. Current enum is `('generated', 'user')` (`packages/database/src/schema/subjects.ts:33-36`).

Migration for the enum value:

```sql
ALTER TYPE curriculum_topic_source ADD VALUE IF NOT EXISTS 'parent_bridge';
```

## Rollback

- The `source_child_profile_id` column can be dropped on rollback — no data loss for users (provenance chip simply disappears). FK constraint dropped cleanly.
- The enum value addition is forward-only (Postgres limitation); rolling back leaves an unused enum value, which is harmless.
- Rollback is possible. No data destruction.

Migrations are forward-only ordered:
1. Add column + index.
2. Add enum value (if needed).

---

## API Surface

Three new routes, all under existing route groups:

### `GET /dashboard/children/:childProfileId/topics/:topicId/snapshot`

- Requires authenticated adult profile.
- Verifies family-link ownership via `assertParentAccess(db, adultProfileId, childProfileId)` (`apps/api/src/services/family-access.ts:45-53`). Wraps the thrown `ForbiddenError` and re-throws `notFound('Topic')` so the response is 404, never 403.
- Returns `ChildTopicSnapshot` (including `topicDescriptionHash`, `childDisplayName`, `estimatedMinutes`) or 404.
- Read-only.

### `POST /curriculum/clone-from-child`

- Body: `{ childProfileId: string; topicId: string; forceCopy?: boolean; requestId: string }`.
  - `requestId` — client-generated UUID. Server dedups by `(adultProfileId, childProfileId, topicId, requestId)` for 60 seconds (in-memory or a small Redis TTL key) so network retries are idempotent.
  - `forceCopy: true` skips the name-match dedup and always creates a new topic with title `"{snapshot.topicTitle} (copy)"`, or `"{snapshot.topicTitle} (copy) N"` (N starts at 2) when a prior force-copy already claimed the base title. The child's display name is **not** embedded in the persisted title — `source_child_profile_id` already drives the live "From {child}" chip via `<TopicProvenance>` at render time, and storing the name inline would survive child-profile deletion and leak PII. Used by the `[Add separate copy]` toast action. Implementation: `forceCopyTitle()` in `apps/api/src/services/family-bridge.ts`.
- Verifies family-link via `assertParentAccess` (same 403→404 wrapping as above).
- Performs the resolve-or-create transaction described in *Adult-side write*, using `INSERT ... ON CONFLICT ... DO NOTHING RETURNING id` against the actual unique indexes.
- **Does not** call `startRelearn`. **Does not** create a session or queue entry.
- Returns `{ topicId, subjectId, alreadyExisted, descriptionDivergent, descriptionRefreshed, topicState, createdIds }`.

Route placement note: this is curriculum-mutation (write subject/book/topic), not retention-mutation (queue entries / sessions). It belongs under a curriculum route, not under `retention.ts`. If a `curriculum.ts` route file does not exist yet, create it; otherwise add this endpoint there.

### `DELETE /curriculum/clone-from-child/undo`

- Body: `{ createdIds: { topicId?: string; bookId?: string; subjectId?: string } }`.
- Verifies each ID belongs to the requesting adult via `createScopedRepository(adultProfileId)`.
- **Deletes the topic only** (and only if `createdIds.topicId` is set). Empty `curriculum_books` and `subjects` containers are left in place — they are harmless and deleting them safely would require row-locks (concurrent clones could land between the orphan check and the delete and lose legitimate data).
- On FK violation (session row references the topic) → returns `{ deleted: { topic: false }, reason: 'session_started' }`. Mobile handles this with the explicit "Couldn't undo — you've already opened this" toast (H4).
- On other failures (network blip, row already gone) → returns `{ deleted: { topic: false } }`. Mobile dismisses silently.

---

## Mobile Implementation

### New hook

`apps/mobile/src/hooks/use-clone-from-child.ts`:

```ts
export function useCloneFromChild(): {
  cloneFromChild: (args: {
    childProfileId: string;
    topicId: string;
    forceCopy?: boolean;
    triggerPath: string;          // for returnTo threading
  }) => void;
  undoLastClone: (createdIds: CreatedIds) => void;
  isCloning: boolean;
  isCloningFor: (topicId: string) => boolean;
};
```

Backed by `useMutation` from React Query. On success, shows the toast variant matching the response. Does **not** navigate automatically — the parent stays where they were.

### New component

`apps/mobile/src/components/family/AddToMyLearningButton.tsx` (renamed from `LearnThisTooButton` per H5; the `components/family/` folder already exists — see `FamilyOrientationCue.tsx`, `WithdrawalCountdownBanner.tsx`):

```ts
type Props = {
  childProfileId: string;
  topicId: string;
  topicTitle: string;
  childDisplayName: string;
  triggerPath: string;            // e.g. "/recaps/abc123" — used as returnTo
};
```

Renders the trigger button + caption ("Private to your learning"). Reads `useNavigationContract().gates.showLearnThisToo` and returns `null` if false. Renders the first-run inline tip on first eligible view (M7).

### Library provenance chip

`apps/mobile/src/components/library/TopicProvenance.tsx`:

- Reads `source_child_profile_id` from topic row.
- If null → renders nothing.
- If non-null and family-link still active → renders small chip "From {{childName}}".
- If non-null but family-link archived or child deleted → renders "From a previous family member" or omits (UX call: pick at implementation time, lean toward omit if it surfaces awkward absences).
- "Recently added" badge (24h, by topic `created_at`) renders alongside.

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

- `use-clone-from-child.test.ts` — mutation lifecycle, all toast variants, navigation on success, error toasts, undo session-started variant, force-copy path.
- `AddToMyLearningButton.test.tsx` — gate respected, caption rendered, first-run tip shown once, disabled-while-cloning.
- `TopicProvenance.test.tsx` — chip rendering for null, active link, archived link, deleted child.
- `navigation-contract.test.ts` — `showLearnThisToo` matrix rows.
- API `curriculum.test.ts` adds clone-from-child route — family-link enforcement, IDOR rejection, resolve-or-create idempotency, `alreadyExisted: true` paths (each sub-case: same desc, diverged unstarted, diverged started, in_progress, completed), force-copy disambiguation.
- API `retention.test.ts` adds fresh-topic startRelearn path — verify session created without prior `needs_deepening_topics` row.
- Integration: `tests/integration/family-bridge.integration.test.ts` — full path with real DB, two profiles linked, end-to-end clone + verify adult's curriculum + verify back-navigation `returnTo` survives.
- Integration: `tests/integration/family-bridge-gdpr.integration.test.ts` — delete child profile after clone, verify `source_child_profile_id` becomes null and adult's topic survives intact.

---

## Implementation Sequence

### Step 0 — Prerequisite (not part of this PR)

- **Nav-contract PR 4 ships `recaps/[recapId]` detail route.** This bridge is blocked on that.

### Step 1 — Schema migration

- Add `source_child_profile_id` column + index.
- Add `parent_bridge` enum value if needed.
- Verify FK ON DELETE SET NULL behavior against the live `profiles` table.

### Step 2 — Server

- Add `GET /dashboard/children/:childProfileId/topics/:topicId/snapshot` route + service.
- Add `POST /curriculum/clone-from-child` route + service (clone-only; no `startRelearn`; handles `forceCopy`).
- Add `DELETE /curriculum/clone-from-child/undo` route + service (handles FK-violation case explicitly).
- Verify or extend `startRelearn` to accept topics not in `needs_deepening_topics`.
- Integration tests as listed above. **Required:** GDPR delete test (H1 verification).

### Step 3 — Contract gate

- Add `showLearnThisToo` to `NavigationContract.gates`.
- Update `resolveNavigationContract` and tests.
- No mobile UI yet.

### Step 4 — Mobile component + hook

- `useCloneFromChild`.
- `AddToMyLearningButton` (with first-run tip).
- `TopicProvenance` chip.
- Unit tests for all toast variants.

### Step 5 — Relearn screen updates

- Provenance header on `?source=parent_bridge`.
- `returnTo` round-trip test.
- Fresh-topic startRelearn integration test wired through UI.

### Step 6 — Wire to surfaces

- Recaps detail screen — required. Spec is blocked on this.
- Child curriculum topic detail.
- Child session detail.
- Library: render `TopicProvenance` on topic rows.

### Step 7 — Analytics event

- Wire `add_to_my_learning.bridge` event in the mutation `onSuccess`. Fires on every tap, including `alreadyExisted: true` (multi-child attribution per M6). Server dedups on `requestId` over 60s.

### Step 8 — E2E

- Maestro flow: parent opens Recaps → taps "Add to my learning" → confirms via toast → taps Open → lands on relearn fresh-topic mode → picks method → starts session → device back returns to Recaps detail (not Home).
- Maestro flow: parent taps button twice in 30s on two different topics → toast collapses to "Plus 1 more added" counter.

---

## Out of Scope

- Two-way sync between adult and child progress.
- Sharing the adult's own session recap back to the child.
- Bulk clone ("learn everything my child is learning").
- Clone from another adult's profile (parent-to-parent or co-parent sharing) — would require a different authorization model.
- Web shell. Mobile-only for V1.
- LLM bridge that re-explains the topic at the child's level for the adult; the adult always gets adult-level framing.
- Notification or proactive reminder for cloned-but-unstarted topics. The 24h "Recently added" badge in Library is the only nudge.

---

## Resolved Decisions

1. **Recaps detail dependency.** Block this spec on nav-contract PR 4 shipping `recaps/[recapId]`. No fallback to the Recaps list row.
2. **Already-cloned detection.** Match by `(subjectId/bookId, lower(title))`. Description divergence is detected via `descriptionHash`. Handling depends on topic state (refresh unstarted, offer separate copy if started). Adult-side subject renames remain a V1 accepted limitation.
3. **One-tap vs modal.** One-tap with undo toast — conditional on the bridge being a clone-only write (no `startRelearn`, no session, no queue). Toast variants reflect state. `[Add separate copy]` action mitigates false-positive name merges.
4. **Origin storage.** See *Data Trace Decision* — nullable `source_child_profile_id` with `ON DELETE SET NULL`. Provenance chip omitted when null.
5. **Subject language.** Subject dedup is language-agnostic by name (matches the existing unique index). `subjects.languageCode` is populated from the adult's `conversationLanguage` on insert; never overwritten on match. Topic title and description stored verbatim from child snapshot.
6. **Trigger copy.** "Add to my learning" + "Private to your learning" caption. Internal event/storage names use `add_to_my_learning.*`.
7. **Open URL.** Carries `topicId`, `subjectId`, `topicName`, `subjectName`, `returnTo` (token), `returnId` (context id), `source=parent_bridge`. Requires the new `family-recaps` / `family-child` tokens in `homeHrefForReturnTo` — coordinate with the nav-contract plan.
8. **Relearn fresh-topic mode.** Verified: `startRelearn` already upserts the queue row and creates the session. Spec ships a regression test, no behavior change required.
9. **Idempotency.** Clone endpoint accepts a client `requestId`; server dedups for 60s.
10. **Undo.** Topic-only delete. Empty book/subject containers stay.

## Out Of Spec — Defer

- Collapsing-counter toast pattern ("Plus N more added — tap to see"). V1 ships single visible toast, latest wins. Counter requires building a new toast variant — defer until product demand confirms it.
- Conversion telemetry beyond `add_to_my_learning.bridge` event (first session, retention impact). Add when data needs grow.
- "Recently added" surface aggregating all sources (manual, AI, bridge). For now, the 24h badge per topic in Library is sufficient.
- Adding a soft-archive column to `family_links`. Today revocation is row deletion; revisit if a UX need emerges.
- Widening `subjects` unique index to include `language_code`. Not required by V1 since dedup is language-agnostic by design.
