## Coverage Testing

### Coverage Scripts

The workspace provides convenient scripts for running tests with coverage reporting:

```bash
# Run coverage for all projects
pnpm run test:coverage

# Run coverage for specific projects
pnpm run test:coverage:web
pnpm run test:coverage:server
```

### Coverage Thresholds

All projects use standardized coverage thresholds that ramp during Phase 1:

```typescript
// apps/web/jest.config.ts
coverageThreshold: {
  global: {
    branches: 10,    // Target: 80% (Phase 2+)
    functions: 10,   // Target: 80% (Phase 2+)
    lines: 10,       // Target: 80% (Phase 2+)
    statements: 10   // Target: 80% (Phase 2+)
  }
}
```

**Until Stage 5 (Walking Skeleton implementation)**: 10% — permissive while establishing infrastructure (Stages 0–4).

**Stage 5 (Walking Skeleton)**: 60% — raise coverage for the end-to-end slice to validate testing pipeline quality.

**Target thresholds (80%)**: Will be enforced starting in Phase 2 when feature development begins.

**Coverage metrics explained**:
- **Statements**: Individual lines of code executed
- **Lines**: Physical lines in the file that were executed
- **Functions**: Whether each function was called
- **Branches**: Decision points tested (if/else, switch, ternaries, &&, ||)

### Coverage Reports

After running coverage, HTML reports are generated in `coverage/<project>/index.html`:

```bash
# Run coverage for web app
pnpm run test:coverage:web

# Open the HTML report (manual)
# Windows: start coverage/apps/web/index.html
# Mac: open coverage/apps/web/index.html
# Linux: xdg-open coverage/apps/web/index.html
```

Reports show:
- Per-file coverage percentages
- Highlighted uncovered lines
- Branch coverage visualization
- Drilldown from project → file → line level

### Coverage Directory Structure

Coverage reports follow a consistent pattern across all projects:

```
coverage/
  apps/
    web/
      index.html          # HTML report entry point
      app/                # Per-directory coverage
      page.tsx.html       # Per-file coverage details
      lcov.info           # LCOV format for CI/tooling
      coverage-final.json # Raw coverage data
    server/
      index.html
      lcov.info
      coverage-final.json
  packages/
    database/
      index.html
      lcov.info
      coverage-final.json
```

**Pattern**: `coverageDirectory: '../../coverage/<type>/<name>'` in each project's `jest.config.ts`

The `/coverage` directory is gitignored - reports are generated locally and in CI but not committed.

### Adding Coverage to New Projects

When generating a new project with Jest:

```bash
pnpm exec nx g @nx/jest:configuration <project-name>
```

Then manually add coverage threshold to the generated `jest.config.ts`:

```typescript
coverageThreshold: {
  global: {
    branches: 10,    // Target: 80% (Phase 2+)
    functions: 10,   // Target: 80% (Phase 2+)
    lines: 10,       // Target: 80% (Phase 2+)
    statements: 10   // Target: 80% (Phase 2+)
  }
}
```

And ensure `coverageDirectory` follows the pattern: `'../../coverage/<apps|packages>/<project-name>'`

---
