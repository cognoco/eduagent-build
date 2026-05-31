export const meta = {
  name: 'full-codebase-review-15-lens',
  description:
    '15 parallel lens reviewers; each owns review + fix for Critical/High in its lens',
  phases: [{ title: 'Review+Fix' }],
};

const WORKTREE = String.raw`C:\Dev\Projects\Products\Apps\eduagent-build\.worktrees\notion-bf-3105`;

const COMMON = [
  'WORKTREE (your working root — all paths relative to this, all edits MUST be inside it):',
  WORKTREE,
  '',
  'BRANCH: notion-bf-3105 (clean, tracking origin/main). No WIP from other agents.',
  '',
  'HARD RULES — VIOLATIONS WILL BE REJECTED:',
  '1. NEVER run git commit, git push, /commit, or any commit skill. After saving each fixed file, run: git add <relative-path> immediately to stage it.',
  '2. Only edit files inside your OWNED-WRITE GLOBS (listed below). For Critical/High findings OUTSIDE your globs, list under escalated and do NOT edit.',
  '3. Fix Critical and High ONLY. Medium/Low go to backlog (top 20 max) — do NOT fix.',
  '4. Security/correctness fixes require a break-test (write failing test → watch pass after fix → revert fix → watch fail → restore fix). Place break-tests co-located next to source.',
  '5. Audit your lens EXHAUSTIVELY across the whole worktree — globs, greps, file reads. Do not stop at the first finding.',
  '6. If 3+ findings in your lens share a root pattern, sweep all sibling sites per CLAUDE.md "Sweep when you fix" (or install a forward-only guard test if sweep is too large).',
  '',
  'REPO INVARIANTS (CLAUDE.md — non-negotiable):',
  '- @eduagent/schemas is the shared contract — no local redefinition of API-facing types.',
  '- Business logic in services/, not routes (eslint G1/G5).',
  '- Scoped reads via createScopedRepository(profileId) OR parent-chain joins with profileId in WHERE.',
  '- Writes verify ownership.',
  '- Non-core Inngest via safeSend(); bare inngest.send only with // core-send: comment (G3 ratchet).',
  '- LLM outputs use llmResponseEnvelopeSchema — no [MARKER] tokens or bare JSON in free-text.',
  '- API code uses typed config object, never raw process.env (eslint G4).',
  '- No new internal jest.mock relative path (GC1 ratchet). When editing a test file, sweep its internal mocks (GC6).',
  '- Shared mobile components persona-unaware; semantic tokens, never persona checks or hex.',
  '- Default exports only for Expo Router page components.',
  '- SecureStore keys: only [A-Za-z0-9._-].',
  '- Cross-tab router.push must push the full ancestor chain.',
  '',
  'RETURN: call the StructuredOutput tool with the schema. Be concise — finding descriptions ≤300 chars; changeSummary ≤400 chars; verificationEvidence ≤500 chars (last lines of jest/tsc output is enough).',
].join('\n');

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lens', 'fixed', 'escalated', 'backlog', 'stagedFiles', 'notes'],
  properties: {
    lens: { type: 'string' },
    fixed: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'file',
          'line',
          'severity',
          'description',
          'changeSummary',
          'verificationEvidence',
        ],
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['critical', 'high'] },
          description: { type: 'string', maxLength: 400 },
          changeSummary: { type: 'string', maxLength: 500 },
          breakTestPath: { type: 'string' },
          verificationEvidence: { type: 'string', maxLength: 600 },
        },
      },
    },
    escalated: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'file',
          'line',
          'severity',
          'description',
          'reasonOutsideOwnedWrite',
        ],
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['critical', 'high'] },
          description: { type: 'string', maxLength: 400 },
          reasonOutsideOwnedWrite: { type: 'string', maxLength: 250 },
          suggestedFix: { type: 'string', maxLength: 500 },
        },
      },
    },
    backlog: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'line', 'severity', 'description'],
        properties: {
          file: { type: 'string' },
          line: { type: 'integer' },
          severity: { type: 'string', enum: ['medium', 'low'] },
          description: { type: 'string', maxLength: 300 },
        },
      },
    },
    stagedFiles: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string', maxLength: 1200 },
  },
};

const LENSES = [
  {
    key: 'L01-correctness',
    model: 'opus',
    title: 'Correctness and logic',
    focus:
      'Control-flow bugs, off-by-one, null/undefined deref, async ordering, race conditions, unhandled promise rejections, missing await, error swallowing.',
    audit: 'Whole repo — TS/TSX files in apps/ and packages/.',
    write:
      'apps/api/src/services/** (EXCLUDING apps/api/src/services/llm/**, apps/api/src/services/**/*-prompts.ts, apps/api/src/services/challenge-round/**, apps/api/src/services/safe-non-core.ts), apps/api/src/lib/** (EXCLUDING anything auth/security-related).',
  },
  {
    key: 'L02-authn-authz',
    model: 'opus',
    title: 'Security: AuthN/AuthZ',
    focus:
      'Clerk JWT validation, route gating, role checks (owner vs child), isOwner gating, family_links role, missing auth middleware on new routes, JWT secret handling, session token storage.',
    audit:
      'apps/api/src/middleware/**, apps/api/src/routes/**, apps/mobile/src/lib/auth*, apps/mobile/src/hooks/use-auth*.',
    write:
      'apps/api/src/middleware/**, apps/api/src/routes/auth/**, apps/api/src/routes/billing/**, apps/api/src/routes/clerk/**, apps/api/src/routes/me/**.',
  },
  {
    key: 'L03-data-integrity',
    model: 'opus',
    title: 'Data integrity and profileId scoping',
    focus:
      'Missing profileId WHERE clauses, parent-chain join violations, cross-account leak vectors, writes without ownership verification, scopedRepository misuse, raw db.select without scope.',
    audit:
      'apps/api/src/services/**, apps/api/src/routes/** (non-auth), apps/api/src/db/**, packages/database/**.',
    write:
      'apps/api/src/db/**, packages/database/**, apps/api/src/services/profile-scope.ts, apps/api/src/services/scoped-repository.ts, apps/api/src/routes/** (EXCEPT routes already owned by L02: auth/billing/clerk/me).',
  },
  {
    key: 'L04-test-quality',
    model: 'sonnet',
    title: 'Test quality and coverage',
    focus:
      'Internal jest.mock (GC1/GC6 ratchet), brittle assertions, missing negative paths, break-tests for security, mocks of code that can run, tests that only assert truthiness.',
    audit:
      'All *.test.ts(x) and *.integration.test.ts(x) in apps/api, apps/mobile, packages.',
    write:
      'Any *.test.ts(x) / *.integration.test.ts(x) file — but you MUST NOT touch tests being added by other lenses as their break-tests (any new test file mid-pass is theirs). Prefer converting internal jest.mock to jest.requireActual.',
  },
  {
    key: 'L05-architecture',
    model: 'opus',
    title: 'Architecture and conventions',
    focus:
      'Package-boundary violations, route/service split (G1/G5), schema contract bypass, default-export misuse, persona-fossil reintroduction, redefining API types locally.',
    audit:
      'eslint.config.mjs, apps/api/src/routes/**, packages/schemas/**, apps/mobile/src/**, tsconfig*.json.',
    write:
      'eslint.config.mjs, eslint-rules/**, tsconfig.base.json, packages/schemas/src/index.ts (barrel only, schema body changes go to L08).',
  },
  {
    key: 'L06-ux-failure-modes',
    model: 'opus',
    title: 'UX dead-ends and failure modes',
    focus:
      'Error states with no recovery action, missing loading/empty/error triads, untyped error handling, retry/back/home affordances absent, infinite spinner, fatal modal traps.',
    audit:
      'apps/mobile/src/app/** (Expo Router screens), apps/mobile/src/components/**.',
    write:
      'apps/mobile/src/components/error/**, apps/mobile/src/components/ErrorFallback*, apps/mobile/src/components/TimeoutLoader*, any apps/mobile/src/app/**/error*.tsx or +not-found.tsx files.',
  },
  {
    key: 'L07-performance',
    model: 'sonnet',
    title: 'Performance and hot paths',
    focus:
      'N+1 query patterns, unbounded loops, large FlatList without keyExtractor/getItemLayout, unnecessary re-renders (missing memo where prop instability is clear), heavy work in render, repeated identical fetches.',
    audit:
      'apps/api/src/services/**, apps/mobile/src/hooks/**, apps/mobile/src/lib/**, apps/mobile/src/components/**.',
    write:
      'apps/mobile/src/hooks/** (EXCLUDING use-auth*, use-mentor-language-sync), apps/mobile/src/lib/** (EXCLUDING auth/, navigation-contract*, error-*).',
  },
  {
    key: 'L08-schema-contract',
    model: 'sonnet',
    title: 'Schema contract and API types',
    focus:
      'Zod schemas that drift from DB, missing safeParse at API boundaries, local redefinition of @eduagent/schemas types, optional fields that should be required, missing CHECK-constraint mirrors, dates not via isoDateField.',
    audit:
      'packages/schemas/**, apps/api/src/routes/** (response shapes), apps/api/src/services/**.',
    write:
      'packages/schemas/src/** (EXCLUDING index.ts barrel — owned by L05), packages/database/src/**.',
  },
  {
    key: 'L09-inngest-jobs',
    model: 'opus',
    title: 'Background jobs and Inngest',
    focus:
      'Bare inngest.send without // core-send: comment (G3 violation), non-idempotent step.run, missing retry config, dead-letter handling gaps, step output drift, fire-and-forget from route handlers.',
    audit:
      'apps/api/src/inngest/**, apps/api/src/routes/** (for fire-and-forget patterns), apps/api/src/services/**.',
    write: 'apps/api/src/inngest/**, apps/api/src/services/safe-non-core.ts.',
  },
  {
    key: 'L10-db-migrations',
    model: 'opus',
    title: 'Database and migration safety',
    focus:
      'Destructive migrations missing rollback notes, push-vs-migrate discipline, transaction boundary correctness, neon-serverless gotchas (Date object handling), missing PgTransaction → Database cast, FK without ON DELETE behavior.',
    audit:
      'apps/api/drizzle/**, apps/api/migrations/**, apps/api/src/db/migrate*, packages/database/migrations/**, packages/schemas/src/common.ts.',
    write:
      'apps/api/drizzle.config.*, packages/database/src/migrate*, apps/api/src/db/migrate*. DO NOT edit existing migration .sql files (immutable); write a follow-up migration if needed.',
  },
  {
    key: 'L11-error-observability',
    model: 'sonnet',
    title: 'Error handling and observability',
    focus:
      'Silent catch with no escalation in billing/auth/webhook code, console.warn-only recovery (banned), missing Sentry breadcrumbs, missing structured metrics for fallback paths, log level misuse.',
    audit:
      'apps/api/src/** (all catch blocks), apps/mobile/src/lib/error-*, all Stripe/Clerk/RevenueCat webhook handlers.',
    write:
      'apps/api/src/lib/sentry.ts (if exists), apps/api/src/lib/observability/**, apps/mobile/src/lib/error-classifier*, apps/mobile/src/lib/error-fallback*. Cross-cutting fixes (silent catch in routes/services) → escalate.',
  },
  {
    key: 'L12-a11y-i18n',
    model: 'sonnet',
    title: 'Accessibility and i18n',
    focus:
      'Hardcoded English strings in JSX (no t() wrapper), missing testID on interactive elements (E2E coverage), missing accessibilityLabel/Role, locale completeness across 7 UI languages, multi-interpolation patterns.',
    audit:
      'apps/mobile/src/app/**, apps/mobile/src/components/**, apps/mobile/src/i18n/locales/*.json.',
    write:
      'apps/mobile/src/i18n/** (locales, helpers), apps/mobile/src/components/a11y/** (if exists). Hardcoded strings in screens/components → escalate (you cannot edit screens, only flag).',
  },
  {
    key: 'L13-dependencies',
    model: 'sonnet',
    title: 'Dependencies and supply chain',
    focus:
      'Mobile deps placed at root package.json (NativeWind trap — must be in apps/mobile/package.json), abandoned/outdated security-relevant packages, duplicate transitive resolutions, missing pin on transitive with known CVE.',
    audit:
      'package.json (root), apps/*/package.json, packages/*/package.json, pnpm-lock.yaml, .npmrc.',
    write:
      'package.json (root only — moving mobile deps OUT), apps/mobile/package.json, apps/api/package.json, packages/*/package.json. DO NOT regenerate pnpm-lock.yaml; report the change.',
  },
  {
    key: 'L14-config-secrets',
    model: 'sonnet',
    title: 'Configuration and secrets',
    focus:
      'Raw process.env in API code (G4 violation), hardcoded URLs/keys, EXPO_PUBLIC_ leakage of non-public values, missing Doppler indirection, secrets in eas.json or wrangler.toml.',
    audit:
      'apps/api/src/**, apps/mobile/src/**, eas.json, apps/api/wrangler.toml, scripts/**.',
    write:
      'apps/api/src/config/**, scripts/setup-env.js, scripts/render-wrangler-kv.mjs. Cross-cutting process.env fixes in services/routes → escalate.',
  },
  {
    key: 'L15-llm-ai-surface',
    model: 'opus',
    title: 'LLM / AI surface',
    focus:
      'Bare JSON or [MARKER] tokens in LLM output instead of structured envelope, missing hard caps on signal-driven flows (e.g., MAX_INTERVIEW_EXCHANGES), prompt injection vectors (cross-user data in prompt), hallucination guards missing, eval harness flow coverage gaps.',
    audit:
      'apps/api/src/services/llm/**, apps/api/src/services/**/*-prompts.ts, apps/api/src/services/challenge-round/**, apps/api/eval-llm/**.',
    write:
      'apps/api/src/services/llm/**, apps/api/src/services/**/*-prompts.ts, apps/api/src/services/challenge-round/**, apps/api/eval-llm/**.',
  },
];

phase('Review+Fix');

const results = await parallel(
  LENSES.map(
    (L) => () =>
      agent(
        [
          COMMON,
          '',
          'YOUR LENS: ' + L.title,
          'LENS KEY: ' + L.key,
          '',
          'WHAT TO LOOK FOR:',
          L.focus,
          '',
          'AUDIT SCOPE (read exhaustively):',
          L.audit,
          '',
          'OWNED-WRITE GLOBS (only these paths may be edited by you):',
          L.write,
          '',
          'WORKFLOW:',
          '1. Read CLAUDE.md at the worktree root for the full rule set.',
          '2. Walk your audit scope exhaustively — use Glob, Grep, Read. Do not stop at first finding.',
          '3. Classify each finding: critical (data loss/security/breaks user flow) / high (real bug, fix soon) / medium (best practice) / low (style).',
          '4. For each Critical/High inside your owned-write globs: edit the file → git add it → if security or correctness, write a break-test using red-green → run a surgical typecheck or test to verify → capture last lines of output as verificationEvidence.',
          '5. For each Critical/High OUTSIDE your owned-write globs: put it in escalated with file:line, description, reasonOutsideOwnedWrite, and suggestedFix.',
          '6. For each Medium/Low: top 20 in backlog.',
          '7. Call StructuredOutput with the schema and return.',
          '',
          'DO NOT exceed your owned-write globs even by one file. DO NOT commit or push. DO NOT edit migration .sql files. DO NOT regenerate pnpm-lock.yaml.',
        ].join('\n'),
        {
          label: L.key,
          phase: 'Review+Fix',
          model: L.model,
          schema: SCHEMA,
        },
      ),
  ),
);

return { results: results.filter(Boolean), lensCount: LENSES.length };
