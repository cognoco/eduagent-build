# WI-674 Plan

## Root Cause

The six `progress.weeklyDelta.*` strings were present in non-English locale files but copied byte-for-byte from `en.json`. Direct inspection shows the rot is limited to `de`, `es`, `ja`, and `pt`; `nb` and `pl` are already translated. `subjectHub.progress.weeklyDelta` has separate translated values and should remain untouched unless a spot-check proves otherwise.

## Scope

- Fix only:
  - `progress.weeklyDelta.topicsMastered`
  - `progress.weeklyDelta.topicsMastered_other`
  - `progress.weeklyDelta.vocabularyTotal`
  - `progress.weeklyDelta.vocabularyTotal_other`
  - `progress.weeklyDelta.topicsExplored`
  - `progress.weeklyDelta.topicsExplored_other`
- Locale files: `de.json`, `es.json`, `ja.json`, `pt.json`.
- Preserve `{{count}}` interpolation exactly.
- Do not change `nb.json`, `pl.json`, or `subjectHub.progress.weeklyDelta` unless validation finds matching English rot.

## Steps

1. Run a red assertion comparing the six target keys in `de/es/ja/pt` against `en.json`; it should fail before the fix.
2. Run `pnpm translate` per the repo i18n workflow, then keep the diff surgical to the target keys if the translator touches unrelated strings.
3. If translation automation cannot produce a clean surgical diff, edit the target locale JSON values manually using natural localized strings and preserve JSON formatting.
4. Run the post-fix assertion proving none of the six target values in `de/es/ja/pt` equals the `en.json` value.
5. Run `pnpm check:i18n`.
6. Review the diff to ensure only the plan and intended locale files are staged; keep setup noise out of the commit.

## Validation Commands

```powershell
pnpm translate
pnpm check:i18n
```

Plus the explicit JSON assertion for `progress.weeklyDelta.*` equality against `en.json`.
