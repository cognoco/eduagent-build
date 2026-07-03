DOC: docs/specs/2026-06-27-felt-knowing-loop.md (2026-06-27, 27K)

CLAIMS:
- Gap 1: V2 Subject Hub notes section is read-only in production — `SubjectHub.tsx` never wires `onAddNote` into the write-ready `SubjectHubNotesSection.tsx`.
- Gap 2: Freeform (topicless) sessions surface an LLM-emitted "Write note" CTA that structurally cannot succeed because `topic_notes.topicId` is NOT NULL — the "lying button" from the learning-flow deep-dive (C1).
- Gap 3: the mentor never cites the learner's own kept notes/bookmarks in ordinary (non-review) conversation — zero `evidence_links`/`LearnerSource` substrate exists.
- F1/F2: wire writable + editable + deletable hub notes, proxy-gated on delete.
- F3/F4: replace the impossible freeform note CTA with a working `createBookmark` affordance that lands in the journal merged list.
- F5/F6/F7: build `evidence_links` + `LearnerSource` substrate and surface citation chips in live conversation, flag-gated (`EVIDENCE_CITATION_ENABLED`), eval-gated.

TECH VALIDITY:
- Gap 1 claim is STALE as of spec-write date but the spec is accurate for 2026-06-27 — reality moved after. `SubjectHub.tsx:311` (`apps/mobile/src/app/(app)/subject-hub/[subjectId]/index.tsx:311`) now passes `onAddNote={handleAddNote}`, wired in commit `7a31dcd70` "feat(mobile): writable subject-hub notes for felt-knowing loop (WI-1118) (#1626)" — landed after this spec, explicitly executing Flow 1. The spec's Gap 1 description is dead; F1 is done.
- Gap 2 claim partially inaccurate against current code: the static banner CTA (`SessionFooter.tsx:70-88`, gated `notePromptOffered && topicId`) never renders in a topicless freeform session because it requires `topicId` truthy — so the "banner that lies" doesn't reproduce today. But a second, unconditional entry point does: the "Add note" quick-chip (`SessionAccessories.tsx` `SessionToolAccessory`, wired via `session/index.tsx:1388` `onAddNote={() => setShowNoteInput(true)}`, always rendered when `conversationStage === 'teaching'`, which freeform reaches after 2 user turns per `session-types.ts:330-333`) sets `showNoteInput=true`, but `SessionFooter`'s actual note-input UI only mounts when `topicId` (i.e. `noteTopicId`, `session-derived-state.ts:68-78`) is truthy — and `noteTopicId` never resolves from a topicless freeform session (only from `routeTopicId`/`transcriptTopicId`/`activeSessionTopicId`, none populated). Net effect: tapping "Add note" in freeform is a silent no-op, not an error-alert lie, but it is still a live, reachable, broken CTA in the V2 shell today.
- Gap 3 claim CONFIRMED current: zero repo hits for `evidence_links`, `LearnerSource`, `learnerKeptContext`, `EVIDENCE_CITATION` across `apps/api`, `apps/mobile`, `packages/database`, `packages/schemas`.
- `validateNoteDraft` open item confirmed still unwired: `apps/api/src/services/notes.ts:240-247` comment states no production path calls it — correctly scoped out of this loop per the spec's own Open Items (tracked as WI-1490, not in this row).

IMPLEMENTED:
- F1 (create): complete. `apps/mobile/src/app/(app)/subject-hub/[subjectId]/index.tsx:47-59,311` wires `handleAddNote` → `useCreateNote`, with failure alert + rethrow for retry.
- F2 (edit/delete + proxy gate): none. No `onEditNote`/`onDeleteNote`/`updateNote`/`deleteNote` wiring found in `SubjectHub.tsx`, `SubjectHubNotesSection.tsx`, or the route file — user-visible: hub notes can be created but never edited or deleted from the V2 Subject Hub.
- F3 (freeform keep → bookmark): none. No `createBookmark` call exists on the freeform keep path; the only "keep" affordance in freeform is the broken Add-note quick-chip described above. User-visible: tapping "Add note" in a freeform session after 2+ turns does nothing.
- F4 (bookmark lands in journal): none (depends on F3, which is unbuilt).
- F5/F6/F7 (citation substrate + surfacing): none — zero code.

CANDIDATE WIs:
- WI-1450 (writable notes in V2 Subject Hub) — fate: **kill** (superseded). F1 is fully shipped (`onAddNote`/`useCreateNote` wired, error-alert + retry). F2 (edit/delete + proxy gate) is genuinely open but is a narrower scope than WI-1450's title implies — recommend closing WI-1450 as superseded-by-shipped-code and, if F2 is wanted, capturing a fresh narrower item ("wire edit/delete on V2 Subject Hub notes with proxy-delete gate") rather than reusing this WI's stale premise.
- WI-1451 (broken 'keep this' CTA) — fate: **adopt**, description needs a one-line correction. The underlying defect is real and reachable in the V2 shell today (silent no-op tap on the "Add note" quick-chip in freeform, not the alert-lying banner the WI text describes — the banner is already `topicId`-gated). Recommend adopting with updated Found-In pointing at `SessionAccessories.tsx`/`session/index.tsx:1388` + `session-derived-state.ts:68-78`, not the old banner framing.
- WI-1452 (evidence-citation substrate, F5-F7) — fate: **adopt**, but flag as large/multi-slice. Confirmed zero substrate exists; this is real, unstarted work spanning a migration (owned by the sibling review-continuity slice 2a spec, not this row), a new service, prompt/envelope changes, and eval-gating. Scope this WI as "sequence/execute the review-continuity slice 2a substrate + Flow 3 surfacing" and consider splitting F7 (substrate) from F5/F6 (injection/render) given the eval-gating and cross-spec coordination requirement.

VERDICT: partially-implemented (F1 shipped, F2/F3/F4 open, F5-F7 wholly unbuilt) — the document itself is still broadly valid as a build guide for the remaining gaps, but is stale on Gap 1 and imprecise on the exact mechanism of Gap 2's live bug.

MVP RECOMMENDATION: split by flow.
- F2 (edit/delete) — **in**, small, closes an asymmetry (learners can create notes but never fix or remove them) that will generate support friction quickly. Low effort given F1's plumbing already exists.
- F3/F4 (freeform keep-as-bookmark) — **finish-or-hide**. A visibly broken, silently-failing tap target in a live user flow is worse than no affordance; either wire the bookmark path (cheap — no schema change, `createBookmark` already exists) or remove the "Add note" quick-chip from freeform sessions until it is wired. Do not ship MVP with a dead button reachable today.
- F5-F7 (evidence citation) — **out** of MVP. This is the "felt payoff" polish layer sitting on top of substrate not yet even decided-and-built by its owning spec (review-continuity slice 2a); it is speculative relative to Config T's Google-Play/RevenueCat-Plus-only north star and carries its own eval-gate and cross-spec coordination cost. Revisit post-launch once slice 2a ships.

CONFIDENCE: high — verified F1 wiring, F2 absence, F3/F4 absence, and F5-F7 absence directly against current `main`, including the exact reason the freeform CTA fails (topicId gating chain), not just the spec's framing.

Zuzka questions:
1. Given F1 already shipped independently of this spec, should WI-1450 be closed as superseded, or is there appetite for a narrower "notes edit/delete" WI carved out of it?
2. Is the "Add note" quick-chip in freeform sessions acceptable to hide (fast, zero-risk) as an interim fix vs. wiring the bookmark replacement (the spec's preferred fix, also cheap) before whichever ships first — MVP freeze or launch?
3. Should F5-F7 (evidence citation) be formally deferred post-MVP now, given it depends on review-continuity slice 2a which is itself decided-not-built?
