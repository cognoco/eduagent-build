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

Cloudflare preserves Worker secrets omitted from a bulk upload. This workflow
therefore adds and updates Doppler-managed values but does not delete a key that
was removed from Doppler. Automated deletion requires a separately ruled
ownership manifest so Worker-only secrets cannot be removed accidentally.

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
