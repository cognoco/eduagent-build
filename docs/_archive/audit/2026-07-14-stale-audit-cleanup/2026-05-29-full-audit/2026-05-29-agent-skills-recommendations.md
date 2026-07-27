# Agent Skills Recommendations

Recommended skills for development, troubleshooting, security review, and specification work in this repo.

## Research Method

- First pass: `npx skills find` for stack-specific skill discovery and install counts.
- Broad web pass: skills.sh pages, GitHub repositories, vendor documentation, GitHub Copilot skill documentation, official framework docs, and reputable third-party skill mirrors.
- Ranking preference: official/vendor skills first; then reputable/high-install third-party skills; then lower-install skills only when the topic lacks vendor coverage or could materially improve repo-specific work.

Key source references:

- Skills CLI/registry docs: https://skills.sh/docs
- Official skills directory: https://skills.sh/official
- GitHub Copilot skill docs: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-skills
- Zod docs: https://zod.dev/
- Drizzle docs: https://orm.drizzle.team/docs/get-started
- react-i18next docs: https://react.i18next.com/
- i18next config docs: https://www.i18next.com/overview/configuration-options
- GitHub Actions secure-use docs: https://docs.github.com/en/actions/reference/security/secure-use

## Highest Priority

| Area | Skill | URL |
|---|---|---|
| Spec/PRD | `mattpocock/skills@to-prd` | https://skills.sh/mattpocock/skills/to-prd |
| Spec/PRD | `github/awesome-copilot@prd` | https://skills.sh/github/awesome-copilot/prd |
| Cloudflare Workers | `cloudflare/skills@workers-best-practices` | https://skills.sh/cloudflare/skills/workers-best-practices |
| Cloudflare CLI | `cloudflare/skills@wrangler` | https://skills.sh/cloudflare/skills/wrangler |
| Hono | `yusukebe/hono-skill@hono` | https://skills.sh/yusukebe/hono-skill/hono |
| Neon Postgres | `neondatabase/agent-skills@neon-postgres` | https://skills.sh/neondatabase/agent-skills/neon-postgres |
| Inngest | `inngest/inngest-skills@inngest-events` | https://skills.sh/inngest/inngest-skills/inngest-events |
| Inngest | `inngest/inngest-skills@inngest-steps` | https://skills.sh/inngest/inngest-skills/inngest-steps |
| Expo / React Native UI | `expo/skills@building-native-ui` | https://skills.sh/expo/skills/building-native-ui |
| Expo data fetching | `expo/skills@native-data-fetching` | https://skills.sh/expo/skills/native-data-fetching |
| Clerk auth | `clerk/skills@clerk-setup` | https://skills.sh/clerk/skills/clerk-setup |
| Stripe billing | `stripe/ai@stripe-best-practices` | https://skills.sh/stripe/ai/stripe-best-practices |
| RevenueCat | `revenuecat/revenuecat-skill@revenuecat` | https://skills.sh/revenuecat/revenuecat-skill/revenuecat |
| Security review | `getsentry/skills@security-review` | https://skills.sh/getsentry/skills/security-review |
| GitHub Actions security | `getsentry/skills@gha-security-review` | https://skills.sh/getsentry/skills/gha-security-review |
| Sentry observability | `openai/skills@sentry` | https://skills.sh/openai/skills/sentry |

## Broad Web Search Additions

These are additions or corrections from the broader search, with emphasis on Zod, Drizzle, i18next localization, and GitHub Actions security.

| Area | Recommendation | URL | Notes |
|---|---|---|---|
| Zod official context | Zod MCP / `llms.txt` | https://zod.dev/ | Official Zod docs expose agent-facing resources, but this is not an installable skills.sh skill. Prefer this as the canonical source when building or reviewing repo-local Zod skills. |
| Zod skill | `anivar/zod-skill@zod` | https://skills.sh/anivar/zod-skill/zod | Best installable Zod-specific hit from skills.sh search: 313 installs. Third-party, but focused on Zod v4 schema design, parsing, errors, and inference. |
| Zod migration skill | `prowler-cloud/prowler@zod-4` | https://playbooks.com/skills/prowler-cloud/prowler/zod-4 | Strong repository reputation, useful Zod 3 -> 4 migration guidance. Not vendor-authored and not directly surfaced as a top skills.sh hit, so treat as optional. |
| Drizzle official context | Drizzle docs | https://orm.drizzle.team/docs/get-started | Official docs cover schema, relations, Neon, RLS, transactions, migrations, serverless, and Drizzle-Zod. No official Drizzle skill surfaced in broad search. |
| Drizzle skill | `bobmatnyc/claude-mpm-skills@drizzle-orm` | https://skills.sh/bobmatnyc/claude-mpm-skills/drizzle-orm | Best Drizzle-specific installable skill found: 4.3K installs. Covers schema, queries, relations, transactions, migrations, and red flags. |
| Drizzle patterns | `giuseppe-trisciuoglio/developer-kit@drizzle-orm-patterns` | https://skills.sh/giuseppe-trisciuoglio/developer-kit/drizzle-orm-patterns | Secondary Drizzle option: 1.2K installs. Consider only if we want a second perspective on patterns. |
| i18next official context | react-i18next docs | https://react.i18next.com/ | Official docs explicitly cover React Native, hooks, `Trans`, TypeScript, testing, and official i18next CLI references. No vendor-authored skill surfaced. |
| i18next official tooling | i18next CLI | https://github.com/i18next/i18next-cli | Official high-performance CLI for extraction, linting, locale sync, and type generation. More valuable than the low-install third-party skills for this repo. |
| i18next skill | `yildizberkay/skills@react-i18next` | https://skills.sh/yildizberkay/skills/react-i18next | Only directly relevant installable react-i18next skill found; 67 installs, so do not treat as primary. Better source material for a repo-local skill. |
| GitHub Actions official context | GitHub Actions secure-use docs | https://docs.github.com/en/actions/reference/security/secure-use | Canonical source for SHA pinning, token permissions, script injection, OIDC, Scorecards, and runner hardening. |
| GitHub Actions official collection | `github/awesome-copilot` | https://github.com/github/awesome-copilot | Official GitHub repository for Copilot instructions, agents, and skills. It has GitHub Actions CI/CD best-practice instructions, but those are instructions rather than a standalone `SKILL.md`. |
| GitHub Actions docs skill | `xixu-me/skills@github-actions-docs` | https://skills.sh/xixu-me/skills/github-actions-docs | Very high install count and useful for grounding in official docs, but only 54 GitHub stars and not security-specialized. Use as docs lookup, not as the security reviewer. |
| GitHub Actions security skill | `getsentry/skills@gha-security-review` | https://skills.sh/getsentry/skills/gha-security-review | Best installable security-specific skill found. Keep as primary GitHub Actions security review skill. |
| GitHub Actions security source | `getsentry/skills` repository | https://github.com/getsentry/skills | Sentry repo lists `gha-security-review` for workflow exploitation vulnerabilities and `skill-scanner` for agent skill security issues. |

## Secondary / Conditional

| Area | Skill | URL |
|---|---|---|
| pnpm | `antfu/skills@pnpm` | https://skills.sh/antfu/skills/pnpm |
| TanStack Query | `deckardger/tanstack-agent-skills@tanstack-query-best-practices` | https://skills.sh/deckardger/tanstack-agent-skills/tanstack-query-best-practices |
| LLM security | `semgrep/skills@llm-security` | https://skills.sh/semgrep/skills/llm-security |
| Zod | `anivar/zod-skill@zod` | https://skills.sh/anivar/zod-skill/zod |
| Drizzle | `bobmatnyc/claude-mpm-skills@drizzle-orm` | https://skills.sh/bobmatnyc/claude-mpm-skills/drizzle-orm |
| GitHub Actions docs | `xixu-me/skills@github-actions-docs` | https://skills.sh/xixu-me/skills/github-actions-docs |

## Not Recommended As Primary

| Area | Candidate | URL | Reason |
|---|---|---|---|
| Drizzle docs | `smithery/ai@drizzle` | https://skills.sh/smithery/ai/drizzle | Replaced by broader-search findings. Use official Drizzle docs plus the higher-install Drizzle skills above. |
| i18next | `yildizberkay/skills@react-i18next` | https://skills.sh/yildizberkay/skills/react-i18next | Relevant but low install count. Prefer official i18next/react-i18next docs and a repo-local localization skill. |
| Zod testing | `anivar/zod-testing@zod-testing` | https://skills.sh/anivar/zod-testing/zod-testing | Too low install count for primary recommendation. Use only if schema-test generation becomes a repeated workflow. |

## Repo-Local Skill Opportunities

The broad search suggests these would likely be more valuable as repo-local skills than third-party installs:

- `zod-shared-contracts`: enforce `@eduagent/schemas` as the API-facing type source, parse at trust boundaries, avoid duplicate DTOs, and use structured error contracts.
- `drizzle-neon-safety`: repo-specific scoping rules, `createScopedRepository(profileId)`, direct joins through owning ancestors, migration rollback requirements, Neon/serverless pooling, transaction and atomic-update patterns.
- `i18next-mobile-hygiene`: repo-specific translation key hygiene, `scripts/check-i18n-orphan-keys.ts`, `scripts/i18n-keep.ts`, JSX literal ratchet policy, interpolation fallback companion keys, and UI-vs-conversation language enum rules.
- `github-actions-security-review`: repo-specific workflow review checklist built from GitHub secure-use docs plus Sentry's `gha-security-review`: SHA pinning, `pull_request_target`, `workflow_run`, OIDC, `permissions`, secrets, cache poisoning, and AI-agent workflow prompt injection.

## Install Commands

```bash
npx skills add mattpocock/skills@to-prd
npx skills add github/awesome-copilot@prd
npx skills add cloudflare/skills@workers-best-practices
npx skills add cloudflare/skills@wrangler
npx skills add yusukebe/hono-skill@hono
npx skills add neondatabase/agent-skills@neon-postgres
npx skills add inngest/inngest-skills@inngest-events
npx skills add inngest/inngest-skills@inngest-steps
npx skills add expo/skills@building-native-ui
npx skills add expo/skills@native-data-fetching
npx skills add clerk/skills@clerk-setup
npx skills add stripe/ai@stripe-best-practices
npx skills add revenuecat/revenuecat-skill@revenuecat
npx skills add getsentry/skills@security-review
npx skills add getsentry/skills@gha-security-review
npx skills add openai/skills@sentry
```

```bash
npx skills add antfu/skills@pnpm
npx skills add deckardger/tanstack-agent-skills@tanstack-query-best-practices
npx skills add semgrep/skills@llm-security
npx skills add anivar/zod-skill@zod
npx skills add bobmatnyc/claude-mpm-skills@drizzle-orm
npx skills add xixu-me/skills@github-actions-docs
```

Optional, only after manual review:

```bash
npx skills add https://github.com/prowler-cloud/prowler --skill zod-4
npx skills add giuseppe-trisciuoglio/developer-kit@drizzle-orm-patterns
npx skills add yildizberkay/skills@react-i18next
```
