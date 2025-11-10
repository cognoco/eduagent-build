# Serena MCP Operational Workflow

## Overview

Serena MCP is a semantic code navigation tool that provides AI agents with efficient symbol-level exploration capabilities. This guide covers the complete operational workflow from initial setup to daily usage and maintenance.

## Quick Reference

| Scenario | Command |
|----------|---------|
| Initial setup | See "Initial Setup" section below |
| Daily coding | Use Serena navigation tools via agent |
| After major refactor | `uvx --from git+https://github.com/oraios/serena serena project index` |
| Check config | `serena config` (if available) |
| Troubleshoot indexing | Delete `.serena/cache/` and re-index |

---

## Initial Setup

**Prerequisites:**
- Project must be registered in MCP server config (e.g., `~/.cursor/mcp.json`)
- Python/uvx installed for CLI operations

**Setup sequence:**

1. **Generate project configuration**
   ```bash
   cd /path/to/project
   uvx --from git+https://github.com/oraios/serena serena project generate-yml --language typescript
   ```
   - Creates `.serena/project.yml` with language settings
   - For this monorepo, language is `typescript`

2. **Index the project**
   ```bash
   uvx --from git+https://github.com/oraios/serena serena project index
   ```
   - Scans all TypeScript files in the project
   - Creates symbol cache at `.serena/cache/typescript/document_symbols_cache_v23-06-25.pkl`
   - Progress bar shows files indexed
   - **Critical**: Do this BEFORE onboarding

3. **Verify project activation**
   - Agent: Use `mcp__serena__get_current_config` tool
   - Look for `Active project: <project-name>`
   - If not active, agent uses `mcp__serena__activate_project` tool

4. **Trigger onboarding**
   - Agent: Use `mcp__serena__check_onboarding_performed` tool
   - If not onboarded, use `mcp__serena__onboarding` tool
   - Serena creates operational memories in `.serena/memories/`

---

## Daily Usage

**For AI Agents:**

Serena provides navigation tools accessible via MCP:

- **`find_symbol`** - Search for symbols by name/pattern
  - Example: Find all classes named "Client"
  - Example: Find method "processRequest" in any class

- **`get_symbols_overview`** - Get file structure overview
  - Example: What symbols are defined in `src/routes/health.ts`?

- **`find_referencing_symbols`** - Find where symbol is used
  - Example: Where is the `healthCheckRouter` imported?

- **`search_for_pattern`** - Flexible pattern-based search
  - Example: Find all files containing "Prisma" imports

**Integration with Cogno:**

- Serena reads Cogno memories on-demand during execution
- Serena does NOT cache Cogno content (avoids duplication)
- Cogno = governance source of truth, Serena = navigation tool

---

## Maintenance

### When to Re-Index

Re-indexing updates Serena's symbol cache to reflect codebase changes:

**Required re-indexing:**
- Major refactor affecting many files
- Significant directory restructuring
- Language configuration changes

**Optional re-indexing:**
- After adding 10+ new files
- When navigation feels "stale"
- Performance optimization

**Not needed:**
- Small file edits (Serena updates incrementally)
- Cogno documentation changes (Serena reads on-demand)
- Daily development work

**How to re-index:**
```bash
cd /path/to/project
uvx --from git+https://github.com/oraios/serena serena project index
```

### Cache Management

**Cache location:** `.serena/cache/typescript/`

**When to clear cache:**
- Indexing errors
- Stale symbol information
- Language server configuration changes

**How to clear cache:**
```bash
rm -rf .serena/cache/
# Then re-index
uvx --from git+https://github.com/oraios/serena serena project index
```

### Memory Management

**Memory location:** `.serena/memories/`

**What Serena memories contain:**
- Operational commands (development workflows)
- Code structure summaries (for quick context)
- Project-specific navigation patterns

**What Serena memories should NOT contain:**
- Cogno governance content (read from `docs/memories/` instead)
- Architectural decisions (maintained in `docs/architecture-decisions.md`)
- Standards/patterns (maintained in Cogno `adopted-patterns.md`)

**When to update Serena memories:**
- Project structure significantly changes
- Common navigation patterns evolve
- Onboarding process needs refinement

---

## Relationship to Cogno

**Coexistence principles:**

1. **Separate namespaces**: Cogno in `docs/memories/`, Serena in `.serena/`
2. **Different purposes**: Cogno = governance, Serena = navigation
3. **One-way reading**: Serena reads Cogno on-demand, never writes to it
4. **Cogno takes priority**: When conflict, Cogno governance wins

**Workflow:**
1. Check Cogno for standards/patterns (before implementing)
2. Use Serena to navigate and explore efficiently
3. Validate implementation against Cogno (before committing)

---

## Troubleshooting

### Issue: Agent says "onboarding not performed"

**Solution:**
1. Check if indexing was run: `ls .serena/cache/typescript/`
2. If no cache exists, run indexing first
3. Then trigger onboarding via agent

### Issue: Serena can't find symbols

**Possible causes:**
- Index is stale
- Language configuration incorrect
- Files not tracked by language server

**Solutions:**
1. Re-index: `uvx --from git+https://github.com/oraios/serena serena project index`
2. Check `.serena/project.yml` language setting
3. Verify files are not in `.gitignore` (if `ignore_all_files_in_gitignore: true`)

### Issue: Indexing hangs or fails

**Solutions:**
1. Check Python/uvx installation
2. Delete `.serena/cache/` and retry
3. Check for file permission issues
4. Verify language server is functioning (TypeScript installed)

### Issue: Duplicate information between Serena and Cogno

**This is a design problem, not a bug:**
- Serena memories should NOT duplicate Cogno content
- Review `.serena/memories/` and remove governance duplicates
- Keep only operational/navigation content in Serena

**Cleanup:**
```bash
cd .serena/memories/
# Review each file, delete if it duplicates Cogno
# Example: If "project_overview.md" duplicates README.md, delete it
```

---

## Advanced Configuration

### Project YAML (`.serena/project.yml`)

**Key settings:**

```yaml
languages:
  - typescript

encoding: "utf-8"

ignore_all_files_in_gitignore: true

ignored_paths: []  # Additional paths to ignore

read_only: false  # Set true to disable editing tools

excluded_tools: []  # List of tools to disable
```

**When to edit:**
- Adding additional languages (e.g., JavaScript)
- Changing file encoding
- Excluding specific tools

### Tool Selection

Serena provides many tools. For this monorepo:

**Essential tools:**
- `find_symbol`, `get_symbols_overview`, `find_referencing_symbols`
- `search_for_pattern`, `list_dir`, `read_memory`

**Editing tools (use with caution):**
- `replace_symbol_body`, `insert_after_symbol`, `insert_before_symbol`
- Only use when confident about symbol boundaries

**Thinking tools:**
- `think_about_collected_information`
- `think_about_task_adherence`
- `think_about_whether_you_are_done`

---

## References

- Serena documentation: https://oraios.github.io/serena/
- Serena GitHub: https://github.com/oraios/serena
- Cogno architecture: `docs/memories/zdx-cogno-architecture.md`
- AGENTS.md: `.ruler/AGENTS.md` (Serena MCP section)

---

**Last Updated**: 2025-01-10
**Maintainer**: Development Team
