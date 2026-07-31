# Google Play submission package — 2026-07-30.1

- **App:** MentoMate
- **Android package:** `com.mentomate.app`
- **Repository app version:** `1.0.1`
- **Evidence baseline:** `173c8f6925b0d2e87d0230186c3d27369f305e84`

**Status:** Prepared internal draft — **HOLD; not submitted or approved**

This directory is the versioned internal package for **WI-1335 — Prepare Google
Play listing and Data Safety submission package**. It records repository facts,
draft console answers, asset requirements, territory controls, URL evidence, and
the operator path. It is not evidence that any answer was entered in Play
Console, any territory was enabled, or any release was uploaded or published.

## Package index

| Artifact | Purpose | Submission status |
| --- | --- | --- |
| [`listing-copy.md`](listing-copy.md) | Copy-ready English app name, short description, and full description | Draft; product approval required |
| [`screenshot-and-asset-manifest.md`](screenshot-and-asset-manifest.md) | Synthetic-data scene plan, captions, filenames, and existing/missing asset inventory | Plan only; final images not captured |
| [`data-safety-content-rating.md`](data-safety-content-rating.md) | Data Safety reconciliation plus target-audience/content-rating answer draft | Draft; legal/admin decisions remain |
| [`territory-configuration-manifest.md`](territory-configuration-manifest.md) | Fail-closed Play country/region manifest derived from active launch policy | No territory currently activatable |
| [`url-verification.md`](url-verification.md) | HTTP evidence and clean-device repeat procedure for privacy, support, and deletion surfaces | Privacy/deletion pass; support surface has blockers |
| [`operator-handoff-opq-60.md`](operator-handoff-opq-60.md) | Exact sign-offs, fields, evidence exports, and post-application checks | Two-key operator checklist; no console action performed |

## Source hierarchy

The package uses current code and the following repository canon, in descending
order where facts overlap:

1. `apps/mobile/app.json`, `apps/mobile/eas.json`, current mobile/API/database
   source, and package manifests.
2. `docs/compliance/2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md`
   plus its 2026-07-30 DPO revision.
3. `docs/compliance/2026-07-23-13-plus-eea-launch-country-ruling.md`.
4. `docs/compliance/assessments/providers/2026-07-25-processor-transfer-evidence-ledger.md`.
5. `docs/compliance/evidence/2026-07-30-retention-schedule.md`.
6. `docs/compliance/privacy-policy.html`, `docs/delete-account.html`, and
   `docs/screenshots_and_store_info/app-privacy-data-safety-worksheet.md`.

When the package says **unknown**, **needs decision**, or **HOLD**, the operator
must preserve that state. A draft answer must never be converted into a
declaration merely to clear a console task.

## Two-key boundary

The first key is this reviewed package. The second key is explicit operator
authority after the required product, legal/DPO, processor, territory, and store
administration inputs in the handoff are closed. Until both keys exist, do not:

- edit or submit Play Console forms;
- publish listing copy or graphics;
- activate a country or region;
- enter a legal/privacy declaration;
- use credentials, login/2FA, or upload the first AAB;
- create, promote, or publish a release.

## Known launch blockers found during preparation

- The in-app support surfaces still use `support@mentomate.app` in several
  production mobile paths and translations, while the privacy policy, API, and
  live web surfaces use `support@mentomate.com`. DNS resolution on 2026-07-30
  found an MX record for `mentomate.com` and no DNS record for `mentomate.app`.
  This requires a production-code/localisation builder fix before submission.
- `https://mentomate.com/support` returns HTTP 404. Play support contact must use
  a confirmed monitored email or a separately published support URL; do not
  enter this 404 URL.
- The country-policy register is not wired into a production route according to
  `docs/compliance/evidence/2026-07-30-country-register-reverification-procedure.md`.
  Store territory alone is not authoritative residence enforcement.
- The active processor ledger still has unresolved contract/transfer/retention
  evidence. Data Safety sharing and ephemeral-processing answers need
  legal/admin sign-off.
