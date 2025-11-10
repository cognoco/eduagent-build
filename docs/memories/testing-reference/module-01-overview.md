## Overview

This document provides comprehensive testing configuration patterns for the nx-monorepo. These patterns have been established through empirical testing and ensure consistency across all projects.

**⚠️ CRITICAL**: Testing (especially Jest) is a **very problematic area** with version compatibility issues and complex configuration interactions. Always follow the patterns documented here.

### Maintenance Checklist
1. When adding or modifying a section, update `docs/memories/testing-reference/manifest.yaml` with the chunk `id`, `title`, `file`, and `tags`.
2. Note the governing `docs/` artefact (document + section) and explain why the update supports it.
2. Reset `checksum: null`, set `validation_status: needs_review`, and update `last_updated_by` / `last_updated_at`.
3. Run the Cogno sync pipeline (`pnpm run memory:sync -- --chunk <chunk_id>` once available) to regenerate checksums and refresh `memory-index.json`.
4. After the content is validated, switch `validation_status` to `valid` (or `draft` if additional work remains).

---
