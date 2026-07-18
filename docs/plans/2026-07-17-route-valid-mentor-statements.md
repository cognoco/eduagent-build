---
title: Route Valid Mentor Statements — Implementation Plan
date: 2026-07-17
profile: code
work_items: [WI-2094]
spec: _wip/mvp-roadmap/refinements/refine-BID-13-mentor.md
status: complete
---

# Route Valid Mentor Statements — Implementation Plan

**Goal:** Ensure every enabled learner Mentor submission produces an observable result while preserving closed-catalog jumps and existing question-to-freeform routing.
**Approach:** Drive the change through `LearnerMentorScreen` component behavior. Extend the deterministic matcher so substantive declaratives and explicit pedagogical requests become Mentor turns while short, ambiguous, unsupported-catalog, and unmatched navigation-style inputs remain uncertain; render a revisioned clarification for the uncertain result, explicitly announce each revision on iOS, and retain the polite live-region path without a duplicate explicit announcement on Android. Consume the native window width to give the inline input a compact 360px layout contract without changing supporter/person dispatch or Challenge behavior.

## Scope

In scope:
- `apps/mobile/src/lib/bar-intent-match.ts` — distinguish substantive declaratives from uncertain navigation/ambiguity without broadening the closed route catalog.
- `apps/mobile/src/lib/bar-intent-match.test.ts` — cover pedagogical requests, genuine navigation commands, explicit catalog jumps, and modified unsupported destinations at the matcher boundary.
- `apps/mobile/src/app/(app)/mentor.tsx` — route matcher outcomes and render learner-scope clarification state.
- `apps/mobile/src/app/(app)/mentor.test.tsx` — behavior-first coverage at the input/send/navigation boundary, including the real 360px layout interaction and repeated iOS announcement; retain its three GC6 Pattern A partial mocks with specific GC1 reasons.
- `docs/evidence/WI-2094/` — preserve the original immutable baseline/candidate/revert/restore proof and add rework-cycle raw RED/GREEN/REVERT/RESTORE outputs.
- `.workitem-artifacts/WI-2094/completion-summary.md` and `.workitem-artifacts/WI-2094/evidence.json` — AC-mapped completion drafts for the shepherd.
- This plan.

Out of scope:
- `MentorScreen` supporter-hub/person dispatch and shared setup.
- `SupportHubMentorTab`, session creation/persistence, Challenge Round behavior, and `WI-2112` challenge-mode routing.
- Batch properties, PR creation/merge, Cosmo completion, and cleanup.

## Tasks

- [x] T1: Add rework boundary regressions before production changes — done when focused Jest fails against reviewed production for exactly the missing behavior: `show me how photosynthesis works` does not yet preserve exact freeform `rawInput`; `progress report`, `journal entries`, and `subjects list` do not yet stay on clarification/closed-catalog handling; the 360px case does not yet observe a component-consumed compact layout; repeated clarification revisions do not yet call the repository announcement path on iOS; and Android still receives duplicate explicit announcements in addition to its polite live region. Existing tests continue to characterize genuine navigation commands, literal and named catalog jumps, questions, arrow press, keyboard submit, and edit-then-submit.
- [x] T2: Implement the minimum learner-only routing, clarification, and layout behavior — done when T1 passes using this concrete flow:

  ```text
  matchBarIntent(rawInput):
    trimmed = trim(rawInput); normalized = normalize(trimmed)
    if empty/short -> uncertain(trimmed)
    if literal ID route matches -> jump(existing closed-catalog deep link)
    if a unique name-index route matches AND input is not question/pedagogical -> jump(existing deep link)
    if question-shaped OR /^show me how\b/ -> mentor(trimmed)
    if navigation-command-shaped OR bare unsupported target
       (progress[ report] | journal[ entries] | subjects[ list] | library | more)
       -> uncertain(trimmed)
    return mentor(trimmed)

  LearnerMentorScreen submit(result):
    jump      -> clear clarification; pushNowDeepLink(existing catalog mapper)
    mentor    -> clear clarification; push freeform session with rawInput=result.text
    uncertain -> set { input: result.text, revision: previousRevision + 1 }

  LearnerMentorScreen clarification/layout:
    width = useWindowDimensions().width
    horizontalPadding = width <= 360 ? 12 : 20
    when clarificationRevision is defined/changes AND Platform.OS == ios:
      useAnnounce()(clarificationLabel + submitted input)
    render the same visible revision-keyed polite live region on every platform
    keep input/send inside ScrollView
  ```

- [x] T3: Preserve and extend Bug regression evidence honestly — done when the original immutable RED/GREEN/REVERT/RESTORE files and SHA matrix are unchanged, rework-cycle raw outputs record pre-fix RED, post-fix GREEN, production-only REVERT, and RESTORE, and the report distinguishes original committed proof from rework working-tree proof without claiming an uncreated commit.
- [x] T4: Verify the complete rework surface with every command below — done when each exits zero (the focused RED command is expected nonzero only at T1 before production changes), the 360px command names and passes the interactive compact-layout case, and non-mutating Cosmo validation reports every check `PASS`:

  ```bash
  rtk pnpm exec jest --runTestsByPath "$PWD/apps/mobile/src/lib/bar-intent-match.test.ts" --runInBand --no-coverage --testNamePattern 'pedagogical|unsupported destination|navigation|catalog'
  rtk pnpm exec jest --runTestsByPath "$PWD/apps/mobile/src/app/(app)/mentor.test.tsx" --runInBand --no-coverage --testNamePattern 'photosynthesis|unsupported destination|small-screen-360|clarification'
  rtk pnpm exec jest --runTestsByPath "$PWD/apps/mobile/src/app/(app)/mentor.test.tsx" "$PWD/apps/mobile/src/components/mentor/MentorInputBar.test.tsx" "$PWD/apps/mobile/src/lib/bar-intent-match.test.ts" "$PWD/apps/mobile/src/lib/bar-intent-match.adversarial.test.ts" --runInBand --no-coverage
  rtk pnpm exec jest --runTestsByPath "$PWD/apps/mobile/src/app/(app)/mentor.test.tsx" --runInBand --no-coverage --testNamePattern 'small-screen-360'
  rtk pnpm exec nx run @eduagent/mobile:typecheck
  rtk pnpm exec nx run @eduagent/mobile:lint
  rtk pnpm prepush
  rtk pnpm format:check
  rtk git diff --check
  rtk bun /home/vetinari/.codex/plugins/cache/zdx-marketplace/cosmo/0.8.2/skills/execute/execute.ts complete .workitem-artifacts/WI-2094 green --validate
  ```

- [x] T5: Audit evidence and prepare handoff — done when `splitAcItems` output is recorded, every manifest claim uses a valid ordinal and a grammar-compatible resolvable pointer, GC1 reasons state why each real hook/context cannot run in this isolated route test while the GC6 partial-mock shape remains intact, the final commit file set is explicit, and the diff stays inside scope. Commit and explicit branch push then use the repository commit workflow without PR or lifecycle completion.

## Tests

- T1: The first two focused commands in T4, captured before production edits.
- T2: Repeat both focused commands after the matcher and learner-screen changes.
- T3: Run the same focused rework command for GREEN, production-only REVERT, and RESTORE; retain the raw JSON outputs beside the original immutable evidence.
- T4: Run every command listed inline in T4; no verification step is delegated to an external/live brief.
