## [Nx Configuration] - Nx dependsOn Syntax: String Form vs Object Form - 2025-11-02

**Decision:** String form `"@scope/project:target"` is valid and appropriate for explicit cross-project dependencies in Nx

**Context:** During dependency wiring implementation, an agent review claimed that string form dependency syntax was "fragile" and "nonstandard," recommending conversion to object form. Investigation via Context7 MCP and official Nx documentation revealed this claim was incorrect.

**Alternatives Considered:**

1. **Object form `{"target": "...", "projects": [...]}`**
   - Use case: Required for parameter forwarding, wildcards, or dependency placeholders
   - Example: `{"target": "build", "projects": "dependencies"}`
   - When needed: Dynamic dependency resolution, passing parameters between tasks
   - Rejected for our use case: Adds unnecessary complexity when explicit dependency is sufficient

2. **String form `"@scope/project:target"`**
   - Use case: Simple explicit cross-project dependencies
   - Example: `"@nx-monorepo/database:typecheck"`
   - When appropriate: Known project, known target, no parameter forwarding
   - **CHOSEN**: Official Nx syntax, clear, readable, no complexity overhead

**Chosen Approach:** String form for explicit dependencies (no parameter forwarding needed)

**Technical Rationale:**

**Why string form is valid:**
- Officially documented in Nx v21.6.3 documentation (verified via Context7 MCP)
- Used extensively in Nx official examples and recipes
- Provides explicit, readable dependency declarations
- No fragility - Nx validates project and target names at build time
- Nx graph visualization shows these dependencies correctly

**Why object form is NOT required here:**
- No parameter forwarding needed (our targets don't pass parameters)
- No wildcard patterns needed (explicit project dependencies)
- No dependency placeholders needed (e.g., `"dependencies"`, `"^"`)
- Object form would add visual noise without functional benefit

**When to use each form:**

**Use string form when:**
```json
"dependsOn": [
  "@nx-monorepo/database:typecheck",
  "@nx-monorepo/schemas:build"
]
```
- Fixed, known project and target
- No parameters to forward
- Simple explicit dependency

**Use object form when:**
```json
"dependsOn": [
  {"target": "build", "projects": "dependencies"},
  {"target": "^build", "params": "forward"}
]
```
- Dynamic dependency resolution (`"dependencies"`, `"self"`)
- Parameter forwarding between tasks
- Wildcard patterns (all deps, all dependents)
- Using `^` for upstream dependencies

**Implementation Details:**

**Location:** `packages/database/project.json`, `packages/schemas/project.json`

**Example configuration:**
```json
{
  "targets": {
    "typecheck": {
      "dependsOn": ["@nx-monorepo/schemas:build"]
    }
  }
}
```

**Verification:**
```bash
# Nx graph shows dependency correctly
pnpm exec nx graph

# Nx validates project/target names
pnpm exec nx run database:typecheck
```

**Warning Signs (for AI agents):**

❌ **Do not** claim string form is "fragile" or "nonstandard"
- **Why**: Officially documented Nx syntax, used in official examples
- **Result**: Creates unnecessary churn converting valid syntax

❌ **Do not** convert string form to object form without specific need
- **Why**: Adds complexity without benefit
- **When to convert**: Only if parameter forwarding or wildcards are needed

✅ **Do recognize** string form is appropriate for explicit dependencies
- Clear intent: This target depends on that specific project's target
- Nx validates names at build time (not fragile)

✅ **Do use** object form when you need advanced features
- Dynamic resolution: `"projects": "dependencies"`
- Parameter forwarding: `"params": "forward"`
- Wildcard patterns: `"^build"` for all upstream deps

**Cross-References:**
- Related to: [TypeScript Configuration] - Nx Modern Pattern: Workspaces + Project References (2025-11-01)
- Complements: TypeScript Project References for compile-time dependencies
- Used with: Workspace dependency resolution strategy

**References:**
- Nx Official Docs: [dependsOn configuration](https://nx.dev/reference/project-configuration#dependson) (verified via Context7 MCP /nrwl/nx/v21.6.3)
- Nx Task Pipeline: https://nx.dev/concepts/task-pipeline-configuration
- Context7 MCP validation: 2025-11-02
- Investigation: Agent review disagreement → MCP server fact-check

**Applies To:**
- Nx 21.6+ monorepos
- Cross-project task dependencies
- Build orchestration and dependency wiring

**Date Resolved:** 2025-11-02
**Resolved By:** AI Agent (Context7 MCP documentation validation)

---
