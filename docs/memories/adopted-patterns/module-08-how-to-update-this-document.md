## How to Update This Document

When should you add a new pattern?

✅ **DO add** when:
- You discover a framework default that conflicts with our monorepo standards
- You solve a problem that will apply to multiple similar components
- You establish a new convention that should be followed consistently
- Generators create code that needs to be changed to fit our architecture

❌ **DON'T add** when:
- It's a one-time fix for a specific file
- It's already well-documented in official framework docs
- It's a personal preference, not a technical requirement
- It applies to only one component

**Authoring process:**
1. Document the pattern using the template in this file
2. Update `docs/memories/post-generation-checklist.md` if it's a post-generation step
3. Test the pattern with a new component to verify it works
4. Update `last-updated` date in frontmatter

**Post-update checklist:**
1. Add or update the chunk entry in `manifest.yaml` with the correct `id`, `title`, `file`, and `tags`.
2. Record the governing `docs/` artefact (document + section) and summarize why the update aligns with it.
2. Reset `checksum: null`, set `validation_status: needs_review`, and update `last_updated_by` / `last_updated_at`.
3. Run the Cogno sync pipeline (`pnpm run memory:sync -- --chunk <chunk_id>` once available) to regenerate checksums and refresh `memory-index.json`.
4. After peer validation, switch `validation_status` to `valid` (or `draft` if additional work is needed).

---
