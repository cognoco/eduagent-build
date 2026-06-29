**What was done:** Fixed the SubjectHub empty-state bug where a subject with zero chapters rendered the search no-results copy even when the learner had not searched.

**What changed:** `SubjectHub` now branches on `data.chapters.length === 0` before showing filtered search results. True-empty subjects render a dedicated empty state with a CTA when an action is supplied. The subject hub route wires that CTA to its existing safe back/fallback navigation. Filtered-empty searches still render `subjectHub.search.noResults`. Locale strings for `subjectHub.empty.heading`, `subjectHub.empty.body`, and `subjectHub.empty.action` were added in all supported UI locales.

**Verification:** Worker red proof: `pnpm exec jest src/components/subject-hub/SubjectHub.test.tsx --runInBand --no-coverage` failed before the fix because `subjectHub.empty.heading` was not rendered and `subjectHub.search.noResults` was shown. Coordinator reran `pnpm exec jest src/components/subject-hub/SubjectHub.test.tsx --runInBand --no-coverage`; it passed 1 suite / 7 tests. Coordinator also reran `pnpm check:i18n`, `pnpm check:i18n:orphans`, and `pnpm check:i18n:jsx-literals`; all passed.

**Caveats / Follow-ups:** The focused Jest run emits the existing `baseline-browser-mapping` age warning; it did not fail the suite. No follow-up is required for this item.
