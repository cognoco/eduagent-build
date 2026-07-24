# WI-1194 production transcript-purge evidence

**Captured:** 2026-07-24 19:09 UTC  
**Environment:** Inngest Cloud production (`production-84cf934c`)  
**Application:** `eduagent`  
**Function:** `transcript-purge-cron` — Queue transcript purges for aged summaries

## Run evidence

| Field | Value |
|---|---|
| Run ID | `01KY97X840QEB5KWYB9ZAWK4SG` |
| Status | `COMPLETED` |
| Queued | `2026-07-24T05:00:00Z` |
| Started | `2026-07-24T05:00:09.356Z` |
| Ended | `2026-07-24T05:00:12.944Z` |
| Output | `{"delayed":0,"queued":0,"status":"completed"}` |

The scheduled production scan completed normally. It found no eligible
transcripts to queue and no delayed summaries during this run.

## Collection method

Evidence was read through the authenticated Inngest CLI REST API:

```text
inngest api --prod --env production get-function-runs
inngest api --prod --env production get-function-run
```

The CLI used the machine's existing Inngest authorization. No credential or
secret value is recorded in this artifact.
