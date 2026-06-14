---
title: Umbrella Planning Reference — the rules of the game
status: CANONICAL for the umbrella program · v1
date: 2026-06-10
owner: Jorn (orchestrator) — rules change only by his ratification
scope: >
  General planning rules, extracted from the umbrella-program planning sessions
  of 2026-06-09/10 and written program-agnostically. Canonical reference for
  this program AND the embryo input for the ZDX top-down delivery layer
  (roster row PRG-04). Where a rule needs a concrete binding to THIS program,
  the binding lives in the Appendix, not in the rule.
---

# Umbrella Planning Reference

**What this is.** The RULES of planning — structure, vocabulary, slicing method,
dependency model, activation gates, operating principles. **What it is not:**
state. The roster holds program state (rows, queue); per-Initiative trackers hold
delivery state; Cosmo holds live work-item state. One fact, one home
(§1.4) — this document deliberately contains no row contents, no WI numbers, no
statuses outside its change log.

**Document map (who holds what):**

| Artifact | Holds | Changes when |
|---|---|---|
| **This reference** | the rules | a rule is ratified/amended |
| **Roster** (`program-roster.md`) | Initiative rows + activation queue | inventory or queue changes |
| **Per-Initiative tracker** | charter, WI map, sequence, coarse status | that Initiative moves |
| **Ratified plan** (per Initiative) | frozen planning decisions | never (superseded, not edited) |
| **Cosmo** | live per-WI state (Stage/State/claims/edges) | continuously, by executors |

---

## 1. Structure & vocabulary

1.1 **The hierarchy** (top to bottom):
**Program** (the umbrella) → **Initiative** (estate-glossary term: an in-flight
effort with lifecycle *start → active → graduated / parked / killed*, typically
with a `_wip/<slug>/` workspace) → **Cosmo Workstream(s)** (substrate containers
an Initiative creates **at activation**, 0..n per Initiative — never assume 1:1)
→ **Work Package** (`Altitude=WP`, PR-sized bundle) → **Work Item / Sub-item**.

1.2 **Banned synonyms.** Initiatives are never called "workstreams" (locked to
the ZDX/Cosmo object, ZDX-ADR-0001), "work tracks", or "streams". Proper names
containing those words (e.g. a historical "Stream 2") stay reserved for their
referent and are never generalized.

1.3 **The roster is the Initiative roster** — a program board of rows and
pointers. Each row is a proto-epic: `ID · Status · Owner · Outcome ·
Depends-on · Decomposition (pointer) · Activate-when`. The `Activate-when`
field is the highest-value capture (the one thing Cosmo cannot express today).

1.4 **Pointers, never copies.** Every fact lives in exactly one home; every
other artifact points. Moving a fact's home is allowed (it remains one home);
duplicating it is not.

## 2. The delivery pattern (per active Initiative)

2.1 Activating an Initiative means creating, in order: its **tracker** (charter /
how-to-use / pointers / sequence + coarse status / current position / change
log), its **Cosmo Workstream**, and its **slice** (plan → Cosmo entries). This
is the template dogfooded by the first Initiative through the pipeline.

2.2 **Slice direct-to-WP.** Multi-item bundles instantiate as `Altitude=WP`
with constituent detail (e.g. audit findings) **absorbed into the WP body** and
pointed at their satellite register — no per-constituent child items. Flat by
default; **sub-slice on demand** at execution if a WP proves too big. Never
create empty containers: a single-constituent unit is an `Item`, not a WP.

2.3 **WPs are PR-sized.** PR-sized is an independent gate from "shares a
pattern" — a coherent bundle that is not PR-sized gets split at plan level,
not deferred to execution.

2.4 **Ratified plans should encode per-unit priority** (and any other
slice-time field), so slicing is pure transcription. A field the plan omits
becomes a judgment call at slice time — record the derivation rule used.

2.5 **Session model — one session per altitude.** Coordination mirrors the
artifact hierarchy: a **program session** steers the roster / queue / gates; a
**shepherd session** per executing Initiative runs its day-to-day (pick →
refine → brief → hand off → track) against its tracker + the substrate; and
**executor agents** build individual WPs in isolated worktrees. Do not collapse
altitudes: the program session never shepherds WP-level detail, and a shepherd
never reaches into another Initiative — the two talk only in boundary events
(§5.2). Standing orchestration *daemons* are banned; shepherds are interactive
sessions.

**Shepherd and reviewer sessions are operator-launched — chosen by design, not
convenience.** The program session **prepares** the thin kickoff brief (§2.6) and
hands it to the operator; **the operator spawns the separate session.** The
program session never spawns a shepherd (or the autonomous reviewer) as its own
subagent or background agent. This was ruled deliberately because operator-launch
is the *only* mechanism that fully supports the session model: a shepherd must be
a full, independent, interactive session with its own context budget and lifecycle
(the disposable-but-not-subordinate invariant, §2.6), and the reviewer must be a
genuinely separate session in a different runtime (the reviewer ≠ executor quality
invariant). Spawning either from inside the program session re-subordinates it to
the program session's context and lifecycle — collapsing the altitude separation
this section exists to enforce and breaking the "kill any session, lose nothing"
property. So: program session authors the kickoff; operator launches; the launched
session self-drives off its pointers.

2.6 **Shepherd sessions are disposable by construction.** A shepherd is a
reader/writer of the durable artifacts, never their replacement: every state
change is written back (substrate immediately; tracker at checkpoint cadence).
The test: kill the session at any moment and a fresh one pointed at the
tracker loses nothing but warm cache. Kickoff brief = three pointers (tracker ·
ratified plan · substrate operating rules) + the checkpoint duty + the boundary
events to report upward. Briefs are pointers, never pasted content — pasted
briefs go stale.

2.7 **Model tiering by leverage.** Shepherds and critical-path executors run on
the top model tier — low-volume but high-leverage (a wrong pick, brief, or
review costs an executor-day). Routine sub-agents (state syncs, lookups,
mechanical sweeps) run on mid/low tiers. Tier follows the role; effort follows
the turn.

2.8 **Graduating an Initiative** is the symmetric close of §2.1. When the lane's
outcome is met — every Work Item `Closed`/`Done` — perform the close ceremony, in
order:
- **Set the Cosmo Workstream `Status` → `Closed`.** §2.1 created it `Open`;
  graduation must close the **container**, not just its Work Items. This is the
  easy-to-miss step — the shepherd's DoD stops at the last WI, so closing the
  Workstream is the **program session's** job, not the shepherd's. (Status options:
  `Open` · `On hold` · `Closed`.)
- Write the final **tracker** checkpoint + residue statement; stand the shepherd down.
- Flip the **roster** entry to `graduated` (outcome + date) and update the **dashboard**.
- Route any residue / spillover (ZDX-stream · backlog · spillover register).

A Workstream stays `Open` only while work remains: a legitimately **reopened** lane (a
fast-follow wave, or a deferred tier still pending) is correctly `Open` — only a
*fully* graduated one is `Closed`.

## 3. Planning method — reconcile-and-route

3.1 **The roster is the standing hypothesis.** Planning passes do not start
from a big bucket and re-cluster; they route the **unmapped margin** into
existing rows and adjust only at the margins. Re-deriving committed
dispositions is churn, not rigor.

3.2 **High bar for new rows.** Absorb into substantial clusters first; a new
Initiative needs a coherent outcome, a distinct executor/supervision profile,
and enough mass to charter. Orphan singletons get merged or parked, not
enshrined.

3.3 **Boundaries vs order.** Cluster **boundaries** come from domain /
file-surface cohesion + executor profile (what can be executed together
without collision, by the same kind of executor). **Order** comes from gates
(§6). Value, capacity, and milestone pressure are *ordering* lenses — using
them to draw boundaries produces clusters that fight the file-surface reality.

## 4. Intake routing rule (what keeps planning flexible)

4.1 The stable artifact is the **routing rule**, not any frozen mapping. New
work arriving at any time routes by class to an existing row; additions change
row *contents*, never program *structure*.

4.2 The rule is a short decision list maintained in the roster (binding-specific;
see Appendix for the current one). Its last line is always: **fits nothing →
the unrouted-intake line** — a holding row triaged at the next umbrella touch.
Intake never blocks capture, and capture never forces a structural decision.

## 5. Dependencies & sequencing

5.1 **Granularity by altitude — edges live at the altitude of the plan that
created them.** Intra-Initiative WP/Item edges fall out of the Initiative's own
ratified plan (near-zero marginal cost, maintained by that Initiative alone).
Nobody outside an Initiative wires into, or maintains, its internal edges.

5.2 **Cross-Initiative dependencies attach only to exported boundary nodes**
(named interface events — the boundary-node pattern). An Initiative exports a
small set of milestones; other Initiatives' gates reference those events and
never a foreign internal item. Consequence: any Initiative can re-slice
internally without breaking the global picture; the cross graph grows linearly
with Initiatives (a handful of nodes), never quadratically with items.

5.3 **Resource contention stays out of the dependency graph.** Attention/
capacity limits, same-file blast radius, operator-ruling gates, and product
triggers are **queue gates** (§6), not edges. An edge encoding "we lack
capacity to do both" is false the moment capacity appears.

5.4 **Hard vs soft.** `Blocked-by` is reserved for hard logical dependencies.
Soft "preferably-after" ordering uses `Related Items` + `Workstream Order`. A
soft edge that turns out to be load-bearing is a mislabeled hard edge — promote
it.

5.5 **There is no single global graph.** Sequence is computed at two grains:
within an Initiative by its own Cosmo edge graph; across Initiatives by the
activation queue conditioned on boundary events. The program never schedules
another Initiative's items — it schedules **activations against exported
milestones**.

## 6. Activation & the queue

6.1 **The queue is the program-wide full forward view** — every Initiative
appears with its gate, including those whose disposition is "much later"
(post-execution drains, product-triggered designs). A queue showing only the
near-term subset cannot be reconciled against the roster and is wrong by
construction.

6.2 **Gate-ordered, not date-ordered.** Queue entries are conditions on named
events, never calendar positions.

6.3 **The standard activation gates** (evaluated per Initiative, all must
clear):
- **Blast-radius class** — out-of-radius work may run parallel to a
  rewrite anytime; in-radius work serializes behind (or coordinates with) the
  constructing wave, regardless of plan readiness.
- **Pipeline-proven, not pipeline-finished** — a few work items through
  claim→execute→review→close cleanly on the new machinery; never "the first
  Initiative completed end-to-end".
- **Attention budget** — the honest human-capacity call, made per activation
  window; never encoded as a dependency.
Plus any named **operator/product gates** (a required human ruling, an
external trigger) — listed as explicit conditions on the entry.

6.4 **Two concurrent program activities** once execution starts: **execution**
(the active Initiative(s)) and **activation planning** (everything else).
Planning consumes agent capacity, not execution throughput — it never waits on
execution. Planned Initiatives start executing in parallel as their gates
clear (§6.3).

## 7. Operating principles (cross-cutting)

7.1 **Dogfood rule.** The first Initiative through any new machinery proves it
before others reuse it. Friction found while dogfooding is captured as work
items against the machinery's owner, in-flight, not hoarded.

7.2 **Moot-by-refactor.** Work that a ratified rewrite rebuilds by
construction is not separately fixed. Per-item mootness is settled **at the
constructing wave's close against the actual file-touch set** — never
pre-declared from a plan.

7.3 **Decouple-by-evidence.** Live-exposure items (security, data loss, money)
may be explicitly decoupled from gates and shipped immediately by ruling —
the ruling names the items; "the rewrite supersedes it" never authorizes
deferral of live exposure.

7.4 **N=3 generalization.** Patterns (trackers, scripts, processes) are
promoted into standard/tooling at the third real instance, not the second.
Capture the promotion intent as a work item when N=2 so it isn't carried in
heads.

7.5 **Closure is recorded at every live register.** When a finding/flag is
resolved out-of-band, the resolution is written into each artifact that
actively surfaces it (register row, backlog flag, plan note) in one pass —
a stale "act now" flag in a live document is a defect.

7.6 **Stale-status is a defect.** A doc whose own status line contradicts its
commit history (DRAFT vs ratified) misleads the next reader; flip statuses in
the same change-set as the event they record.

---

## Appendix — current bindings (program-specific; update freely)

- **Program:** the eduagent-build pre-launch umbrella. Roster:
  `_wip/umbrella-program/program-roster.md`.
- **Initiative rows:** `PRG-NN` (roster-local IDs). "Stream 2" = proper name of
  PRG-20 (estate-canon drain) only.
- **Routing rule (current):** audit-finding-class → its `Defer-to-workstream`
  label in `docs/audit/2026-05-29-full-audit/L-gap-delta.md` → that PRG row ·
  harness/pipeline-class → the HH residue triage (operator branch session,
  2026-06-11; re-bind here when its dispositions land — PRG-02 graduated) ·
  memory/doctrine/instruction-surface → PRG-03 · product/learning canon →
  PRG-20 / PRG-21 per glossary bucket · top-down/delivery-layer tooling →
  PRG-04 · fits nothing → unrouted-intake line on the roster.
- **Satellite register:** `L-gap-delta.md` (per-finding home; WPs absorb, point,
  never copy).
- **Boundary nodes (current exports):** HH → `WI-530`/`WI-533` (gates IF W1+
  execution start). IF exports (to be instantiated when first referenced):
  "W1 landed", "W2/W3 authority+PII model landed", "clean-cut tail done".
- **Dogfood instance:** identity-foundation (Phase P, 2026-06-10) — first full
  top-down slice; the IF pattern (tracker + Workstream + direct-to-WP slice) is
  the activation template (§2.1). The **IF W1 shepherd** (kicked off
  2026-06-10) is the first per-Initiative shepherd session (§2.5–2.7).
  **Second instance:** PRG-12 / l10n-a11y (activated 2026-06-11 via the §2.1
  recipe) — tracker `_wip/l10n-a11y/execution-tracker.md`, Workstream "L10n &
  A11y Mobile", WI-621…628; first *parallel* activation alongside a running
  Initiative. **Third:** PRG-15 / errors-api (2026-06-11, same evening its
  gate fired) — `_wip/errors-api/execution-tracker.md`, Workstream "API Error
  Handling", WI-639…641; the recipe is now routine.
- **Generated views:** `dashboard.html` ("Flight Deck") — board / gate-rail /
  field-guide over initiatives × bundles × gates, for Jorn + Zuzka. A **view,
  never a home** (it states so itself); regenerated at umbrella touches; on
  disagreement, roster/Cosmo win. Doubles as the hand-built prototype for
  PRG-04 / WI-590.
- **ZDX top-down embryo:** this document + the roster's proto-epic schema are
  the primary inputs to PRG-04 (Cosmo top-down delivery layer).

## Change log
- **2026-06-14 — v1.2.** §2.5: made the **operator-launched** spawn mechanism for
  shepherd and reviewer sessions an explicit, ratified design rule (with its
  rationale — it is the only mechanism that fully supports the disposable,
  interactive, separate-context/separate-runtime session model; spawning from
  inside the program session would collapse the altitude separation). Confirms a
  prior verbal ruling; the program session authors the kickoff, the operator
  launches. Ruled by Jorn 2026-06-14.
- **2026-06-10 — v1.1.** Added §2.5–2.7 (session model: program session /
  per-Initiative shepherd / executors; disposable-shepherd invariant + kickoff
  brief shape; model tiering by leverage) — agreed at the IF W1 kickoff
  discussion. Appendix: IF W1 shepherd registered as first instance;
  `dashboard.html` registered as a generated view (view-never-home).
- **2026-06-10 — v1.** Extracted and generalized from the planning sessions of
  2026-06-09/10 (vocabulary ruling, reconcile-and-route method, routing rule,
  dependency model, activation gates, operating principles). Ratified by Jorn
  as canonical for the umbrella program and embryo input for PRG-04.
