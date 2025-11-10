## How to Update This Document

When should you add a new checklist?

✅ **DO add** when:
- You discover a generator creates code that needs fixing
- The fix is required for consistency with adopted patterns
- The fix will apply to future uses of the same generator
- Skipping the fix would cause problems

❌ **DON'T add** when:
- It's a one-time edge case
- It's optional configuration (belongs in `docs/testing-enhancements.md`)
- It's already handled automatically by the generator

**Authoring process:**
1. Add new section using the template below
2. Test the checklist with a fresh generation
3. Update corresponding pattern in `adopted-patterns.md` if needed
4. Update `last-updated` date in frontmatter

**Post-update checklist:**
1. Create or update the manifest entry with the correct chunk `id`, `title`, `file`, and `tags`.
2. Document the governing `docs/` artefact (document + section) and capture a short rationale for alignment.
2. Reset `checksum: null`, set `validation_status: needs_review`, and update `last_updated_by` / `last_updated_at`.
3. Run the Cogno sync pipeline (`pnpm run memory:sync -- --chunk <chunk_id>` once available) to regenerate checksums and refresh `memory-index.json`.
4. After peer validation, set `validation_status` to `valid` (or `draft` if additional updates are planned).

---
