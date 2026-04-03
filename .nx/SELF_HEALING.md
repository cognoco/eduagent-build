# Self-Healing CI Rules

## Project Structure

pnpm monorepo with Nx. Packages: `@eduagent/schemas`, `@eduagent/database`, `@eduagent/retention`, `@eduagent/factory`, `@eduagent/test-utils`. Apps: `apps/api` (Hono/Cloudflare Workers), `apps/mobile` (Expo React Native).

## Fix Constraints

### Always

- Use named exports only (no default exports, except Expo Router pages)
- Use `async`/`await` (never `.then()` chains)
- Explicit return types on exported functions
- Import from package barrels (`@eduagent/schemas`), never internal paths
- Co-locate tests next to source (`foo.ts` -> `foo.test.ts`)

### Never

- Add `eslint-disable` comments to suppress errors — fix the underlying issue
- Add `@ts-ignore` or `@ts-expect-error` — fix the type error properly
- Modify test assertions to make them pass — fix the source code instead
- Add mocks to test files — use fixture-based test data
- Import `eq`, `and`, or table refs in route files — DB queries belong in services
- Import from `hono` in service files — services must be testable without mocking context
- Loosen TypeScript strict mode settings
- Add `any` type annotations

### Dependency Direction (strictly enforced)

```
apps/mobile  ->  @eduagent/schemas
apps/api     ->  @eduagent/schemas, @eduagent/database, @eduagent/retention
```

Packages never import from apps. Circular dependencies are build-breaking errors.

### Schemas

- Zod 4.x (`^4.1.12`) — not Zod 3. Breaking changes exist between versions.
- Client-facing types must be defined in `@eduagent/schemas`, not locally.

### API (Hono)

- All routes prefixed `/v1/`
- Zod validation on every input
- Error responses use `apiErrorSchema` / `ApiError` from `@eduagent/schemas`

### Database (Drizzle)

- `createScopedRepository(profileId)` for reads
- Writes must include `profileId` scoping via `and()` or `.values()`
