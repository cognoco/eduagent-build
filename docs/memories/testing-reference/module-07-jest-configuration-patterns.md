## Jest Configuration Patterns

This project follows Nx best practices for Jest configuration with a workspace-level preset pattern.

### Workspace Preset

All projects extend a shared `jest.preset.js` at the workspace root:

```javascript
// jest.preset.js
const nxPreset = require('@nx/jest/preset').default;
module.exports = { ...nxPreset };
```

This ensures consistent Jest behavior across all projects while allowing per-project customization.

### Project-Level Configuration

Each project has its own `jest.config.ts` that extends the workspace preset:

```typescript
// apps/web/jest.config.ts
export default {
  displayName: '@nx-monorepo/web',
  preset: '../../jest.preset.js',  // Extend workspace preset
  testEnvironment: 'jsdom',         // or 'node' for Node.js projects
  testMatch: ['<rootDir>/src/**/*.(spec|test).[jt]s?(x)'],
  coverageDirectory: '../../coverage/apps/web',
  // ... project-specific settings
};
```

**Note**: Next.js projects (like `apps/web`) use the `next/jest` wrapper with `testEnvironment: 'jsdom'` for browser-like testing. The Next.js Jest configuration also includes the `@nx/react/plugins/jest` transform for handling static assets and other Next.js-specific features.

### TypeScript Test Configuration

**Type Isolation Pattern**: Test types are separated from production types using `tsconfig.spec.json`:

```json
// apps/web/tsconfig.spec.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./out-tsc/jest",
    "types": ["jest", "node"]  // Test-specific types
  },
  "include": [
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/*.test.tsx",
    "src/**/*.spec.tsx"
  ],
  "references": [
    { "path": "./tsconfig.json" }  // Reference to production config
  ]
}
```

**Important**: Production `tsconfig.json` should NOT include test types. Keep test types isolated to `tsconfig.spec.json`.

### Adding Jest to New Projects

To add Jest testing to a new project:

```bash
# Generate Jest configuration for a project
pnpm exec nx g @nx/jest:configuration <project-name>
```

Nx automatically:
- Creates `jest.config.ts` extending the workspace preset
- Creates `tsconfig.spec.json` with proper type isolation
- Adds test target to `project.json`
- Configures coverage directory

**No manual setup required** - Nx handles all configuration automatically.

**Mandatory Testing Enhancements for UI Packages**: UI packages (web, mobile) MUST use jest-dom, user-event, and MSW 2.0 as documented in Pattern 10 (`adopted-patterns.md`). This is constitutional requirement (Principle I) to ensure consistent testing quality and eliminate decision overhead for AI agents.

**Testing Enhancement Versions**:
- `@testing-library/jest-dom` - Latest (v6.0+, no `extend-expect` needed)
- `@testing-library/user-event` - v14.5.0+ (all methods return `Promise<void>`)
- `msw` - **v2.0+** (breaking changes from v1.x: use `http` not `rest`, `HttpResponse` not `ctx`)

See Pattern 10 in `adopted-patterns.md` for MSW 2.0 setup examples and breaking changes documentation. See `post-generation-checklist.md` for setup steps after generating new UI packages.

Non-UI packages (Node.js libraries, pure logic) use basic Jest without these enhancements.

---
