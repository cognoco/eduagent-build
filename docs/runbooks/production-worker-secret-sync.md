# Production Worker Secret Sync

## Purpose

`.github/workflows/production-secret-sync.yml` closes the gap between a Doppler
`prd` edit and the next API deployment. It runs on `main` every 30 minutes and
can also be dispatched manually from `main`.

The workflow bulk-updates the named `mentomate-api-prd` Worker from Doppler,
then checks `https://api.mentomate.com/v1/health`. Its maximum normal drift
window is one schedule interval plus GitHub Actions scheduling delay.

## Safeguards

- Default-branch-only job guard; scheduled workflows use the default branch.
- The production-specific concurrency group is shared with `deploy.yml` across
  all dispatch refs, so a scheduled sync cannot race a production deployment.
- SHA-pinned third-party actions and checksum-verified Doppler CLI.
- Hard failure when the Doppler token, Cloudflare API token, or account ID is
  missing.
- Explicit temporary Wrangler config and Worker name; no committed Cloudflare
  identifiers and no unrelated KV identifiers in the job.
- Post-upload key-name verification confirms every non-empty Doppler-managed
  key exists on the named Worker. Cloudflare does not expose secret values, so
  changed-value verification relies on the successful bulk API response.
- `config/worker-secret-ownership.json` is the reviewed deletion boundary. A
  scheduled run only lists manifest-owned Worker keys absent from Doppler.
  Unowned Worker-only keys and manifest-owned keys still present in Doppler
  are preserved.
- `contents: read` by default; `issues: write` only on the sync job for alerts.

Merging or materially changing this workflow activates a recurring production
mutation and requires the Quartet two-key production approval before merge.

## Alerting

Any sync or post-sync health failure opens the deduplicated GitHub issue
`Production worker secret sync failed` with labels `deploy-failure` and
`automated`. Later failing runs comment on the standing issue instead of filing
duplicates. Close the issue only after a green workflow run and green production
health check.

The health request passes through the API's global environment-validation
middleware on the newly deployed secret version. It proves required-key schema
and liveness, not the semantic validity of every third-party credential.

Cloudflare preserves Worker secrets omitted from a bulk upload. The workflow
therefore plans deletions after each upload, but applies none on its schedule.
Deletion requires a manual dispatch with `apply_manifest_deletions=true` and
an approval phrase bound to the exact sorted candidate set. For the bounded
RevenueCat authorization cleanup, that phrase is
`WI-1837:DELETE:mentomate-api-prd:prd:v1:REVENUECAT_SANDBOX_VERIFICATION_AUTHORIZATION`.
That exact example is valid only while the authorization key is absent from
Doppler and present on the Worker; the reconciler computes the live candidate
set again during each apply. The reconciler rejects a stale,
malformed, duplicate, or target-mismatched manifest before listing or deleting
anything. It uses Wrangler's supported `secret delete` command and verifies
that every candidate disappeared while every initially present preserved key
remained. It re-reads Doppler immediately before and after deletion; a key
reintroduced after the dry-run makes the apply fail closed instead of deleting
against a stale plan.

`REVENUECAT_SANDBOX_VERIFICATION_AUTHORIZATION` is manifest-owned even while
normally absent from Doppler. This permits its exact removal after a bounded
WI-2705 verification window without granting authority over Worker-only keys.

## Manifest review and approval

1. Compare key names—not values—from Doppler `mentomate/prd` with
   `config/worker-secret-ownership.json`. Add only keys intentionally owned by
   Doppler-to-Worker reconciliation.
2. Confirm the target remains exactly `mentomate-api-prd`, Doppler config
   `prd`, and Wrangler environment `production`.
3. Advance `reviewedAt` and `validUntil` only in a reviewed PR. An expired
   manifest fails the scheduled dry-run and opens the normal failure alert.
   Keep `approvalNamespace` explicit in the same reviewed manifest; changing it
   changes every accepted approval phrase.
4. Dispatch once with deletion disabled and review the dry-run output. It
   contains only deletion candidate names, never values.
5. Obtain the required production approval for that candidate set. Then
   dispatch with deletion enabled and an exact phrase shaped as
   `WI-1837:DELETE:<worker>:<doppler-config>:v<manifest-version>:<sorted-candidate-names>`.
   A missing phrase, a different candidate set, or a different order fails
   before the first delete.
6. Confirm the post-delete health step is green. A delete, post-delete
   invariant, or health failure opens the deduplicated deployment issue.

Do not enable `apply_manifest_deletions` merely to make the dry-run quiet.
Removing a key from the manifest preserves it; removing it from Doppler makes
it a deletion candidate only while it remains manifest-owned.

## Rollback

1. Use Doppler's restricted change history to restore the deleted key to
   `mentomate/prd`; never recover or paste its value through logs, issues, chat,
   or a tracked file.
2. Dispatch the workflow with deletion disabled. The normal bulk-sync step
   restores the key before the deletion dry-run.
3. Confirm key-name verification and production health are green.
4. Confirm the restored key is absent from the dry-run candidate list.

The regression suite models this rollback: once the removed owned key is
restored in Doppler and bulk sync has recreated it on the Worker, the planner
retains it and schedules no deletion.

## Manual Remediation

1. Confirm `DOPPLER_TOKEN_PRD`, `CLOUDFLARE_API_TOKEN`, and `CF_ACCOUNT_ID` are
   present in GitHub Actions secrets.
2. Dispatch `Production Worker Secret Sync` from `main`.
3. Confirm the sync step targets `mentomate-api-prd` and the health step returns
   HTTP 200 with `status=ok`.
4. If Actions is unavailable, use PowerShell with the three credentials already
   loaded by the machine secret profile:

   ```powershell
   $env:DOPPLER_TOKEN = $env:DOPPLER_TOKEN_PRD
   $env:CLOUDFLARE_ACCOUNT_ID = $env:CF_ACCOUNT_ID
   $env:WRANGLER_SYNC_CONFIG = Join-Path $env:TEMP 'wrangler-secret-sync.jsonc'
   Set-Content -LiteralPath $env:WRANGLER_SYNC_CONFIG -Value '{"name":"mentomate-api-prd"}'
   pnpm secrets:sync prd
   ```

5. Confirm the command reports both sync and key-name verification success.
6. Never paste secret values into logs, issues, chat, or tracked files.
