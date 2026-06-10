# MMT-ADR-0000 — A first-class Decisions (ADR) layer and the repo's documentation-layer model

**Status:** Accepted · 2026-06-03 · **Class:** Meta / process — *constitutional* (governs the ADR system itself, not the product) · **Scope:** repo-wide documentation architecture · **Deciders:** Architect (jjoerg) + Claude

> **Placement.** L2 ADRs live in `docs/adr/` (this change-set relocates them there). The broader `docs/` reorganisation that the full target structure in §I.4 implies — moving canon into `docs/canon/`, draining stray artifacts into `docs/assets/` and `docs/_archive/` — is a deferred follow-up; only the ADR home is settled-and-applied here.

> **Why `0000` / meta note.** This is the repo's **constitutional** ADR — self-referential: the decision that defines what ADRs *are* and the layer model they live in. It is numbered `0000` to signal **primacy, not chronology** (it post-dates `0001`/`0002`; the date carries time, the number carries role). Only the single bootstrapping ADR earns `0000`; every other process decision is normal-numbered. It is a **meta / process** decision about the project's *scaffolding*, not a product-architecture decision — and as such it is the embryo of a future cross-Control-Plane **ZDX** standard, kept **local** to this repo for now; generalising it estate-wide is explicitly out of scope.

## Context

The repo had no decisions layer. Architecturally significant choices — the ones that meet the gate in §II.1 — had no authoritative home, so they accreted in whichever artifact happened to be open: inside `.claude/memory/` (a Claude-only layer, invisible to other agents and to any human who doesn't read it), embedded in `docs/specs` and `docs/plans` as inline "locked decision" blocks, and buried in `architecture.md` prose (including a live, code-cited `ARCH-1…ARCH-26` register). De-duplicated, that was on the order of seventy distinct significant decisions, many recorded in two or three places at once and already drifting where the copies disagreed.

The visible symptom — specs that mix principles, decisions, design, implementation, and planning — is just that: a symptom. The cause is the absent layer. One corner of the repo was already cleanly stratified (a structural ontology as canon, an anchored-spine PRD citing it, decisions captured as ADRs) and served as the template the rest of the repo lacked. This ADR makes that template the repo-wide model.

## Decision

The single load-bearing principle is the **significance gate** (§II.1) — the test for what earns an ADR. Everything else is the model that gate lives in (Part I) and the machinery that keeps the layer honest (Parts II–III).

## Part I — The documentation-layer model

### I.1 The five-layer model

The repo's target state is a five-stratum model plus one cross-cutting layer. Each stratum carries a **discriminating test**, because "extract vs. leave alone" is only decidable when the boundary is sharp.

| Layer | Home | Holds | Discriminating test | Lifecycle |
|---|---|---|---|---|
| **L0 Glossary** | root `CONTEXT.md` + per-area `CONTEXT.md` | nouns, definitions, `_Avoid_` lists | *"Is this defining a term?"* (no rationale, no behaviour) | living |
| **L1 Canon** | `docs/canon/` (§I.4) | the standing *what* — current true state | *"True independent of any one feature's timeline, and ground-truth a new contributor needs?"* | living; updated lockstep when a decision lands |
| **L2 Decisions (ADR)** | `docs/adr/` | the *why* of a significant choice: context / decision / alternatives / consequences | the **significance gate** (§II.1) | **the one immutable layer: append-only, superseded never edited; feeds L1** |
| **L3 Operational** | `docs/specs/`, `docs/plans/`, `docs/runbooks/` | feature definitions, plans, procedures — *linking* to L0/L1/L2 | *"Does this have a completion date after which it's history?"* | ephemeral → archived on ship |
| **L4 Lessons / memory** | `.claude/memory/` | working-style, triage heuristics, transient gotchas | *"Is this about how to **work**, or a transient state — not a durable truth about the **system**?"* | rolling |
| *Cross-cutting (unnumbered):* **Agent doctrine** | root `CLAUDE.md` / `AGENTS.md`, `project_context.md` | — | *"Could this line be a **link** to canon instead of a **copy** of it?"* | thin pointer index |

The L0–L4 numbers are sequential; **Decisions is L2**, placed against canon because it is the *why* behind canon's *what*. **Agent doctrine is deliberately unnumbered** — it is orthogonal, a thin pointer index spanning every stratum, not a rung in the stack.

### I.2 Within L1 — `architecture.md` vs `PRD.md` vs `ux-design-specification.md`

Canon is three documents, each owning one domain; route content by the litmus:

| Canon doc | Domain | Owns | Litmus |
|---|---|---|---|
| `architecture.md` | system / technical | structure, data model & flow, integration + background-job patterns, technical principles/patterns/standards/constraints, **core tech stack**, security model, deployment | *"how the system is built"* |
| `PRD.md` | product | what we build + for whom, capabilities, scope, **FRs**, product-level success metrics & NFR *targets*, product principles | *"what we build and why it matters"* |
| `ux-design-specification.md` | experience / interaction | IA, navigation model, interaction patterns, design system & semantic tokens, a11y standards, voice/copy | *"how it looks, feels, behaves"* |
| `principles.md` | cross-cutting | the principles / invariants catalog — the §II.1 conformance surface; an index *over* the three domain docs, not a fourth domain (see §I.3) | *"is this a binding rule others must follow?"* |

The dividing lines: a **requirement** → PRD; the **technical means** of meeting it → `architecture.md` (+ an ADR if it clears §II.1); the **screen/flow** realising it → UX. For NFRs / quality attributes (the three-way bleed), the **target** lives in PRD (or UX, for experience-quality like a11y), the **architectural means** in `architecture.md` — cross-link, never restate.

`architecture.md` in its purest form holds **outcomes, not whys** — principles, patterns, standards, constraints, the current rule. Inline rationale is allowed, but the moment the *why* is load-bearing or contested it belongs in an ADR and canon carries only the resulting rule. **North-star (aspirational, not retrofitted):** every canon line traces to an ADR beneath it; forward, new canon lands lockstep with its ADR, while legacy canon we cannot trace back is grandfathered, not reverse-engineered into invented ADRs.

**A note on the L1 boundary — the tech stack.** "What tech do we use" splits three ways across two layers and one machine-owned source: the *core stack of record* (the load-bearing product choices, ~10, glacial) is **canon**, in `architecture.md`; the *full dependency inventory* is **not a doc** — it is `package.json` + the lockfile + the Renovate config (machine-owned; mirroring it in prose only drifts against the lockfile); the *version / upgrade policy* (LTS targets, pinning, cadence) is a thin **L3 ops doc** — rules, not lists. Only the core choices are canon.

### I.3 The principles / invariants catalog

The catalog is L1 canon, but a different *kind* of artifact from the three domain docs — a **cross-cutting index over them**, not a fourth domain: its entries point *into* `architecture.md` / `PRD` / `UX`, rather than owning a slice of reality.

**The principles / invariants catalog** (`docs/canon/principles.md`) is the slice of canon the §II.1 significance gate reads against: trigger #1 ("deviates from a documented principle") only has teeth if the principles are written down in one place. The catalog holds cross-cutting invariants **once** (they thread through every concern, so a dedicated home stops every vertical doc from duplicating them), and it is **principles + pointers, never a content mirror**. Each entry is a terse record — a stable **principle ID**, a one-line statement, a pointer to the canon section that elaborates it, and (where they exist) links to the ADR that established it and the guard that enforces it. The durable join between an entry and its elaboration is the **ID, not a heading anchor**: the canon section carries the same ID as a marker, so a heading can be renamed without breaking the link, and the bind is grep-resolvable across catalog, canon, code, and ADR. A clickable anchor is convenience layered on top; the ID is the identity. (The catalog's exact ID scheme and a catalog↔canon parity check are build-time details, not fixed here.)

### I.4 Physical placement

Layers map onto the filesystem **type-first, domain-second** — the tree is a 1:1 image of the model, so `ls docs/` shows the model:

```
repo root
  README.md                      project entry signpost
  CONTEXT.md                     L0 glossary — root anchor (+ per-area CONTEXT.md, distributed)
  CLAUDE.md  AGENTS.md           cross-cutting agent doctrine (lives where the harness loads it)
docs/                            ← root holds only subdirectories; never loose canon
  canon/                         L1 — spine: architecture.md, prd.md, ux-design-specification.md, principles.md
    <domain>/                    L1 — a stream's domain canon, prefix-dropped (first: identity/ — ontology.md, domain-model.md, data-model.md, prd.md)
  adr/                           L2 — decisions (README.md authoring guide + MMT-ADR-*.md)
  specs/                         L3 — feature definitions + acceptance (domain nests within)
  plans/                         L3 — implementation plans
  runbooks/                      L3 — operational procedures
  assets/                        non-doc artifacts: images, mockups, screenshots, diagrams, logos
  _archive/                      retired / tombstoned docs
.claude/memory/                  L4 — lessons / working memory (agent-runtime state, versioned)
```

The rules this encodes:

- **Every layer gets an explicit named directory** — membership is unambiguous (a file *is* canon iff it lives in `canon/`), and a shared root cannot dilute a high-authority layer.
- **Names carry the layer, not numbers.** Directories use stable, conventional, self-describing names (`canon/`, `adr/`, `specs/`); the `L0–L4` numbering stays a conceptual device in this ADR. Rationale: a number in an identifier is justified only when the number *is* the identity (an ADR's number is its durable identity, so ADR files use it) — a layer's identity is its role/name, while the stratum index is a volatile coordinate that would hard-bind the filesystem to a numbering that can change.
- **Pollution gets a sanctioned drain.** A shared docs root rots because junk has nowhere else to go; `assets/` and `_archive/` give it a home so the layer directories stay pure by construction.
- **`docs/` is the umbrella for one reason: a single discovery surface.** All written knowledge co-locates under one tree to grep and browse; the internal subdir discipline (above) is what prevents the pollution — so co-location and cleanliness are both had, without splitting governed layers out to bespoke roots. (L4 memory and agent doctrine live *outside* `docs/`: memory is runtime state read by the harness, and doctrine must sit where the harness auto-loads it.)
- **`_wip/<slug>/` incubates a stream's L1/L3 content; L2 is global from birth.** A stream's canon (e.g. a domain PRD, an ontology) incubates in `_wip/` until it is **ratified and stable**, then folds into `docs/canon/` — *within* the pre-execution runway, not deferred to the clean-cut build (see the 2026-06-08 amendment, "domain canon graduates at ratification, not at clean cut"). A *decision*, once made, does not incubate — it is repo-wide immediately and lives in `docs/adr/`. This is why the ADRs leave `_wip/` now while *churning* domain canon stays.
- **Each directory's `README.md` is its index** — orientation and map in one file. No separate `index.md`; with no static-site build it has no job `README.md` isn't already doing, and Git surfaces `README.md` on browse. (`index.md` is promote-on-demand if a generator is ever adopted.)

### I.5 Doc-chunking is reactive editorial practice, not a decision

Splitting a large canon or spec doc into per-concern files is reversible, low-stakes, and unsurprising — it **fails this ADR's own gate**, so ratifying a "chunking policy" would itself be the manufacture-a-decision anti-pattern §II.1 exists to stop. Chunking is a *reactive* response to demonstrated contention (churn + multiple owners colliding), never a size-triggered mandate — chunking late is cheap, so we wait for evidence rather than predict. The guardrails for when someone does it live in the authoring guide (`adr/README.md`), not here: chunk by concern plus a dedicated cross-cutting chunk; keep a mandatory principle index (the §I.3 catalog); and keep a spec's decision heading and its `MMT-ADR` link in the same file (the ratchet links at file granularity).

## Part II — The decisions layer

### II.1 The significance gate

A decision needs an ADR — and a spec/plan must *spawn* one rather than decide inline — when **any** of these hold. It is a positive significance test, deliberately mechanically-checkable so a first-line agent can apply it without senior taste:

1. **Deviates** from a documented principle, pattern, standard, or constraint — *including the CLAUDE.md "Non-Negotiable Engineering Rules"* (comply-or-explain; the strongest trigger).
2. **Constrains others** — establishes or changes an invariant, contract, or interface future work must follow.
3. **Moves a quality attribute / NFR** (security, privacy, performance, cost, availability, a11y) or changes an FR/AC.
4. **Structural or cross-cutting** — module boundaries, data model / flow, dependencies, public interfaces, or a concern spanning many components.
5. **Selects or replaces a foundational technology or pattern** (construction technique).

**Release valve — decide inline, no ADR:** the choice is local, reversible, *and* conforms to existing principles, and no reader would ask "why this way?" The list is an OR and **defaults to flag it** — when in doubt, it is significant.

*Grounding:* this synthesises Nygard's ADR-significance definition (structure, NFRs, dependencies, interfaces, construction techniques), Architecturally Significant Requirements (Bass / Clements / Kazman), ISO/IEC/IEEE 42010, and TOGAF comply-or-explain — in our own words so it is usable from this text alone, without fetching a standard mid-task.

### II.2 ADRs are first-class, with a lockstep lifecycle

ADRs are a distinct layer, not a subsection of canon. The lifecycle:

- an **ADR records the immutable *why*** — dated, superseded by later ADRs, never silently edited;
- **canon (L1) records the living *what*** — the plain current rule, no need to re-argue it;
- they move in **lockstep**: a single change-set (one commit/PR) lands or supersedes the ADR **and** edits the exact canon/glossary lines it changes. Never one without the other.

### II.3 Promotion — ADR to principle

When an ADR establishes something that should *bind* future work, its **rule graduates up into canon** (`architecture.md`, or the principles catalog) as a living principle, while the ADR remains the dated **why++** (context + alternatives + consequences). Promotion copies the *rule* up and links back; it never duplicates the rationale. An ADR may be born load-bearing (promote on accept) or graduate later once it proves to constrain other decisions. This is the lockstep rule pointed *upward*: canon says what is true now, the ADR says why we chose it.

### II.4 Identifier convention

Format **`MMT-ADR-NNNN`** — zero-padded four digits (`MMT` = MentoMate). The namespace is **domain-agnostic and flat**: architecture, product, and process decisions share one sequence.

### II.5 The ratchet — forward-only enforcement

A home and a convention alone are an empty folder that rots; the trajectory only flips when **new** decisions stop leaking. A forward-only check flags a new `docs/specs/` or `docs/plans/` doc that lands an embedded decision block (a "Decisions / Alternatives / Trade-offs" heading) **without** a linked `MMT-ADR-NNNN`. Today's embedded decisions are grandfathered in a baseline allowlist, so the check bites only new accretion — the same forward-only pattern the repo already trusts (GC1 internal-mocks, `no-clinical-copy`). A genuine false positive is grandfathered via the baseline with a justification. This is the pivot: the model, conventions, and seeding merely make it possible; the ratchet is what keeps the layer from decaying the day after it ships.

## Part III — The legacy `ARCH-N` register

`ARCH-1…ARCH-26` is a pre-existing, **code-cited** architecture-decision register (26 records; ~10 code-comment citations, most in `services/llm/`). It is neither reinvented nor kept as a standing parallel ID space (a permanent dual register would re-create the duplication disease). Instead:

1. **Freeze `ARCH-N`** — closed namespace, no new entries; every new architecture decision is an `MMT-ADR-NNNN`.
2. **Absorb forward** — when an `ARCH-N` is promoted to an ADR, that same change-set migrates its own code comments to the new ID. Citations move with the decision; no permanent alias.
3. **Every `ARCH-N` owes a terminal disposition** (a closing register needs an exit for each entry, not only "promote"):
   - **Promote → ADR** — clears the §II.1 significance gate, still load-bearing.
   - **Obsolete / superseded-by-reality** → **tombstone in place**; no ADR number burned on a retraction.
   - **Plain wrong** → resolve the drift by which side lies: **doc wrong, code right** → write an ADR documenting reality, mark `corrected-by MMT-ADR-00X`; **code wrong** (described unbuilt behaviour) → file a bug, tombstone as `retracted → WI-XXX`.
   - **Never-a-decision** (mechanical) → drop from the register.
   - *Genuinely ambiguous* → not a disposition; a small verification task, entering one of the above once it resolves.
4. **No `ARCH-N` is retired without resolving its code citations** (migrate / repoint / clean the comment) — no dangling pointers. **Retract in place, never silently delete** a cited record.

## Consequences

- **Positive:** significant decisions get a single addressable home; the ratchet flips the trajectory from deteriorating to improving; the lockstep lifecycle prevents future canon-vs-decision drift; the significance gate gives a first-line agent a positive, checkable test instead of a taste-dependent one; previously Claude-only decisions become visible to every agent and human; `ARCH-N`'s code-cited traceability is preserved.
- **Follow-on work this decision creates** (stated as durable consequence, not a plan): the **principles catalog** must be built (today approximated by the CLAUDE.md Non-Negotiable Rules); the legacy `ARCH-N` register must drain to ADRs; the physical `docs/` reorganisation implied by §I.4 (canon into `docs/canon/`, the artifact drains) is pending.
- **Risks & mitigations:** reverse-engineered rationale is lower-fidelity → after-the-fact ADRs are stamped `reconstructed YYYY-MM-DD`, and where the *why* is unrecoverable the decision is recorded plainly rather than invented; the gate mis-set (too low = friction, too high = leaks continue) → the OR-trigger's "default to flag" plus the baselined ratchet calibrate it against real cases.

## Amendment (2026-06-07, architect) — the memory↔canon boundary

**The L4 boundary, stated positively.** The five-layer model (§I.1) defines L4 memory by what it *holds* (working-style, heuristics, transient gotchas) and the agent-doctrine row by a single test ("could this be a **link** instead of a **copy**?"). That test was never lifted to memory itself, so the L4↔L1 boundary lived only *negatively* (the §I.1 discriminating test; the extract-before-cleanup constraint of the Stream-2 backfill). This amendment ratifies the **positive rule**. It opens no new question — it makes the §I.1 model say for memory what it already says for doctrine.

**1. The rule (single source of truth).** Structured canon is master; **memory (`.claude/memory/`) never holds a *copy* of canon.** This is the documentation-layer parallel of the DB-is-master principle in `MMT-ADR-0013` §2 ("Outside the DB we keep only the decision trail … never a second copy of the data") — there the master is the DB, here it is the L1/L2 layers. A memory note that duplicates a decision rots the moment canon evolves: the same drift failure the policy-snapshot reframe fixed, reproduced one layer up.

**2. Memory's positive role — the residue with no other home.** Three categories, and only these:
- **(a) Pointers / navigation** into the documentation index — recall shortcuts that *point at* canon.
- **(b) Non-canon working state** — in-flight / blocked status, session continuity; true *now*, not a durable truth about the system.
- **(c) User / feedback / preference facts** — how to work with the user.

Memory is **not a rung in the §I.1 hierarchy** in the copy-of-knowledge sense — it is an **orthogonal recall cache that points *into* the hierarchy**, the same orthogonality §I.1 already grants agent-doctrine ("a thin pointer index spanning every stratum, not a rung in the stack").

**3. Provenance requirement.** Every retained memory entry must either **(a)** cite the canon doc it points to, or **(b)** be a clearly-typed non-canon working-state / user-fact entry (category 2(b) or 2(c)). An entry that can be linked to **neither** *and* has uncertain provenance is a **cull candidate** (the disposition Phase J executes).

**4. Interim governance — forward-only ratchet (in effect immediately, until Phase J runs the full alignment).** This stops new accretion so Phase J inherits only the *legacy* backlog, mirroring the repo's forward-only-ratchet pattern (GC1 internal-mocks; the §II.5 `decision-adr-link` ratchet):
- **(i)** No new *content-bearing* memory — a durable decision goes to its canonical home (ADR / canon / data-model), never a memory copy.
- **(ii)** Any new memory entry is a **pointer that cites its canon source at creation** (provenance baked in → no future orphans).
- **(iii)** `CLAUDE.md` / `AGENTS.md` stay **pointer-layer** — new canon is **not** inlined into agent-doctrine (the §I.1 cross-cutting test, enforced going forward).
- **(iv)** Cleanup debt noticed in passing is **logged to a Phase-J worklist, not fixed ad hoc.**

**5. Lockstep — this is the rule; the phases are the execution.** This amendment ratifies the *rule only*. The **retroactive** alignment — restructuring existing memories into pointers, culling the un-linkable-and-unprovenanced, reducing agent-doctrine to pointer-layer — is **Phase J** of the identity-foundation roadmap (`_wip/identity-foundation/ROADMAP.md`); the **estate-wide drain** of the same is **Stream 2** (see the §II.5 ratchet and the Consequences "follow-on work"). The rule presupposes a **documentation index** — the thing memory pointers point *at* — which **does not yet exist**; it is seeded by Phase G. Until the index exists, category-2(a) pointers cite the canon doc directly.

**basis:** `MMT-ADR-0013` §2 (DB-is-master — the source-of-truth precedent this parallels); §I.1 (the five-layer model + the agent-doctrine "link not copy" test this lifts to memory); §II.5 (the forward-only ratchet pattern the interim governance mirrors); `_wip/identity-foundation/ROADMAP.md` cross-cutting threads + the 2026-06-07 Phase-J re-scope decision-log entry (the threads this amendment encodes).

## Amendment (2026-06-08) — `docs/registers/` as an L3 operational sibling

**The addition.** `docs/registers/` is a new **type-named L3 directory** for **governed data masters + their immutable provenance trails** — interim homes for policy-engine data that has no runtime/DB home yet, each master paired with the per-change decision/vetting trail. Placement follows §I.4 exactly: type-first (`registers/`), domain-second (e.g. `registers/llm-models/`). First instance: `registers/llm-models/` — the vetted model set + its vetting trail, backing `MMT-ADR-0014`. A future `registers/policy-cells/` will host the policy matrix master + its decision trail, backing `MMT-ADR-0013`.

**Why not a new domain root.** `registers/` names an artifact *type* (a register), not a domain — so it does not violate §I.4's "no bespoke domain roots" rule. Contrast a rejected `docs/llm-routing/`, which would have been a domain root; `registers/` is the type-layer equivalent of `specs/` or `runbooks/`.

**Why not inside `specs/`, `plans/`, or `runbooks/`.** A register is neither a feature definition (specs), an implementation plan (plans), nor a procedure (runbooks). It is governed *data* plus its provenance — an artifact type §I.4's original enumeration did not anticipate.

**Relationship to canon and the DB-is-master principle.** A register is **not canon** (L1). Canon points *at* it; it never copies the register's volatile contents. This is the documentation-layer image of `MMT-ADR-0013` §2 ("Outside the DB we keep only the decision trail … never a second copy of the data"): the register is the interim source of truth for its data; the trail records only the *why/when/who-verified* of each change. When the policy-engine DB exists, the master migrates in and the register folder becomes the historical provenance archive.

**This is editorial, not a gated decision.** Per §I.5, applying §I.4's existing type-first principle to a new artifact type is *reactive editorial practice that fails the significance gate*. This amendment **records** the sibling for visibility and to keep the §I.4 model current; it is **not** itself a new significance-gated decision. No fresh ADR-class choice was made — the §I.4 type-first rule already governs the placement; this amendment is the model update that the rule demands when a new type arrives.

**basis:** §I.4 (type-first, domain-second placement — the principle being applied); §I.5 (folder structure is reactive editorial, not a gated decision); `MMT-ADR-0013` §2 (DB-is-master — the source-of-truth discipline the register pattern mirrors); `MMT-ADR-0014` (router/vetting split — the ADR that needs the model master); `docs/registers/README.md` (the artifact this amendment describes).

## Amendment (2026-06-08, architect) — domain canon graduates at *ratification*, not at *clean cut*

**What changes.** §I.4's incubation rule said a stream's L1 canon "incubates in `_wip/` until its **clean cut**, then folds into `docs/canon/`." This amendment moves the graduation trigger **earlier**: a stream's domain canon folds into `docs/canon/` **as soon as it is ratified and stable**, *within* the pre-execution runway — not deferred to the clean-cut build. The §I.4 line is edited in lockstep. Unlike the registers amendment above, this is **not** a §I.5 editorial application of an existing rule — it **changes** a placement rule (significance triggers #2 *constrains others* and #4 *structural*), so it is architect-ratified.

**1. Why "clean cut" was too late.** The original trigger guarded against promoting canon for work that might be cut or rewritten before it ships. For a **pre-launch clean-cut migration** that risk is absent: the domain model is ratified *and certain to be built* (no flag, no alternative, no V0/V1 parallel run — `MMT-ADR-0012`). The caution the rule encoded does not apply to a stream whose target model is already locked.

**2. Why deferral actively harms the runway.** Graduation is not neutral-to-defer. The **documentation index** (the boot-flow linchpin) and the **L4 memory-pointer layer** (the 2026-06-07 amendment) both exist to hold **durable references into canon**. If canon is still in `_wip/` when they are built, every reference targets a path known to be temporary — which rots at the eventual move, forcing either rework or a runway-long window of knowingly-stale references *in the linchpin itself*. Promoting canon at ratification lets these references be born pointing at the permanent home.

**3. The new trigger is observable, and incubation still does its job.** "Ratified" is already tracked — a stream marks its domain/data model ratified as it locks each (the identity-foundation runway's Phase D/E). Incubation is **not abolished**, only **stopped at stability instead of over-extended to the build**: churning canon still incubates in `_wip/`; the rule merely stops keeping *settled* canon out of its authoritative home for the rest of the runway. Post-graduation, any change a later phase forces (e.g. an audit finding) is ordinary lockstep canon maintenance in `docs/canon/`.

**4. Scope.** This governs **L1 domain canon** (a stream's PRD / ontology / domain + data model). L2 decisions are unchanged (global from birth → `docs/adr/`). L3 stream ops docs follow their own promotion into `docs/specs|plans|runbooks` and are out of scope here. The trigger **generalises to every stream** going forward, not just identity-foundation.

**5. Lockstep — rule here; execution scheduled.** This amendment ratifies the *rule* and edits the §I.4 line. The **first execution** is the identity-foundation runway: its four ratified domain-canon docs (`identity-ontology.md`, `domain-model.md`, `data-model.md`, `identity-foundation-prd.md`) graduate to `docs/canon/` at the **front of Phase J**, *before* J's memory-pointer restructure, so those pointers target final paths (`_wip/identity-foundation/ROADMAP.md` Phase J). The loose-root estate-canon drain (J step (c)) remains a separate operation.

**basis:** §I.4 (the incubation rule being revised — the `_wip/` → `docs/canon/` graduation); §I.1 + the 2026-06-07 memory↔canon amendment (the documentation index + memory-pointer layer whose durability motivates the earlier trigger); `MMT-ADR-0012` (the pre-launch one-time baseline reset — the clean-cut certainty that removes the "might be cut" risk); `_wip/identity-foundation/ROADMAP.md` (the runway that schedules the first execution at front-of-J).

## Amendment (2026-06-08, architect) — no document is the sole system of record

**The guard.** Canon (L1, the living *what*) and ADRs (L2, the immutable *why*) are **distinct layers that move in lockstep** (§II.2). **No ADR, canon document, or agent-doctrine line asserts itself as the sole or authoritative system of record to the exclusion of the others.** A doc that claims to be the *only* record re-creates the duplication-and-drift disease this ADR exists to cure, by denying the lockstep relationship that keeps the *what* and the *why* in sync.

**Why this is recorded, not merely implied.** §II.2 already *describes* the lockstep relationship, but never stated the negative invariant — and the absence was load-bearing: `MMT-ADR-0016` (pre-repurpose) carried a line asserting "ADRs are the decision system of record — there is no `architecture.md` register to sync," which diverged in essence from this ADR's model. That line was removed when `0016` was repurposed (2026-06-08), so the **instance is resolved**; this amendment records the **guard** so a future ADR cannot re-introduce it. The canon-authorship process this protects is written up operationally in `docs/adr/README.md` § "How canon is authored."

**basis:** §I.2 (canon = the *what*, the ADR north-star); §II.2 (the lockstep lifecycle this makes non-negotiable); the 2026-06-07 `_wip/identity-foundation/ROADMAP.md` canon-authorship thread (the divergence this closes); identity-foundation Phase I-c (the runway step that authored it).

## Amendment (2026-06-08, architect) — domain-canon sub-layout under `docs/canon/`

**What changes.** §I.4's tree showed `docs/canon/` holding a flat set of spine docs. This amendment fixes how a **stream's domain canon** sits under `docs/canon/`: the **estate spine** (`architecture.md`, `PRD.md`, `ux-design-specification.md`, `principles.md`) stays at the **`docs/canon/` root**, and a stream's domain canon lives in a **per-domain subfolder `docs/canon/<domain>/`** (first instance: `docs/canon/identity/`). The §I.4 tree is edited in lockstep. This applies §I.4's existing **type-first, domain-second** rule one level deeper (canon is the type; the domain nests within) — the same nesting §I.4 already grants `specs/` ("domain nests within").

**The rules it adds.**
- **Stream domain canon is standing peer canon**, indexed by `principles.md` / `docs/INDEX.md` — it is **not** merged into the spine docs, and the spine is the cross-cutting index *over* it, not its container.
- **Filenames inside a domain folder drop the domain prefix** — the folder supplies the scope (so `identity-ontology.md` → `docs/canon/identity/ontology.md`). A doc whose home is `docs/compliance/` (a sibling type directory, not a `canon/<domain>/` folder) keeps its scoping prefix.
- This **refines** the §I.4 physical-layout rule and the "graduates at ratification" amendment above; it does **not** change the five-layer model.

**Significance.** Like the `docs/registers/` amendment, this is the §I.4 type-first rule applied to a sub-case the tree hadn't yet shown explicitly. It is recorded for visibility and to keep the §I.4 model current; the placement was already governed by the existing rule.

**basis:** §I.4 (type-first, domain-second — the principle applied one level deeper); §I.5 (folder structure is reactive editorial); the "graduates at ratification" amendment above (the trigger this refines the layout for); `_wip/identity-foundation/ROADMAP.md` Phase J(0) (the first execution — the identity domain canon graduating to `docs/canon/identity/`).

## Alternatives considered

1. **Tidy specs (separate concerns within them), no decisions layer.** Rejected — treats the symptom; decisions still have nowhere to go and keep leaking.
2. **Consolidate cleanly-layered docs into a monolith.** Rejected — kills the cite-the-canon mechanic and the ability to lock structural canon while behaviour docs churn.
3. **ADRs as a subsection inside each canon doc.** Rejected — fails the ratchet test; you cannot cheaply guard "is the *why* in the right section of the right doc," but you can guard "every contested decision has an `MMT-ADR` file."
4. **Big-bang repo-wide backfill at adoption.** Rejected — a mass edit is risky and unnecessary; the forward-only ratchet flips the trajectory without it, and the legacy drains incrementally.
5. **`ARCH-N` as a permanent alias (standing dual register).** Rejected — a path-dependent dual-ID space that re-creates the duplication disease; freeze + migrate-forward yields a single canonical ID space.
6. **Rename all `ARCH-N` now in one pass.** Rejected — unnecessary; absorb-forward amortizes the comment edits per-decision, and obsolete `ARCH-N` should not consume ADR numbers at all.
7. **Keep the conjunctive triple (hard-to-reverse ∧ surprising ∧ trade-off) as the gate.** Rejected — a conjunction is a *suppressor* that presumes the very architectural judgment a first-line agent lacks, silently letting significant-but-not-obviously-surprising decisions through. Replaced by the §II.1 significance OR-trigger; the triple's surviving content becomes the release valve.
8. **Ratify a doc-chunking policy in this ADR.** Rejected — chunking is reversible, low-stakes editorial that fails this ADR's own gate; the real decision behind it, the principles catalog (§I.3), is what's ratified.
