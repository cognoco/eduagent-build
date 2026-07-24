# Notion Open-Tracker Verification — 2026-05-23

Verified at branch `codex/h1-progress-contract-migration` HEAD `343b0502f`.

## Why this audit ran

A prior audit reported that PR #377 silently fixed 8+ bugs without their Notion rows being moved to "Resolved". We swept all 101 currently-Open bug rows to see which other rows are out of sync with the working branch.

Scope: 101 Open rows in `Issue Tracker - Open`. 15 confirmed-open rows from the user's known-list were skipped; the 9 PR-#377-Done rows were already absent from Open. Net **86 rows verified** by 10 parallel Opus subagents (batches of 8–9 each).

Per-batch evidence: `result-batch-1.md` through `result-batch-10.md` in this folder. Each entry cites file:line and the relevant commit.

## Verdict distribution (86 / 86)

| Verdict          | Count | % |
|------------------|------:|--:|
| STILL_OPEN       |    52 | 60% |
| ALREADY_FIXED    |    17 | 20% |
| PARTIALLY_FIXED  |     8 |  9% |
| NEEDS_REVIEW     |     9 | 10% |

**Net Notion-sync drift: 17 rows should be moved to Resolved, plus 8 partials that need a status update.**

## Move to Resolved (17)

Each fixed in current HEAD; cite the commit in the `Resolved`/`Fixed In` Notion fields.

| Bug   | CR / Tag           | Fixed in                          | Citation file:line                                              |
|-------|--------------------|-----------------------------------|-----------------------------------------------------------------|
| #76   | LEARN-04/CC-01     | `e5fc843a5`                       | session self-barrel import removed                              |
| #86   | DEP-DRIFT-1 #8     | `f61e372d2` (PR #183)             | `package.json:108` — Prettier `^3.0.0`                          |
| #351  | CR-2026-05-19-H1   | `assertOwnerAndParentAccess` sweep | `family-access.ts:121` + inline `[CR-2026-05-19-H1]` markers   |
| #363  | CR-2026-05-19-H14  | `82dff9757` / `a590042ac`         | `dedup-pass.ts:50`; migration 0088 present                      |
| #405  | CR-2026-05-19-M21  | migration 0087 + guard test       | `0087_bug405_language_check_idempotent.sql`                    |
| #421  | CR-2026-05-21-016  | scoped join landed                | `recall-bridge.ts:53-67`                                        |
| #422  | CR-2026-05-21-017  | `c25e17648` (PR #377)             | `evaluate-data.ts:55-69` cites `[BUG-354]`                      |
| #430  | CR-2026-05-21-025  | source carries CR-025 annotation  | exchange-empty-reply-fallback site                              |
| #463  | CR-2026-05-21-058  | greedy JSON regex replaced        | all 4 sites → `extractFirstJsonObject`                          |
| #468  | CR-2026-05-21-063  | `9a84e093f`                       | `self-progress-reports.ts` removed; only `solo-` remains        |
| #504  | CR-2026-05-21-099  | source carries CR-099 annotation  | env-validation                                                  |
| #505  | CR-2026-05-21-100  | `07993f2bb`                       | `deletion.ts:30-47` cites CR-100                                |
| #515  | CR-2026-05-21-110  | both asks landed                  | `sso-callback.tsx:42-44, 60-65` cite CR-110                     |
| #554  | CR-2026-05-21-149  | warn-on-substitution latch        | `secure-storage.ts:138, 157` cite CR-149                        |
| #557  | CR-2026-05-21-152  | Sentry breadcrumb added           | `OutboxDrainProvider.tsx:183-195`                               |
| #564  | CR-2026-05-21-159  | `02506cbd5`                       | `subjects.ts:277` now uses `app.current_profile_id`             |
| #594  | LEARN-13           | `c25e17648`                       | `processRecallTest` adds scoped subject ownership check         |

## Partial — leave Open with updated note (8)

| Bug   | CR / Tag           | What's done                                                       | What's missing                                                         |
|-------|--------------------|-------------------------------------------------------------------|------------------------------------------------------------------------|
| #188  | M6-HIGH jest.mock  | Internal-mock count down to 147 lines / 64 files (from 228 / 83) | GC6 burn-down ongoing                                                  |
| #265  | E2E delete-account | Helper rewrite landed                                            | Spec coverage gaps remain                                              |
| #385  | CR-2026-05-19-M1   | Webhook KV-cache + `app_user_id` resolution fixed (`717887d3f`) | 4 silent-fallback sites remain (middleware/metering, quiz, embed-backfill, suggestions); Notion path is wrong (`middleware/metering.ts`, not `services/billing/metering.ts`) |
| #393  | CR-2026-05-19-M9   | 3 of 4 FK indexes added                                          | `family_links_parent_profile_id_idx` still missing at `profiles.ts:209-219` |
| #414  | CR-2026-05-21-009  | TOCTOU hardened in `07993f2bb`                                   | rowCount=0 Sentry log + CASCADE FK guard test not implemented          |
| #481  | CR-2026-05-21-076  | `extractFirstJsonObject` replaces greedy regex                   | `subjectClassifyLlmResponseSchema` never added                         |
| #514  | CR-2026-05-21-109  | Comment block explains why nav-first is intentional              | `mountedRef` guard before `platformAlert` not implemented              |
| #561  | CR-2026-05-21-156  | Typed `NetworkError` classifier at L382-389                      | Legacy `TypeError` string-match branch (L391-401) still present        |

## Needs human review (9)

Runtime / infra issues not verifiable from grep alone — re-run the relevant Playwright probe or check the operational system. See per-batch reports for details.

`#63`, `#64`, `#65`, `#67`, `#71`, `#77`, `#84`, `#572`, `#590`.

## Still open (52)

The remaining 52 rows are confirmed present in current code with HIGH confidence. See per-batch reports for file:line evidence. No action other than continuing to work them.

## Caveats

- **Verdicts are point-in-time at HEAD `343b0502f`.** Subsequent commits may resolve any of these.
- **The user's 15 known-open and 9 PR-#377-Done CR codes were filtered out before dispatch** (15 matched and excluded from verification; the 9 PR-#377 ones were already absent from Open).
- **The `#86` Prettier fix landed long ago** (PR #183, dated well before this audit window) — its presence in Open is a much older sync gap, not a PR-#377 fallout.
- **Two batch agents hit user-account rate limits** (batches 3 and 7); batch 3 had completed writing the report before the limit hit; batch 7 was re-verified manually with the same methodology after the user reset.
