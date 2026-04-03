# Epic 7 + Epic 8 Code Review Findings

Date: 2026-04-02
Source: extracted from the retired mixed gap-analysis document on 2026-04-02

## Status

This is a review snapshot, not an active gap tracker.

The main open areas still called out here are:

### Epic 7

- Prerequisite graph persistence is still missing. The current curriculum model is flat and does not store prerequisite edges, edge state, or prerequisite context.
- Curriculum sequencing is still `sortOrder`-based rather than prerequisite-aware.
- Skip/restore still works at whole-topic level instead of soft-skipping prerequisite edges.
- Graph-aware coaching and unlock-specific celebration/card behavior are still absent.
- The learner-facing concept-map, per-edge feedback, and prove-it override flows are still doc-only.

### Epic 8

- Speech-to-text wiring still looks incomplete. The review noted that transcript state was not clearly being updated from native recognition events.
- Session start still does not persist a voice/text `input_mode` on the session model or start contract.
- The main learner flow still lacks the explicit session-start voice choice from the Epic 8 stories.
- VoiceOver/TalkBack coexistence work remains open.
- Voice playback exists, but pause/resume, haptics, and accessibility-specific fallback handling were still flagged as partial.

## Notes

- Voice playback, replay, and speed controls are materially present.
- The original detailed evidence lived in `docs/analysis/epics-vs-code-gap-analysis.md`, which was retired because it had become a stale mixed document.
