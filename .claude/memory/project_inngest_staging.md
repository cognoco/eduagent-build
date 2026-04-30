---
name: Inngest staging sync
description: How to sync the staging API with Inngest Cloud — correct URL includes /v1 prefix
type: project
originSessionId: 89e139f9-b769-4106-9663-2f340c4f4781
---
Inngest Cloud staging app synced 2026-04-17.

- **Sync URL:** `https://api-stg.mentomate.com/v1/inngest` (PUT request)
- The `/v1` prefix is required because Hono uses `.basePath('/v1')` in `apps/api/src/index.ts`
- Inngest serve handler is at `apps/api/src/routes/inngest.ts`, mounted at `/inngest` under the `/v1` base

**Why:** The Inngest Cloud manual sync form and curl command both need the full path including `/v1`. Without it you get 404.

**How to apply:** When resyncing Inngest (after deploys, function changes), use:
```bash
curl -X PUT https://api-stg.mentomate.com/v1/inngest
```
For production it would be `https://api.mentomate.com/v1/inngest`.

Required secrets in Doppler (must match Inngest Cloud environment):
- `INNGEST_SIGNING_KEY`
- `INNGEST_EVENT_KEY`
