## Test File Location

Tests are co-located with their source files in the `src/` directory, following Next.js 15 best practices.

**Pattern**: Place test files next to the code they test
- `src/app/page.tsx` → `src/app/page.spec.tsx`
- `src/components/Button.tsx` → `src/components/Button.spec.tsx`

**Naming**: Use `.spec.tsx` or `.test.tsx` suffix

**Jest Configuration** (`apps/web/jest.config.ts`):
```typescript
testMatch: [
  '<rootDir>/src/**/*.(spec|test).[jt]s?(x)',
],
collectCoverageFrom: [
  'src/**/*.{ts,tsx,js,jsx}',
  '!src/**/*.spec.{ts,tsx,js,jsx}',
  '!src/**/*.test.{ts,tsx,js,jsx}',
],
```

**Rationale**:
- Aligns with Next.js 15 App Router conventions
- Improves developer experience (tests near code)
- Simplifies imports (relative paths shorter)
- Industry standard for component-based architectures (2025)

---
