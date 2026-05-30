# Workflow-1 Audit — Hardcoded User-Visible Strings (i18n bypass)

> Generated 2026-05-30 by the `i18n-hardcoded-string-audit` workflow (37 subagents, find→adversarial-verify pipeline over 19 file-shards). **Read-only audit — no source files were modified.**

## What this audits

CLAUDE.md § *UI strings hygiene → Known gap* states: hardcoded English literals in JSX (e.g. `<Text>Add child</Text>`, `label="Continue"`) bypass i18n entirely and render English to every locale, with **no automated guard today**. This audit enumerates that gap across the full mobile UI surface so the planned Phase 3 baseline-allowlist ratchet has a concrete starting inventory.

**Scope:** all 265 non-test `.tsx` files under `apps/mobile/src` (screens + shared components). This is the full extent of the documented *JSX* gap. Imperative strings in plain `.ts` files (`Alert.alert`, toast, thrown errors) are a related but distinct class and are **not** covered — see *Out of scope* below.

**Signal:** `JsxText` (text between tags) and user-facing string-literal props (`label`, `title`, `placeholder`, `header`, `accessibilityLabel`, etc.). Excluded as non-violations: anything already in `t(...)`, `testID`/keys/icon-names/routes, style/token/enum values, `console`/`throw`/comments, and dev-only/`+html.tsx`/animation-celebration brand text.

## Headline numbers

| Metric | Count |
|---|---:|
| Candidates flagged by finders | 993 |
| **Confirmed violations** (verifier-upheld) | **960** |
|   High severity (primary visible copy) | 694 |
|   Medium (placeholders, helper, a11y labels) | 254 |
|   Low (edge / possibly-dynamic) | 12 |
| Rejected by verifier (false positives) | 33 |
| Files affected | 92 / 265 |

Verifier rejection rate: 3.3% of finder candidates were thrown out on independent re-read — see [`rejected.md`](./rejected.md).

By signal kind: `jsx-text` 507, `prop` 453.
Top offending props: `accessibilityLabel` 200, `label` 95, `title` 35, `placeholder` 24, `message` 24, `description` 20.

## Violations by area

| Area | High | Medium | Low | Total |
|---|---:|---:|---:|---:|
| screens: app-root | 110 | 39 | 1 | 150 |
| screens: topic | 85 | 16 | 1 | 102 |
| screens: (auth) | 79 | 16 | 1 | 96 |
| screens: shelf | 51 | 20 | 0 | 71 |
| screens: subscription.tsx | 55 | 6 | 1 | 62 |
| components: session | 14 | 36 | 3 | 53 |
| screens: pick-book | 35 | 9 | 0 | 44 |
| components: library | 17 | 21 | 0 | 38 |
| components: progress | 27 | 10 | 0 | 37 |
| screens: my-notes | 27 | 9 | 0 | 36 |
| components: common | 24 | 6 | 1 | 31 |
| screens: child | 19 | 6 | 2 | 27 |
| screens: session | 18 | 6 | 0 | 24 |
| components: home | 10 | 13 | 0 | 23 |
| screens: _components | 14 | 7 | 0 | 21 |
| screens: quiz | 12 | 8 | 1 | 21 |
| components: session-summary | 18 | 2 | 0 | 20 |
| components: mentor-memory-sections.tsx | 14 | 0 | 0 | 14 |
| components: quiz | 9 | 5 | 0 | 14 |
| screens: _subscription | 12 | 1 | 0 | 13 |
| components: feedback | 9 | 4 | 0 | 13 |
| components: tell-mentor-input.tsx | 8 | 4 | 0 | 12 |
| hooks/use-celebration.tsx | 8 | 0 | 0 | 8 |
| components: ClerkGate.tsx | 5 | 2 | 0 | 7 |
| components: memory-consent-prompt.tsx | 5 | 2 | 0 | 7 |
| components: parent | 5 | 1 | 0 | 6 |
| components: chrome | 2 | 2 | 0 | 4 |
| components: onboarding | 1 | 1 | 0 | 2 |
| screens: _layout.tsx | 1 | 0 | 0 | 1 |
| screens: dictation | 0 | 1 | 0 | 1 |
| screens: progress | 0 | 0 | 1 | 1 |
| components: coaching | 0 | 1 | 0 | 1 |

## Top 25 files by violation count

| File | High | Med | Low | Total |
|---|---:|---:|---:|---:|
| `app/(app)/shelf/[subjectId]/book/[bookId].tsx` | 51 | 20 | 0 | 71 |
| `app/session-summary/[sessionId].tsx` | 49 | 14 | 0 | 63 |
| `app/(app)/subscription.tsx` | 55 | 6 | 1 | 62 |
| `app/(app)/topic/[topicId].tsx` | 44 | 8 | 1 | 53 |
| `app/(auth)/sign-in.tsx` | 40 | 9 | 0 | 49 |
| `app/(app)/topic/relearn.tsx` | 38 | 8 | 0 | 46 |
| `app/(app)/pick-book/[subjectId].tsx` | 35 | 9 | 0 | 44 |
| `app/(auth)/sign-up.tsx` | 24 | 4 | 1 | 29 |
| `app/(app)/my-notes/[kind].tsx` | 19 | 8 | 0 | 27 |
| `app/session-transcript/[sessionId].tsx` | 18 | 3 | 0 | 21 |
| `app/create-profile.tsx` | 9 | 11 | 0 | 20 |
| `components/session-summary/SessionSummaryLibraryFilingControls.tsx` | 18 | 2 | 0 | 20 |
| `app/(auth)/forgot-password.tsx` | 15 | 3 | 0 | 18 |
| `app/(app)/quiz/results.tsx` | 11 | 6 | 0 | 17 |
| `components/common/AnalogyDomainPicker.tsx` | 15 | 1 | 0 | 16 |
| `components/home/LearnerScreen.tsx` | 8 | 7 | 0 | 15 |
| `components/progress/SubjectProgressRow.tsx` | 10 | 5 | 0 | 15 |
| `components/mentor-memory-sections.tsx` | 14 | 0 | 0 | 14 |
| `components/quiz/GuessWhoQuestion.tsx` | 9 | 5 | 0 | 14 |
| `app/(app)/session/_components/SessionScreenChrome.tsx` | 8 | 5 | 0 | 13 |
| `components/feedback/FeedbackSheet.tsx` | 9 | 4 | 0 | 13 |
| `app/profiles.tsx` | 8 | 4 | 0 | 12 |
| `components/tell-mentor-input.tsx` | 8 | 4 | 0 | 12 |
| `app/(app)/_components/save-wizard/ProfileBasicsStep.tsx` | 7 | 4 | 0 | 11 |
| `app/preview/value-prop.tsx` | 9 | 1 | 1 | 11 |

## Files in this report

- [`findings.md`](./findings.md) — all 960 confirmed violations grouped by file (line, kind, literal, severity, suggested key, reason).
- [`findings.json`](./findings.json) — machine-readable full dataset (violations + rejected) for downstream tooling / Phase 3 baseline generation.
- [`proposed-baseline.json`](./proposed-baseline.json) — a candidate allowlist (per-file counts + flat entries) shaped for a future ratchet. **A proposal, not wired into CI.**
- [`rejected.md`](./rejected.md) — the 33 finder candidates the verifier rejected, with reasons.

## How to act on this

1. This is an *inventory*, not a fix. Per CLAUDE.md § *Sweep when you fix*, a fix PR should pair a forward-only guard (the Phase 3 `JsxText`/`StringLiteral` ratchet) with a baseline seeded from `proposed-baseline.json`, so new violations fail CI while the existing 960 burn down over time.
2. High-severity items are primary visible copy (button labels, headings, body text) — highest user impact, best first migration targets.
3. `suggestedKey` values are inferred starting points, not authoritative; reconcile against existing `en.json` namespaces before adding keys.

## Out of scope (possible follow-up)

- **`.ts` imperative strings:** `Alert.alert(...)`, toast/snackbar calls, and user-surfaced thrown errors in non-`.tsx` files. Not JSX, not covered by the Phase 3 ratchet, not scanned here.
- **Dynamic-key edge cases:** strings assembled at runtime that a static scan under-reports.

## Method & caveats

- Two-stage pipeline: a *finder* per shard proposed candidates; an independent *verifier* re-opened each file and upheld or rejected it (default-reject bias). Both stages ran on `sonnet`.
- LLM-based static reading: line numbers and counts are high-confidence but not guaranteed exact; treat as a strong inventory, not a compiler.
- The verifier deduped a few same-literal repeats (counted as rejected with an explanatory reason).

