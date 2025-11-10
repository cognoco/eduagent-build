## Overview

This document provides troubleshooting solutions for common development issues in the nx-monorepo. These solutions have been validated through empirical testing.

### Maintenance Checklist
1. Update the relevant entry in `docs/memories/troubleshooting/manifest.yaml` with the correct `id`, `title`, `file`, and `tags` whenever you add or modify a section.
2. Capture the governing `docs/` artefact (document + section) and describe how the guidance aligns with it.
2. Reset `checksum: null`, set `validation_status: needs_review`, and update `last_updated_by` / `last_updated_at`.
3. Run `pnpm run memory:sync -- --chunk <chunk_id>` (once available) to regenerate checksums and refresh `memory-index.json`.
4. After the fix is validated, set `validation_status` to `valid` (or `draft` if additional investigation continues).

---
