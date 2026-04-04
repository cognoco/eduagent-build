# Epic 7 (Revised): Concept Map — Advisory Prerequisite Learning

**Author:** Zuzka + Claude
**Date:** 2026-03-30
**Status:** Spec complete (replaces original Epic 7 spec)
**Revision:** v2 — "Guide, Don't Gate" redesign

---

## What Changed from v1 and Why

The original Epic 7 spec used **hard topic locking** (REQUIRED prerequisites block access until "strong" retention). A product review challenged this from the end-user perspective and identified fundamental conflicts with the app's learning philosophy:

| Original (v1) | Revised (v2) | Why |
|---------------|-------------|-----|
| REQUIRED prerequisites lock topics | All prerequisites are advisory (RECOMMENDED) | Hard locks frustrate students who learned prerequisites outside the app. The AI adapts — the graph shouldn't gatekeep. |
| Two relationship types (REQUIRED/RECOMMENDED) | Single type at launch (RECOMMENDED) | REQUIRED vs RECOMMENDED adds schema complexity, UI complexity (solid/dashed edges), and edge-generation complexity for a distinction that doesn't change user behavior when everything is advisory. |
| "Skip Anyway" deletes prerequisite edges | Soft-skip: edge gets `status: 'skipped'`, remains in DB | Edge deletion is irreversible. Kids don't understand they're permanently altering their learning graph. Soft-skip lets the system (and user) restore later. |
| Parent-only manual override (FR127) | Any learner can self-override via "prove it" quiz + parent can mark "already known" | A 14-year-old shouldn't need a parent to click a checkbox so they can study algebra. |
| No re-engagement mechanism for decaying topics | Periodic suggestive quizzes for decaying prerequisites | Instead of re-locking topics (infuriating) or ignoring decay (stale graph), prompt lightweight quizzes framed positively. |
| Concept map: Sugiyama DAG for all ages | Age-appropriate visualization: journey path for younger, graph for older | A 6-year-old cannot interpret a directed acyclic graph. A "learning journey" metaphor works across ages. |
| No per-edge human feedback | Learner/parent can flag bad prerequisites | LLM-generated edges have no human validation loop. Bad edges silently distort the learning path. |
| Topic unlock = coaching card notification | Topic unlock = celebration animation (Epic 13 FR217) | "You unlocked Algebra" should feel like an achievement, not a notification. Uses Epic 13's unified celebration system. |

---

## Design Principles

- **Guide, don't gate.** Prerequisites inform recommendations and LLM context. They never prevent a student from starting a topic.
- **The student decides.** Every AI-driven suggestion has a human override. Skip, ignore, challenge, or prove-it — the student always has agency.
- **Soft state, not hard locks.** Edges are never deleted. Skips are reversible. Overrides are recorded but not permanent. The graph is a living document.
- **Age-appropriate presentation.** The same data model serves all ages, but the visualization adapts. Journey path for kids, graph for teens, list fallback for everyone.
- **LLM edges are a starting point, not the truth.** Human feedback refines the graph over time. Bad edges can be flagged and corrected.
- **Celebrate progress, don't punish gaps.** Topic unlocks use Epic 13's celebration system. Decaying prerequisites trigger encouraging quizzes, not warnings.

---

## Functional Requirements (Revised FR118-FR127 + New FR150-FR152)

### FR118 (Revised): Topic Prerequisite Graph — Advisory DAG Data Model

- **FR118.1:** `topic_prerequisites` join table with `prerequisiteTopicId`, `dependentTopicId`, `status` (enum: `ACTIVE | SKIPPED`), `createdAt`.
- **FR118.2:** Single relationship type at launch — all edges are advisory (RECOMMENDED). No REQUIRED/RECOMMENDED distinction. If a future release needs hard gating (e.g., safety-critical medical curriculum), add `relationshipType` then.
- **FR118.3:** DAG cycle detection in service layer (topological sort validation before insert). Not a database constraint — better error messages, easier to update.
- **FR118.4:** Unique constraint on `(prerequisiteTopicId, dependentTopicId)`. Check constraint: `prerequisiteTopicId != dependentTopicId`. Cascade delete from `curriculumTopics`.
- **FR118.5:** Maximum depth: 5 levels. Enforced in LLM prompt ("keep prerequisite chains shallow") and validated on insert (reject if inserting would create a chain deeper than 5).

### FR119 (Revised): Prerequisite-Aware Session Ordering — Advisory, Not Blocking

- **FR119.1:** When coaching card recommends the next topic, check prerequisite completion first. If prerequisites are incomplete, **recommend the prerequisite topic first** — but do not hide or lock the dependent topic.
- **FR119.2:** Library and curriculum screens show all topics. Topics with incomplete prerequisites display a subtle indicator (e.g., "Builds on: Fractions") — not a lock icon.
- **FR119.3:** If the student taps a topic with incomplete prerequisites, show a brief advisory: "This topic builds on [prerequisite]. Want to review [prerequisite] first, or dive right in?" Two options: [Review Prerequisite] / [Start Anyway].
- **FR119.4:** "Start Anyway" is not punished. The session proceeds normally. The LLM receives prerequisite context (FR125) to bridge gaps.

### FR120 (Revised): Skip Warning — Soft-Skip, Never Delete

- **FR120.1:** When a learner skips a topic that has dependents, show a warning dialog listing dependent topics: "These topics build on it: [list]. Skipping may make them harder to learn."
- **FR120.2:** "Skip Anyway" sets the prerequisite edge `status` to `SKIPPED` — **does not delete the edge**.
- **FR120.3:** Skip is logged in `curriculumAdaptations.prerequisiteContext` JSONB for coaching and LLM context awareness.
- **FR120.4:** Dependent topics remain fully accessible. Coaching card notes the missing foundation.
- **FR120.5:** Skipped prerequisites can be **un-skipped** (restored to `ACTIVE`) from the curriculum review screen or concept map. Reversibility is a core requirement.
- **FR120.6:** If edge query fails, fall back to standard skip (no warning). Warning is progressive enhancement.

### FR121 (Revised): Visual Concept Map — Age-Appropriate Visualization

- **FR121.1:** Two visualization modes, selected by age from `profile.birthDate`:
  - **Under 13: Learning Journey** — A linear/branching path (like a game map). Topics are stops on a trail. Branches show where the path splits into optional/parallel topics. Uses friendly metaphors (stepping stones, trail markers). Vertical scroll.
  - **13+: Knowledge Graph** — Top-down Sugiyama/layered DAG. Foundation topics at top, advanced at bottom. Closer to the original v1 spec.
  - Both modes use the same underlying data model and API endpoint.

- **FR121.2:** Node colors (both modes): `bg-success` (strong retention), `bg-warning` (fading), `bg-danger` (weak), `bg-muted` (not started). Uses NativeWind semantic tokens.
- **FR121.3:** Edge rendering (graph mode): single line style (all edges are advisory). Skipped edges shown as faded/dotted.
- **FR121.4:** Tap a topic node → inline card: topic name, retention status, prerequisites (with status), dependents, "Start Session" CTA. No locked state — every topic has a CTA.
- **FR121.5:** Rendering: native `react-native-svg`. No WebView. Max ~50 nodes per subject; larger curricula collapse to section-level grouping.
- **FR121.6:** Accessibility: nodes have `accessibilityLabel` with topic name + retention status. Navigable via sequential swipe (topological order).
- **FR121.7:** Access: "Concept Map" toggle/tab in Library. If no prerequisite data (pre-Epic 7 curricula), hide the tab.

### FR122 (Revised): Prerequisite Edge Generation — LLM with Human Feedback Loop

- **FR122.1:** On subject creation, LLM generates initial prerequisite edges as part of curriculum generation. Prompt: "Generate prerequisite relationships between topics. All relationships are advisory — they guide ordering and recommendations, never block access. Keep chains shallow (max 5 levels)."
- **FR122.2:** On new topic added to existing subject, targeted LLM call generates edges for the new topic only (not full graph regeneration).
- **FR122.3:** LLM returns edges as `[{ from: topicTitle, to: topicTitle }]` pairs. Service resolves to topic IDs and validates DAG constraints before insert.
- **FR122.4:** (NEW) Per-edge feedback: learner or parent can flag a prerequisite as "wrong" from the concept map card. Flagged edges are recorded in `curriculumAdaptations` and excluded from ordering/recommendations. At sufficient flag volume (future), flagged edges can be auto-removed or regenerated.

### FR123 (Revised): Graph-Aware Coaching Card — Celebration on Unlock

- **FR123.1:** Coaching card precomputation considers the prerequisite graph. When all prerequisites for a topic reach "strong" retention, the topic is considered "newly ready."
- **FR123.2:** "Newly ready" topics trigger a **celebration via Epic 13's unified celebration system** (FR217): `queueCelebration(db, profileId, 'comet', 'topic_unlocked', topicName)`. The celebration plays on next home screen mount.
- **FR123.3:** Coaching card text for newly ready topics: "You've been building a strong foundation — [Topic Name] is a great next step!" CTA: [Start Topic].
- **FR123.4:** At-risk flagging: when a foundational prerequisite drops to fading/weak and dependent topics are in progress, coaching card suggests: "Your [prerequisite] knowledge is fading — a quick review could help with [dependent]." This is a suggestion, not a warning.
- **FR123.5:** Card priority: between `review_due` (higher) and `streak` (lower) — priority 5.

### FR124 (Revised): Skipped Prerequisite Handling

- **FR124.1:** When a prerequisite is skipped (edge `status: 'SKIPPED'`), dependent topics remain fully accessible.
- **FR124.2:** Coaching card mentions the missing foundation for topics with skipped prerequisites: "You skipped [prerequisite] — if [dependent] feels tricky, reviewing [prerequisite] might help."
- **FR124.3:** `curriculumAdaptations.prerequisiteContext` JSONB records which prerequisites were skipped and when.
- **FR124.4:** Skipped prerequisites remain visible in the concept map (faded/dotted) so the student understands the full picture.

### FR125 (Unchanged): Prerequisite Context as Teaching Signal

- **FR125.1:** When LLM teaches a topic whose prerequisite was skipped or incomplete, `buildSystemPrompt()` includes prerequisite context: "Student skipped [topic], which is a prerequisite for this topic. Bridge knowledge gaps by providing foundational context inline where needed."
- **FR125.2:** Context is advisory — LLM adapts teaching style but never refuses to teach the topic.
- **FR125.3:** Prerequisite context is injected alongside existing analogy domain and persona voice in `services/exchanges.ts`.

### FR126 (Unchanged): Topological Sort for Learning Path

- **FR126.1:** Default topic ordering uses topological sort of the prerequisite graph, with ties broken by retention urgency (most urgent first).
- **FR126.2:** Fallback: if no prerequisite data, display topics in `sortOrder` as before.
- **FR126.3:** Library shows topics in prerequisite order with subtle dependency indicators ("Builds on: X").

### FR127 (Revised): Prerequisite Override — Self-Service, Not Parent-Only

- **FR127.1:** Any learner (regardless of age) can mark a prerequisite as "already known" from the concept map card or advisory dialog (FR119.3).
- **FR127.2:** "Already known" override has two paths:
  - **Quick override:** Tap "I already know this" → topic marked as overridden. No quiz. Trust-based. Logged in `curriculumAdaptations`.
  - **"Prove it" quiz:** Tap "Prove it" → 3-5 quick recall questions on the prerequisite topic. If passed (2/3+), prerequisite marked as mastered with a retention card created. If failed, system suggests: "Looks like there are some gaps — want to do a quick review?"
- **FR127.3:** Parent can also mark prerequisites as "already known" from the parent dashboard (child detail screen → subject → concept map).
- **FR127.4:** Override is recorded but reversible — the system can still recommend the prerequisite if decay quizzes (FR150) reveal gaps.

### FR150 (New): Periodic Suggestive Quizzes for Decaying Prerequisites

- **FR150.1:** When a prerequisite topic's retention decays from "strong" to "fading" AND the dependent topic is in progress or completed, the system queues a suggestive quiz prompt.
- **FR150.2:** Quiz prompt appears as a coaching card (not a blocking dialog): "Quick check! You learned [prerequisite] a while ago. Want to see how much you remember?" CTA: [Take Quiz] / [Not Now].
- **FR150.3:** "Take Quiz" starts a lightweight recall check: 3-5 questions, same format as existing recall tests but shorter.
- **FR150.4:** After the quiz, positive framing regardless of result:
  - Passed: "Nice! You still remember [prerequisite] well. Keep going with [dependent]!"
  - Partial: "You nailed [strong areas]. You might want to revisit [weak areas] — want to do a quick review?" CTA: [Review] / [Later].
  - Failed: "Looks like [prerequisite] has faded a bit. A quick refresher could help with [dependent]. Want to review?" CTA: [Review] / [Later].
- **FR150.5:** "Not Now" and "Later" are respected. No repeat prompt for the same prerequisite within 7 days. The quiz is a suggestion, not a mandate.
- **FR150.6:** SM-2 gets the quiz result as a data point (updating retention card). This happens transparently — the student sees encouragement, the system gets signal.
- **FR150.7:** Suggestive quizzes are queued during coaching card precomputation, not triggered during sessions. They appear on the home screen, not mid-session.

### FR151 (New): Per-Edge Human Feedback on Prerequisites

- **FR151.1:** On the concept map card (when a student taps a topic node), each prerequisite in the "Builds on" list has a small feedback affordance (e.g., "×" or "Not needed").
- **FR151.2:** Tapping the feedback affordance opens a confirmation: "You don't think [prerequisite] is needed for [topic]? This will remove it from your recommendations." [Remove] / [Keep].
- **FR151.3:** Feedback sets the edge `status` to `SKIPPED` (same as skip flow) and logs in `curriculumAdaptations`.
- **FR151.4:** Parent can also provide per-edge feedback from the parent dashboard concept map view.
- **FR151.5:** Flagged edges are excluded from ordering recommendations and LLM context injection. They remain visible in the concept map (faded) for transparency.

### FR152 (New): "Prove It" Quick Quiz for Prerequisite Override

- **FR152.1:** When a student selects "Prove it" (FR127.2), the system generates 3-5 questions about the prerequisite topic using the same infrastructure as recall tests.
- **FR152.2:** Questions are generated via LLM, scoped to the specific prerequisite topic. Difficulty targets the "standard" level (not EVALUATE or TEACH_BACK — just basic recall).
- **FR152.3:** Passing threshold: 2/3 correct (for 3 questions) or 3/5 correct (for 5 questions).
- **FR152.4:** On pass: retention card created for the prerequisite topic with `quality: 4`, `repetitions: 1` (strong enough to "unlock" but scheduled for future review). Celebration: Polar Star animation.
- **FR152.5:** On fail: no penalty. System suggests a review session. The prerequisite is not marked as overridden — the student can try the quiz again anytime.
- **FR152.6:** Quiz results logged in `sessionEvents` for analytics.

---

## Architecture Decisions

### AD1: Single Relationship Type at Launch

The original spec had REQUIRED (hard lock) and RECOMMENDED (soft suggestion). Since all prerequisites are now advisory, a single type suffices. The `relationshipType` column is omitted from the initial schema. If a future use case genuinely needs hard gating (e.g., safety-critical medical training where order matters for patient safety), add the enum then. YAGNI.

### AD2: Soft-Skip via Status Enum, Not Edge Deletion

```typescript
// topic_prerequisites table
status: pgEnum('prerequisite_status', ['ACTIVE', 'SKIPPED'])
```

Edges are never deleted by user action. Skip sets `status: 'SKIPPED'`. Restore sets `status: 'ACTIVE'`. Cascade delete only fires when the parent `curriculumTopic` is deleted (curriculum regeneration).

**Why not a separate `skipped_prerequisites` table?** Overengineered. A status column on the same row is simpler, queryable with the same join, and doesn't require reconciliation logic.

### AD3: Age-Gated Visualization Mode

```typescript
function getVisualizationMode(birthDate: Date): 'journey' | 'graph' {
  const age = differenceInYears(new Date(), birthDate);
  return age < 13 ? 'journey' : 'graph';
}
```

The API returns the same data (`GET /v1/curriculum/:subjectId/graph` — topics + edges). The mobile client renders it differently based on age. Both modes use `react-native-svg`. The journey mode is a simpler layout algorithm (linear with branches) than Sugiyama.

### AD4: SM-2 Stays Pure — Graph Logic in Services

No changes to `packages/retention/`. The SM-2 library computes per-topic retention math. Graph-aware logic (prerequisite ordering, decay quiz triggers, coaching card "newly ready" detection) lives in `apps/api/src/services/` — specifically in coaching card precomputation and a new `prerequisite-service.ts`.

### AD5: Celebration Integration via Epic 13 Queue

Topic unlock celebrations use Epic 13's `queueCelebration()` function (FR217). No animation work in Epic 7. The Inngest `session-completed` chain detects when all prerequisites for a topic reach "strong" and queues the celebration:

```typescript
// In session-completed Step 1 (after retention update)
const newlyReadyTopics = await findNewlyReadyTopics(db, profileId);
for (const topic of newlyReadyTopics) {
  await queueCelebration(db, profileId, 'comet', 'topic_unlocked', topic.title);
}
```

**Dependency:** Epic 13 Story 13.7 (post-session celebration queue) must be implemented before Epic 7 Story 7.5.

### AD6: "Prove It" Quiz Reuses Recall Test Infrastructure

The "prove it" quiz (FR152) reuses the existing `processRecallTest()` service and LLM question generation from recall tests. The only difference is:
- Shorter (3-5 questions vs full recall)
- Creates a retention card on pass (rather than updating an existing one)
- No remediation flow on fail (just a suggestion)

No new service needed — extend `processRecallTest()` with a `mode: 'full' | 'quick'` parameter.

### AD7: Suggestive Quiz Scheduling in Coaching Card Precomputation

Decay quizzes (FR150) are detected during coaching card precomputation (the same Inngest job that already runs after `session-completed`). The precompute function checks:

1. For each topic with dependents in progress: is the prerequisite decaying?
2. If yes, and no quiz was prompted in the last 7 days: queue a coaching card of type `prerequisite_quiz_suggestion`.

No new Inngest function needed. No new cron. The existing precomputation job gains one more query.

---

## Stories (Revised)

### Story 7.1: Topic Prerequisite Data Model + Edge Generation

As a system,
I need a prerequisite graph data model and LLM edge generation,
So that curriculum topics can express advisory dependency relationships.

**Acceptance Criteria:**

**Given** the database needs prerequisite support
**When** the schema is created
**Then** `topic_prerequisites` join table created with `prerequisiteTopicId`, `dependentTopicId`, `status` (ACTIVE/SKIPPED enum, default ACTIVE), `createdAt`
**And** DAG cycle detection implemented in service layer (topological sort validation before insert)
**And** depth validation rejects chains deeper than 5 levels
**And** LLM generates initial prerequisite edges on subject creation as part of curriculum generation
**And** targeted edge generation for new topics added to existing curriculum (not full graph regeneration)

**FRs:** FR118, FR122

---

### Story 7.2: Advisory Prerequisite Ordering + Library Indicators

As a learner,
I want my learning path to suggest prerequisite order without blocking me,
So that I can follow recommendations or forge my own path.

**Acceptance Criteria:**

**Given** a curriculum with prerequisite edges
**When** the coaching card recommends the next topic
**Then** topics with incomplete prerequisites are deprioritized but NOT hidden
**And** default ordering uses topological sort (prerequisite depth), ties broken by retention urgency
**And** Library shows subtle "Builds on: [prerequisite]" indicators on topics with incomplete prerequisites
**And** tapping a topic with incomplete prerequisites shows advisory dialog: "This builds on [prerequisite]. Review first, or dive right in?" with [Review Prerequisite] / [Start Anyway]
**And** "Start Anyway" proceeds normally with no penalty

**FRs:** FR119, FR126

---

### Story 7.3: Soft-Skip + Restore + Prerequisite Context Injection

As a learner skipping a topic,
I want to understand the impact and be able to undo my skip,
So that I make informed, reversible decisions.

**Acceptance Criteria:**

**Given** a learner skips a topic that has dependents
**When** the skip is initiated
**Then** warning dialog shown listing dependent topics
**And** "Skip Anyway" sets edge `status` to `SKIPPED` (not deleted)
**And** skip logged in `curriculumAdaptations.prerequisiteContext` JSONB
**And** dependent topics remain fully accessible
**And** skipped prerequisites can be restored to ACTIVE from curriculum review
**And** when LLM teaches a topic with skipped prerequisites, system prompt includes context for bridging knowledge gaps

**FRs:** FR120, FR124, FR125

---

### Story 7.4: Prerequisite Override — Self-Service + "Prove It" Quiz

As a learner who already knows a prerequisite topic,
I want to skip it without needing a parent,
So that I can move to topics I actually need to learn.

**Acceptance Criteria:**

**Given** a learner encounters a topic with prerequisite advisory
**When** they want to override the prerequisite
**Then** two paths available: "I already know this" (quick override, trust-based) and "Prove it" (3-5 question quiz)
**And** "Prove it" quiz uses existing recall test infrastructure, 2/3 or 3/5 passing threshold
**And** on pass: retention card created, Polar Star celebration, prerequisite marked as mastered
**And** on fail: no penalty, suggestion to review, can retry anytime
**And** parent can also mark "already known" from parent dashboard
**And** override is recorded in `curriculumAdaptations` but reversible

**FRs:** FR127, FR152

---

### Story 7.5: Graph-Aware Coaching Card + Celebration + Suggestive Decay Quizzes

As a learner progressing through a curriculum,
I want to be celebrated when I unlock new topics and gently reminded when foundations fade,
So that I feel rewarded and stay on solid ground.

**Acceptance Criteria:**

**Given** coaching card precomputation runs after session completion
**When** all prerequisites for a topic reach strong retention
**Then** `queueCelebration(db, profileId, 'comet', 'topic_unlocked', topicName)` is called (Epic 13 FR217)
**And** coaching card shows: "You've been building a strong foundation — [Topic] is a great next step!" with [Start Topic] CTA
**And** when a prerequisite decays from strong to fading while dependents are in progress, coaching card suggests: "Quick check on [prerequisite]?" with [Take Quiz] / [Not Now]
**And** quiz is 3-5 lightweight questions with positive framing regardless of result
**And** "Not Now" respected — no repeat prompt for same prerequisite within 7 days
**And** quiz results feed back into SM-2 retention card transparently

**FRs:** FR123, FR150

**Dependency:** Epic 13 Story 13.7 (celebration queue) must be implemented first.

---

### Story 7.6: Age-Appropriate Concept Map + Per-Edge Human Feedback

As a learner,
I want to see how my topics connect in a way I can understand,
And flag prerequisites that seem wrong,
So that my learning map is accurate and useful.

**Acceptance Criteria:**

**Given** a learner navigates to the concept map
**When** the visualization loads
**Then** under-13 sees Learning Journey (linear/branching path), 13+ sees Knowledge Graph (Sugiyama DAG)
**And** nodes colored by retention status (green/yellow/red/gray)
**And** skipped edges shown as faded/dotted
**And** tap a node → inline card with retention, prerequisites, dependents, "Start Session" CTA (every topic has a CTA — no locked state)
**And** prerequisite list items have feedback affordance ("Not needed")
**And** flagging a prerequisite sets edge to SKIPPED with confirmation dialog
**And** parent can also provide per-edge feedback from parent dashboard
**And** rendering uses native `react-native-svg`, no WebView
**And** max ~50 nodes per subject; larger collapse to section-level grouping
**And** pre-Epic 7 curricula: tab hidden or "Prerequisite data not available"
**And** accessibility: `accessibilityLabel` on nodes, sequential swipe navigation

**FRs:** FR121, FR151

---

## Execution Order

```
7.1 (Data model + edge generation)        ─── no deps
7.2 (Advisory ordering + indicators)      ─── depends on 7.1
7.3 (Soft-skip + restore + LLM context)   ─── depends on 7.1
7.4 (Self-service override + quiz)         ─── depends on 7.1

7.5 (Coaching card + celebration + decay)  ─── depends on 7.2, 7.3, Epic 13 Story 13.7
7.6 (Concept map + human feedback)         ─── depends on 7.2, 7.3
```

Stories 7.2, 7.3, and 7.4 can be **parallelized** after 7.1. Stories 7.5 and 7.6 can be parallelized after their dependencies complete. Total: 6 stories, ~3 sequential phases.

---

## Interaction with Other Epics

| Epic | Interaction |
|------|-------------|
| **Epic 13** (session lifecycle) | Story 13.7 (celebration queue) must exist before Story 7.5 can queue topic-unlock celebrations. Story 13.4 (animation library) provides the Comet animation component. Epic 7 calls `queueCelebration()` — zero animation work in Epic 7. |
| **Epic 14** (human agency — new) | FR151 (per-edge feedback) uses the same feedback pattern as Epic 14's per-message feedback. Design the affordance once, apply in both contexts. |
| **Epic 12** (persona removal) | Age-gated visualization (FR121.1) uses `profile.birthDate` — aligns with Epic 12's shift from persona enum to birthDate-derived behavior. |
| **Epic 3** (retention) | SM-2 retention data drives node colors, decay quiz triggers, and "newly ready" detection. SM-2 library itself is unchanged. |

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| LLM generates bad prerequisite edges | FR151: per-edge human feedback. FR122.4: flagged edges excluded from recommendations. Long-term: aggregate flags to auto-correct. |
| Journey path layout hard to implement well | Journey mode is a simpler layout than Sugiyama — linear with branches. Many RN game-map implementations exist as reference. Fallback: list view with dependency indicators (Story 7.2 already provides this). |
| "Prove it" quiz questions too easy/hard | Reuses recall test infrastructure which already calibrates to topic difficulty. 2/3 threshold is generous. |
| Suggestive quiz fatigue | 7-day cooldown per prerequisite. "Not Now" always respected. Coach card priority is low (below review_due and streak). |
| 50-node limit too restrictive for some subjects | Section-level collapse handles larger curricula. The limit protects rendering performance. Can be raised with profiling data post-launch. |
| Students bypass all prerequisites with "I already know this" | That's fine — the system still provides LLM context bridging (FR125). The "already known" path is trust-based by design. If the student struggles, suggestive quizzes (FR150) will naturally surface the gap. |
| Epic 13 not implemented yet when Epic 7 starts | Story 7.5 (celebration) is the only dependency. Stories 7.1-7.4 and 7.6 are independent. Start Epic 7 without Epic 13 — just defer 7.5. |
