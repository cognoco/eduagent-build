## Pattern Template

Use this template when adding new patterns:

```markdown
## Pattern N: [Pattern Name]

**Our Standard**: [One sentence describing the canonical approach]

### Pattern

[Code examples, configuration snippets, or command sequences]

### Applies To

[Which apps/packages this pattern governs]

### Rationale
- [Why this pattern exists]
- [Problems it prevents]
- [Alternatives that were considered and rejected]

### Governing Source

- Canonical doc: `[Document name (e.g. docs/architecture.md – Section 3.2)]`
- Alignment rationale: `[Explain how this pattern implements/supports the canonical guidance]`

### When Adding/Updating [Components]

⚠️ Generators may [describe misconfiguration or missing steps]

**Required action:**
1. [Step-by-step fixes or validation steps]
2. [Additional context-specific guidance]

### Verification

1. `pnpm exec nx run <project>:test`
2. `pnpm exec nx run <project>:build`
3. Document verification notes in delivery summary.

### Manifest & Validation Checklist

1. Add or update the entry in `docs/memories/adopted-patterns/manifest.yaml` with the chunk `id`, `title`, `file`, and `tags`.
2. Reset `checksum: null`, set `validation_status: needs_review`, and update `last_updated_by` / `last_updated_at`.
3. Run the Cogno sync pipeline (`pnpm run memory:sync -- --chunk <chunk_id>`, once available) to regenerate checksums and refresh `memory-index.json`.
4. After peer validation, change `validation_status` to `valid` (or `draft` if still under review).

### Last Validated

[Date] (Nx [version], Jest [version], Node [version])

**References**: [Link to related docs, ADRs, or troubleshooting entries]
```
