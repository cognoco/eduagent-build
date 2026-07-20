import nx from '@nx/eslint-plugin';
import noInternalJestMock from './eslint-rules/no-internal-jest-mock.mjs';
import inngestAdminTag from './eslint-rules/inngest-admin-tag.mjs';
import noRawErrorToSentry from './eslint-rules/no-raw-error-to-sentry.mjs';

// Filter out jsx-a11y/accessible-emoji rule from react config
// (deprecated in eslint-plugin-jsx-a11y v6.6.0, removed in later versions)
const reactConfigFiltered = nx.configs['flat/react'].map((config) => {
  if (config.rules && 'jsx-a11y/accessible-emoji' in config.rules) {
    const { 'jsx-a11y/accessible-emoji': _, ...rules } = config.rules;
    return { ...config, rules };
  }
  return config;
});

// Local plugin for project-wide rules (mobile has its own additions in
// apps/mobile/eslint.config.mjs). `meta.name` lets ESLint v9 surface a
// stable namespace in --print-config / --debug output.
const govPlugin = {
  meta: { name: 'gov' },
  rules: {
    'no-internal-jest-mock': noInternalJestMock,
    'inngest-admin-tag': inngestAdminTag,
    'no-raw-error-to-sentry': noRawErrorToSentry,
  },
};

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  // G6 — fail the build on stale `eslint-disable` directives. Without this
  // setting they accumulate silently as code is refactored, hiding the fact
  // that the suppression is no longer needed (and sometimes hiding real
  // violations the rule would otherwise catch). Positioned AFTER the nx
  // config spreads so a future nx preset that sets reportUnusedDisableDirectives
  // does not silently override our 'error' value (last-match-wins).
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    ignores: ['**/dist', '**/out-tsc', '**/coverage', '**/.nx', '**/.wrangler', 'design_handoff_ui_improvements/**', 'docs/_archive/**', '.agents/**', '.claude/**'],
  },
  // -------------------------------------------------------------------------
  // GC1 — warn on jest.mock() of internal (relative-path) modules. Internal
  // mocks hide real bugs; mocks should be reserved for external boundaries
  // (Stripe, Clerk JWKS, third-party SDKs, push providers, time). At `warn`
  // severity for now: ~260 legacy violations exist and are tracked toward
  // a separate cleanup epic; this rule's job is to stop NEW violations.
  // See AGENTS.md > Code Quality Guards.
  // -------------------------------------------------------------------------
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
    plugins: { gov: govPlugin },
    rules: {
      'gov/no-internal-jest-mock': 'warn',
      // ---------------------------------------------------------------------
      // Governance Rule G7 — ban silently-skipped tests. Direct .skip() calls
      // and xit/xdescribe/xtest aliases let dead tests accumulate in the
      // suite while staying invisible. Conditional skips like
      // `(hasDb ? describe : describe.skip)('integration', ...)` remain
      // allowed: the call's callee is a ConditionalExpression, not a
      // MemberExpression, so it does not match these selectors.
      // .todo() is also banned; create a tracked ticket instead.
      // See docs/_archive/plans/done/2026-05-03-governance-audit.md.
      // ---------------------------------------------------------------------
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.name=/^(it|test|describe)$/][callee.property.name='skip']",
          message:
            'Do not commit .skip() tests. Either fix the test, delete it with a clear reason, or use a conditional callee like `(hasDb ? describe : describe.skip)(...)` for env-gated suites.',
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.object.name='it'][callee.property.name='todo']",
          message:
            'Do not commit it.todo(). Open a tracked ticket for the missing test instead.',
        },
        {
          selector:
            "CallExpression[callee.type='Identifier'][callee.name=/^x(it|describe|test)$/]",
          message:
            'Do not commit xit/xdescribe/xtest. Either fix the test, delete it, or use a conditional callee like `(hasDb ? describe : describe.skip)(...)` for env-gated suites.',
        },
      ],
    },
  },
  // React/Expo config for mobile app (with deprecated rule filtered out)
  {
    files: ['apps/mobile/**/*.ts', 'apps/mobile/**/*.tsx', 'apps/mobile/**/*.js', 'apps/mobile/**/*.jsx'],
  },
  ...reactConfigFiltered.map(config => ({
    ...config,
    files: ['apps/mobile/**/*.ts', 'apps/mobile/**/*.tsx', 'apps/mobile/**/*.js', 'apps/mobile/**/*.jsx'],
  })),
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$', '@eduagent/api'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  // -------------------------------------------------------------------------
  // G8 — mobile may only TYPE-import from @eduagent/api. A runtime import
  // (`import { x } from '@eduagent/api'`) pulls the entire API server —
  // Hono, drizzle, every service — into the mobile bundle. The convention
  // was previously honored by discipline alone: @eduagent/api is whitelisted
  // in @nx/enforce-module-boundaries above (so the RPC `import type { AppType }`
  // resolves), which means the boundaries rule does NOT catch a runtime
  // import. This closes that gap.
  //
  // Uses @typescript-eslint/no-restricted-imports (not the base rule) so
  // `allowTypeImports: true` lets `import type { AppType }` through while
  // banning value imports. Mirrors the route-level @eduagent/database guard
  // (G5 gap, BUG-676). Test files share the production bundle constraint —
  // a runtime import in a test would still mean the symbol is importable —
  // but tests are not bundled into the app, so they are not excluded here;
  // no mobile test imports @eduagent/api at runtime today and the ban is
  // harmless to them.
  //
  // See AGENTS.md > Known Exceptions to Engineering Rules
  // ("Type-only imports from @eduagent/api are accepted; runtime imports
  // remain forbidden").
  // -------------------------------------------------------------------------
  // NOTE on globs: the mobile project has its own apps/mobile/eslint.config.mjs
  // which imports this baseConfig. When ESLint runs from the apps/mobile cwd it
  // loads THAT config, so `files` globs in this spread-in base are matched
  // relative to apps/mobile/ — i.e. `apps/mobile/**` never matches (the path is
  // just `src/...`). We therefore list BOTH the repo-root form (`apps/mobile/**`,
  // used when ESLint runs from the workspace root) and the mobile-relative form
  // (`src/**`). The bare `src/**` form can also match api/packages when ESLint
  // runs from their cwd, but that is harmless: only the @eduagent/api specifier
  // is restricted, and no api/packages code imports it (verified 2026-05-29).
  {
    files: [
      'apps/mobile/**/*.ts',
      'apps/mobile/**/*.tsx',
      'src/**/*.ts',
      'src/**/*.tsx',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@eduagent/api',
              message:
                'Mobile may only type-import from @eduagent/api (`import type { AppType } from "@eduagent/api"`). A runtime/value import bundles the entire API server (Hono, drizzle, services) into the mobile app. See AGENTS.md > Known Exceptions to Engineering Rules.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
    rules: {
      // Test files use jest.mock() with factories, which NX misinterprets as
      // lazy-loading. This taints the library and blocks static imports in
      // source files. Disable the rule for tests — they are not architectural.
      '@nx/enforce-module-boundaries': 'off',
      // Non-null assertions (result!) are safe in tests.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Test mocks and fixtures routinely use any.
      '@typescript-eslint/no-explicit-any': 'off',
      // Re-enabled with allowShortCircuit/allowTernary for common test patterns.
      // Bare function calls (screen.getByTestId etc.) are already exempt —
      // the rule only flags non-call expressions with no side effects.
      '@typescript-eslint/no-unused-expressions': ['error', {
        allowShortCircuit: true,
        allowTernary: true,
      }],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
  // -------------------------------------------------------------------------
  // Governance Rule 1 + Rule 3 (combined config for routes and services).
  //
  // Flat-config rules do not merge by key — when two configs both set
  // `no-restricted-imports` and both match a file, only the LAST config's
  // value applies. Routes are matched by both the route-specific G1 glob
  // and the broader G3 glob, so we MUST emit both rule lists in the same
  // config block targeting the narrower glob, otherwise G3 silently
  // overrides G1 and the drizzle-orm restriction becomes a no-op for
  // routes. The selftest in apps/api/src/eslint-governance.selftest.test.ts
  // catches that regression.
  //
  // G1 — drizzle-orm primitives must not be imported in API route files.
  //      Routes keep handlers inline for RPC inference but business logic
  //      and DB access belong in services/* via createScopedRepository.
  // G3 — direct LLM provider SDK imports are restricted to the provider
  //      adapters under services/llm/providers/**. All other code must call
  //      services/llm/router.ts (or its barrel) so the router's
  //      retry/fallback/cost-metering logic stays the single chokepoint.
  // See AGENTS.md > Non-Negotiable Engineering Rules.
  // -------------------------------------------------------------------------
  // First, the broad G3 rule for everything under apps/api/src (except
  // provider adapters). Routes get their own override below.
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: [
      'apps/api/src/services/llm/providers/**/*.ts',
      'apps/api/src/routes/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@anthropic-ai/sdk',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
            {
              name: 'openai',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
            {
              name: '@google-ai/generativelanguage',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
            {
              name: '@google/generative-ai',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
            {
              name: '@google/genai',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
            {
              name: '@google-cloud/vertexai',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
          ],
        },
      ],
    },
  },
  // Routes-only override: combine G1 (drizzle-orm) + G3 (LLM SDKs) so neither
  // is dropped by last-match-wins semantics.
  {
    files: ['apps/api/src/routes/**/*.ts'],
    // Test files legitimately import drizzle-orm for seed/teardown helpers —
    // the restriction targets production route handlers only.
    //
    // G3 (LLM SDK) note: the ignores below also silence the G3 ban on route
    // test files. This is intentional and safe because:
    //   (a) No route test file currently imports an LLM SDK directly — the
    //       shared `llm-provider-fixtures.ts` harness is used instead.
    //   (b) The broader G3 override at the top of this config (files:
    //       ['apps/api/src/services/llm/providers/**']) already enforces the
    //       correct production boundary where LLM SDK imports ARE allowed.
    //   (c) Route test files are not production route handlers; a G3 violation
    //       in a test file would be caught in code review and by the
    //       integration-mock-guard rather than by this lint rule.
    ignores: [
      'apps/api/src/routes/**/*.test.ts',
      'apps/api/src/routes/**/*.integration.test.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'drizzle-orm',
              message:
                'Route files must not import drizzle-orm primitives. Move DB access to services/* and use createScopedRepository(profileId). See AGENTS.md.',
            },
            {
              name: '@anthropic-ai/sdk',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
            {
              name: 'openai',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
            {
              name: '@google-ai/generativelanguage',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
            {
              name: '@google/generative-ai',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
            {
              name: '@google/genai',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
            {
              name: '@google-cloud/vertexai',
              message:
                'Import the LLM router from services/llm instead. Direct SDK imports are only allowed in services/llm/providers/**.',
            },
          ],
          patterns: [
            {
              group: ['drizzle-orm/*'],
              message:
                'Route files must not import drizzle-orm primitives. Move DB access to services/* and use createScopedRepository(profileId). See AGENTS.md.',
            },
          ],
        },
      ],
      // G5 gap closed — BUG-676: ban value imports of @eduagent/database in
      // route files. Uses @typescript-eslint/no-restricted-imports (not the
      // base rule) because `allowTypeImports: true` lets `import type { Database }`
      // through — routes legitimately need the Database type for Hono Variables
      // typing. Runtime imports of schema tables (e.g. `webhookIdempotencyKeys`)
      // must live in services/* where createScopedRepository can enforce scoping.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@eduagent/database',
              message:
                'Route files must not import @eduagent/database values. Move schema table access to services/*. Type-only imports (`import type { Database }`) remain allowed. See AGENTS.md.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  // -------------------------------------------------------------------------
  // Governance Rule 4 + G4 (api default-export ban) — combined because flat
  // config rules don't merge by key and both target apps/api/src/**.
  //
  // Rule 4: raw process.env reads are banned in API production code. Use the
  //   typed config object in apps/api/src/config.ts. The env-validation
  //   middleware and the test-only fallbacks in middleware/llm and
  //   inngest/helpers are explicitly allow-listed below.
  //
  // G4 (api): default exports are reserved for the Worker entrypoint at
  //   apps/api/src/index.ts (Cloudflare Workers require `export default`).
  //   Anywhere else in the API source, named exports keep imports searchable
  //   and prevent accidental rename drift — same rationale as the mobile G4
  //   rule in apps/mobile/eslint.config.mjs.
  //
  // See AGENTS.md > Repo-Specific Guardrails.
  // -------------------------------------------------------------------------
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: [
      'apps/api/src/config.ts',
      'apps/api/src/middleware/env-validation.ts',
      'apps/api/src/middleware/llm.ts',
      'apps/api/src/inngest/helpers.ts',
      'apps/api/src/**/*.test.ts',
      'apps/api/src/**/*.spec.ts',
      'apps/api/src/**/*.integration.test.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.name='process'][property.name='env']",
          message:
            'Use the typed config object from apps/api/src/config.ts instead of raw process.env. See AGENTS.md.',
        },
        {
          selector: 'ExportDefaultDeclaration',
          message:
            'Default exports are reserved for the Worker entrypoint (apps/api/src/index.ts). Use a named export elsewhere. See AGENTS.md.',
        },
      ],
    },
  },
  // G4 (api) — Worker entrypoint allow-list. index.ts must `export default`
  // its fetch handler for Cloudflare Workers; keep the process.env ban
  // active here but drop the ExportDefaultDeclaration selector.
  {
    files: ['apps/api/src/index.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.name='process'][property.name='env']",
          message:
            'Use the typed config object from apps/api/src/config.ts instead of raw process.env. See AGENTS.md.',
        },
      ],
    },
  },
  // -------------------------------------------------------------------------
  // Governance Rule 5 — route files must not call .select/.insert/.update/
  // .delete directly on the typed-context db handle (`c.get('db')`).
  // Companion to Rule 1 (no drizzle-orm imports in routes): without this
  // rule, a route could still write `c.get('db').select().from(table)` and
  // satisfy the import-only check. Move the query into services/* and use
  // createScopedRepository(profileId).
  // See AGENTS.md > Non-Negotiable Engineering Rules ("Reads must use
  // createScopedRepository(profileId)"; "Route files must not import ORM
  // primitives, schema tables, or createScopedRepository").
  //
  // Positioned AFTER Rule 4 so the routes-files override of
  // no-restricted-syntax wins for routes. Both selectors are included so
  // Rule 4 (raw process.env ban) still applies to routes too — flat config
  // re-specifying the same rule replaces the prior value, so we re-list the
  // process.env selector here.
  //
  // KNOWN GAP: the selector below catches `c.get('db').select()` directly on
  // the call chain but does NOT catch the destructured / aliased forms:
  //   const { db } = c.var; db.select().from(table);
  //   const db = c.get('db'); db.select().from(table);
  // These bypasses are covered by Rule 1 (no drizzle-orm imports in routes)
  // — without `eq`, `and`, `from`, etc. there's no way to actually express a
  // useful query, so the import ban is the primary backstop. The shared
  // schema barrel is also banned in routes, so even raw `db.select()` calls
  // need a table reference that has to come through services. Keep both
  // rules in place; widening this selector to AST-walk through aliases is
  // brittle and Rule 1 already pays for the coverage.
  // -------------------------------------------------------------------------
  {
    files: ['apps/api/src/routes/**/*.ts'],
    ignores: [
      'apps/api/src/routes/**/*.test.ts',
      'apps/api/src/routes/**/*.spec.ts',
      'apps/api/src/routes/**/*.integration.test.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.name='process'][property.name='env']",
          message:
            'Use the typed config object from apps/api/src/config.ts instead of raw process.env. See AGENTS.md.',
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(select|insert|update|delete)$/][callee.object.type='CallExpression'][callee.object.callee.object.name='c'][callee.object.callee.property.name='get'][callee.object.arguments.0.value='db']",
          message:
            "Route files must not call .select/.insert/.update/.delete directly on c.get('db'). Move the query into services/* and use createScopedRepository(profileId). See AGENTS.md. Note: this rule catches the c.get('db').op() chain; const-destructured db patterns (const db = c.get('db'); db.select()) are caught by G1 (no drizzle-orm imports in routes).",
        },
        {
          selector: 'ExportDefaultDeclaration',
          message:
            'Default exports are reserved for the Worker entrypoint (apps/api/src/index.ts). Use a named export elsewhere. See AGENTS.md.',
        },
      ],
    },
  },
  // -------------------------------------------------------------------------
  // no-raw-error-to-sentry (WI-2352) — forbid a JSON.parse/Zod-.parse/
  // DB-driver catch binding reaching captureException/captureMessage
  // directly or via `.message`; the wrapped content-free
  // `new Error(label, { cause: {...} })` pattern (services/llm/providers/
  // errors.ts) must be used instead. Scoped to apps/api/src production code,
  // same as the other governance rules above — test files are excluded
  // since they may legitimately construct raw-error fixtures.
  // See eslint-rules/no-raw-error-to-sentry.mjs for the full heuristic.
  //
  // Severity `warn` for now — same forward-only-ratchet shape as GC1/GC5
  // above: a pre-existing backlog of 18 call sites across 16 files (found
  // when this rule was authored) is tracked in WI-2527 (burn down the
  // backlog + promote this rule to `error`). This rule's job today is to
  // stop NEW violations landing, not to block on the legacy backlog.
  // -------------------------------------------------------------------------
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: [
      'apps/api/src/**/*.test.ts',
      'apps/api/src/**/*.spec.ts',
      'apps/api/src/**/*.integration.test.ts',
    ],
    plugins: { gov: govPlugin },
    rules: {
      'gov/no-raw-error-to-sentry': 'warn',
    },
  },
  // -------------------------------------------------------------------------
  // GC5 — Inngest functions that bypass createScopedRepository must declare
  // their profile-scoping intent via a file-level `// @inngest-admin: <reason>`
  // annotation. The annotation forces conscious review whenever a function
  // touches the DB without scoped-repo isolation.
  //
  // Promoted from `warn` to `error` on 2026-05-29 after verifying the backlog
  // is fully burned down: `pnpm exec eslint 'src/inngest/functions/**/*.ts'
  // --max-warnings 0` from apps/api reports 0 violations across all 121
  // function files (every function now either imports createScopedRepository
  // or carries an accurate `// @inngest-admin: <reason>` preamble). This is
  // the promotion condition the governance audit (item GC5) gated on. As an
  // `error` it is now a forward-only ratchet: a NEW Inngest function that
  // reaches for raw db.X without scoped-repo or the annotation fails CI.
  // See docs/_archive/plans/done/2026-05-03-governance-audit.md (item GC5).
  // -------------------------------------------------------------------------
  {
    files: ['apps/api/src/inngest/functions/**/*.ts'],
    ignores: [
      'apps/api/src/inngest/functions/**/*.test.ts',
      'apps/api/src/inngest/functions/**/*.integration.test.ts',
    ],
    plugins: { gov: govPlugin },
    rules: {
      'gov/inngest-admin-tag': 'error',
    },
  },
];
