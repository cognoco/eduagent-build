---
name: Deploy config — production targeting unverified
description: User flagged (2026-03-28) that deploy.yml may only deploy staging correctly. Production worker/secrets on Cloudflare not yet verified.
type: project
---

User flagged on 2026-03-28: "deploy.yml seems only to deploy api-mentomate-staging to the right org..."

**Current behavior (deploy.yml):**
- Push to `main` → auto-deploys `mentomate-api-staging` only
- Production (`mentomate-api-production`) → manual `workflow_dispatch` + `production` option + GitHub Environment approval gate
- Secrets (DATABASE_URL, CLERK_SECRET_KEY, etc.) injected at deploy time via Doppler → GitHub Actions secrets

**Open questions (user exited session without resolving):**
1. Has the production worker ever been deployed to Cloudflare?
2. Are production secrets (Doppler `prd` config) synced to GitHub Actions?
3. Is the Cloudflare account/org correct for production deployment?

**Why:** If production deploy has never been tested, first production deploy could fail. The staging deployment works — production is the untested path.

**How to apply:** Before any production launch task, verify: (1) production Doppler config exists with all required secrets, (2) GitHub Actions has the production secrets, (3) `wrangler deploy` with production env has been tested at least once. Also see `project_prod_approval_gate.md` — the GitHub Environment protection rules are not yet configured.
