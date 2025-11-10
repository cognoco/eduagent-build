## [TypeScript Configuration] - Nx Modern Pattern: Workspaces + Project References (Not Manual Paths) - 2025-11-01

**Decision:** Use pnpm workspaces with TypeScript Project References for cross-package imports, NOT manual `paths` in `tsconfig.base.json`

**Context:** Server build failed with "Cannot find module '@nx-monorepo/database'" after removing manual path mappings during TypeScript configuration cleanup. Investigation revealed conflicting approaches between two agents regarding the correct Nx pattern.

**Alternatives Considered:**
1. **Manual paths in tsconfig.base.json** - Rejected because:
   - Nx official docs explicitly state this is the OLD pattern
   - Listed as "common pitfall" in Nx community best practices
   - Creates maintenance overhead (manual updates required)
   - Conflicts with TypeScript Project References

2. **Keep paths AND add workspace dependencies** - Rejected because:
   - Redundant configuration (two ways to do the same thing)
   - Paths override Nx's automatic dependency management
   - Violates DRY principle

**Chosen Approach:** pnpm workspaces + TypeScript Project References + package.json workspace dependencies

**Implementation Requirements:**
1. **pnpm-workspace.yaml** must define workspace pattern:
   ```yaml
   packages:
     - apps/*
     - packages/*
   ```

2. **Consuming packages** must declare workspace dependencies in package.json:
   ```json
   "dependencies": {
     "@nx-monorepo/database": "workspace:*",
     "@nx-monorepo/schemas": "workspace:*"
   }
   ```

3. **Run `pnpm install`** after adding workspace dependencies to create symlinks in node_modules

4. **TypeScript Project References** in consuming package tsconfig.json:
   ```json
   "references": [
     {"path": "../../packages/database/tsconfig.lib.json"},
     {"path": "../../packages/schemas/tsconfig.lib.json"}
   ]
   ```

**Technical Rationale:**
- **Performance**: TypeScript Project References enable incremental builds
- **Accuracy**: Package manager handles version resolution and linking
- **Maintainability**: Nx automatically manages dependencies via dependency graph
- **Standards**: Aligns with modern Nx documentation (v21+)

**Pattern 2 Violation Fix:**
Libraries were overriding `moduleResolution: "nodenext"` instead of inheriting `"bundler"` from tsconfig.base.json:
- **Root cause**: Per Pattern 2 in adopted-patterns.md, production configs should inherit from base
- **Fix**: Removed `moduleResolution`, `module`, and `baseUrl` overrides from all library tsconfig.lib.json files
- **Result**: Libraries now correctly inherit `moduleResolution: "bundler"` from base

**ESM Import Extensions:**
With TypeScript `moduleResolution: "nodenext"` (used in test configs and server app), relative imports MUST use explicit .js extensions:
- **Applies to**: Dynamic imports in test files, local imports in production code when compiled by "nodenext" context
- **Example**: `import('./health')` → `import('./health.js')`
- **Rationale**: TypeScript ESM standard requires explicit extensions with "nodenext" resolution

**Jest Config Files with type: "module":**
All packages use `"type": "module"` in package.json (established pattern). Jest config files must use `.cjs` extension:
- **Error without fix**: "require is not defined in ES module scope"
- **Solution**: Rename `jest.config.js` → `jest.config.cjs`
- **Applies to**: All packages with `"type": "module"` in package.json

**Verification Commands:**
```bash
# Database typecheck (no build target - uses --bundler=none)
pnpm exec nx run database:typecheck

# Schemas build
pnpm exec nx run schemas:build

# Server build (critical test - imports from workspace packages)
pnpm exec nx run server:build

# Dependency graph visualization
pnpm exec nx graph --file=graph.html
```

**Success Criteria:**
✅ No manual paths in tsconfig.base.json
✅ Workspace dependencies declared in consuming packages
✅ Libraries inherit moduleResolution from base (Pattern 2 compliance)
✅ All imports use .js extensions where required (ESM standard)
✅ Jest configs use .cjs extension for ESM packages
✅ Server build succeeds with workspace package imports resolving correctly
✅ Nx dependency graph shows clean structure

**Warning Signs (for AI agents):**

❌ **Do not** add manual paths to tsconfig.base.json to "fix" import errors
- **Why**: Old pattern that conflicts with modern Nx workspaces
- **Instead**: Add workspace dependencies to consuming package's package.json

❌ **Do not** suggest removing `"type": "module"` from packages
- **Why**: Established consistent pattern across all workspace packages
- **Instead**: Rename jest.config.js to .cjs for ESM compatibility

❌ **Do not** override moduleResolution in library tsconfig.lib.json
- **Why**: Violates Pattern 2 - libraries should inherit from base
- **Instead**: Only override in test configs (tsconfig.spec.json) and Node.js apps (tsconfig.app.json)

✅ **Do** add workspace dependencies with `"workspace:*"` version
- Required for package manager to link workspace packages
- Run `pnpm install` after adding

✅ **Do** use explicit .js extensions in imports when required
- Test files (use "nodenext")
- Production code when consumed by "nodenext" context

**References:**
- Nx Official Docs: [Switch to Workspaces and Project References](https://nx.dev/technologies/typescript/recipes/switch-to-workspaces-project-references)
- Community Best Practice: ["Manually editing path mappings" listed as common pitfall](https://mayallo.com/nx-monorepo-typescript-configurations/)
- TypeScript ESM: Requires explicit .js extensions with moduleResolution "nodenext"
- Investigation findings: Sequential Thinking MCP (10 thoughts), Vibe-Check MCP validation
- Context7 MCP: TypeScript compiler documentation on paths vs Project References
- Exa MCP: Nx monorepo configuration patterns

**Applies To:**
- Nx 21.6+ monorepos using pnpm workspaces
- TypeScript 5.9+ with Project References
- Cross-package imports in monorepo applications
- ESM packages with Jest testing

**Date Resolved:** 2025-11-01
**Resolved By:** AI Agent (investigation-first approach with MCP server validation)

---
