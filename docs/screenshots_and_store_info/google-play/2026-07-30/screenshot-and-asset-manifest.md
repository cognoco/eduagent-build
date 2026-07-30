# Screenshot plan and asset manifest — 2026-07-30.1

**Status:** Scene/caption plan only. No final Play listing image is included.

Capture from the exact approved Android production candidate (`Config T`: V0
off, V1 on, V2 on), not a local debug shell. Use synthetic learner data only.
The suggested seed is learner **Alex**, subject **Fractions**, with invented
schoolwork that contains no real person, school, location, email, or account
identifier.

## Phone screenshot scene plan

| Order | Filename | Scene and capture state | Caption draft | Evidence/guardrail |
| --- | --- | --- | --- | --- |
| 1 | `01-mentor-start-en-us.png` | V2 Mentor root with the prompt composer and safe starter actions visible | `Start with a question` | Show the shipped Mentor surface; no notification or debug overlay |
| 2 | `02-guided-session-en-us.png` | A synthetic fractions session after one learner turn and one Mentor reply | `Work through ideas step by step` | No real transcript; avoid grades, mastery, or outcome claims |
| 3 | `03-homework-review-en-us.png` | Post-capture homework review using a generated fractions worksheet | `Bring homework into the conversation` | Do not photograph real homework, handwriting, faces, names, or a live camera roll |
| 4 | `04-subjects-en-us.png` | Subjects root with two or three synthetic subjects and a visible resume action | `Keep each subject together` | Use only the V2 Subjects surface |
| 5 | `05-journal-en-us.png` | Journal showing synthetic notes/bookmarks created from the demo session | `Return to notes and saved replies` | Do not imply persistent Mentor memory is enabled if the candidate gate keeps it off |
| 6 | `06-family-progress-en-us.png` | Adult owner view of synthetic linked learner Alex, if included in approved positioning | `See linked learners’ activity and progress` | Optional; omit unless the reviewer account and current family surface are verified |

The operator must confirm the number, aspect ratio, pixel dimensions, file-size
limit, and device framing shown by the current Play Console immediately before
capture. This repository does not freeze those external requirements.

## Review-only captures

These are useful evidence but are not default marketing screenshots:

- More → Privacy & Data, showing Export and Delete account for an owner;
- subscription screen showing only the products actually available in Play;
- app-access/reviewer login success;
- the account-deletion web page on a clean device.

Store those exports in the operator evidence pack, not in a public screenshot
slot unless product explicitly approves the scene.

## Asset inventory

| Asset | Repository source / intended filename | Current facts | Status |
| --- | --- | --- | --- |
| App icon | `apps/mobile/assets/images/icon.png` | PNG, 1024×1024 | Source exists; operator must validate console rendering |
| Adaptive foreground | `apps/mobile/assets/images/adaptive-icon.png` | PNG, 1024×1024; background `#1a1a3e` in `app.json` | Source exists; validate mask/safe zone |
| Feature graphic | `feature-graphic-en-us.png` | No 1024×500 source found in repo | **Missing — product/design required** |
| Phone screenshots | filenames in scene table | No final listing set exists | **Missing — capture required** |
| Tablet screenshots | `tablet-<order>-<scene>-en-us.png` | App declares tablet support, but no final set exists | Console/product decision; capture if required or intentionally supported |
| Promo video | external URL | None supplied | Optional; do not add without product review |

## Capture and export checklist

- [ ] Candidate build ID, commit, app version, Android version code, device model,
      resolution, locale, and capture timestamp recorded.
- [ ] Only synthetic data visible; status bar, notifications, clipboard, camera
      roll, and account switchers inspected.
- [ ] No unsupported compliance, safety, learning-outcome, or product-tier claim.
- [ ] Each scene matches the approved production candidate and current caption.
- [ ] Text is legible; no clipping, translation overflow, skeleton, error, or
      loading state.
- [ ] Image dimensions/file sizes rechecked against the current console.
- [ ] SHA-256 hashes of final exports recorded in the evidence pack.
- [ ] Product and privacy review initials recorded per image.
