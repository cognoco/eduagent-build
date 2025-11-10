## Entry Template

```markdown
## [Category] - [Topic] - [Date]

**Decision:** [What was decided]

**Context:** [Problem being solved and relevant background]

**Alternatives Considered:**
1. Option A — Rejected because [...]
2. Option B — Rejected because [...]

**Chosen Approach:** [Summary of the winning option]

**Technical Rationale:**
- [Key reasoning bullet 1]
- [Key reasoning bullet 2]
- [Performance / compatibility implications]

**Implementation Details:**
- Location: [File(s) or package(s)]
- Commands: [Setup or migration commands]
- Configuration: [Important config snippets]

**Warning Signs (for AI agents):**
- If you see [...], do not [...]

**References:**
- [Link to ADRs, docs, issues]

### Manifest & Validation Checklist
1. Add or update the chunk entry in `docs/memories/tech-findings-log/manifest.yaml` (`id`, `title`, `file`, `tags`).
2. Capture the governing `docs/` artefact (document + section) and summarize the alignment rationale.
2. Reset `checksum: null`, set `validation_status: needs_review`, and update `last_updated_by` / `last_updated_at`.
3. Run the Cogno sync pipeline (`pnpm run memory:sync -- --chunk <chunk_id>` once available) to regenerate checksums and refresh `memory-index.json`.
4. After the finding is validated, change `validation_status` to `valid` (or `draft` if still under investigation).
```
