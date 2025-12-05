# Memory Checkpoint

> **System**: ZDX Cogno (the file-based memory system in `docs/memories/`)
> **Purpose**: Validate documentation alignment after completing tasks to prevent pattern drift.

## ⚡ TL;DR - Quick Exit

**Most tasks require NO documentation.** Jump straight to Step 3 (Decision Flowchart) to check if your work needs documenting. Common exits:
- ✅ One-time fix → **STOP** (no documentation)
- ✅ Following existing patterns → **STOP** (no documentation)
- ✅ Framework basics → **STOP** (link to official docs instead)

**Only document when**: discovering new patterns, technical constraints, or generator issues that will recur.

---

You have just completed a task. Now reflect on whether anything from this work should be documented in the Cogno memory system to prevent future rework or pattern drift.

## Step 1: Review What You Just Did

Briefly summarize the work you just completed:
- What was the task?
- What components were generated, modified, or configured?
- What problems did you solve?
- What patterns did you follow or discover?

## Step 2: Check Existing Documentation

### 2.1 Check Governance Layer First (Tier 1 & 2)

Before touching Cogno, verify the information isn't already in governance docs:

1. **`.ruler/AGENTS.md` or `CLAUDE.md`** - General project practices, workflows, technology choices
2. **`docs/index.md`** - Start here to locate the governing artefact (PRD, architecture, ADRs, tech-stack, constitution, roadmap)
3. **Official framework documentation** - Next.js, Nx, Prisma, etc.

**If already covered in governance or official docs → STOP (nothing to add to Cogno)**

### 2.2 Navigate Cogno (Tier 3)

If NOT covered in governance docs, use Cogno's discovery workflow:

1. **Start with `docs/memories/README.md`** - Understand the memory system structure
2. **Consult `docs/memories/topics.md`** - Map your task keywords to relevant memory areas
3. **Navigate to the memory area directory** (e.g., `docs/memories/adopted-patterns/`)
4. **Read the `*.core.md` summary** for that area
5. **Check the `manifest.yaml`** for specific module listings
6. **Read relevant modules** only as needed

### Cogno Directory Structure

```
docs/memories/
  README.md                     # Steering overview (no manifest)
  zdx-cogno-architecture.md     # Canonical architecture spec
  topics.md                     # Topic-to-area index for discovery
  memory-index.json             # Generated lookup (do not edit)

  adopted-patterns/             # "How WE do it in THIS monorepo"
    adopted-patterns.core.md    # Summary of all patterns
    manifest.yaml               # Module inventory
    module-*.md                 # Detailed pattern modules

  post-generation-checklist/    # Mandatory fixes after Nx generators
    post-generation-checklist.core.md
    manifest.yaml
    module-*.md

  tech-findings-log/            # Technical decisions & constraints
    tech-findings-log.core.md
    manifest.yaml
    module-*.md

  testing-reference/            # Jest, MSW, Playwright, coverage
    testing-reference.core.md
    manifest.yaml
    module-*.md

  troubleshooting/              # Common development issues
    troubleshooting.core.md
    manifest.yaml
    module-*.md
```

### 2.3 Search for Existing References

**CRITICAL**: Before adding anything new:
- Use grep/search across ALL memory areas for keywords related to your work
- Check `topics.md` synonyms for alternative search terms
- Look for existing entries that might need updating (not adding new ones)

**Example**: If documenting TypeScript config, search for "TypeScript", "tsconfig", "moduleResolution", "Project References"

## Step 2.5: Cascade Validation (If Documenting Governance Changes)

**When to use this step**: If your work involved governance documents (`docs/architecture-decisions.md`, `docs/tech-stack.md`, etc.)

**Cascade order**: Governance docs → `zdx-cogno-architecture.md` → `README.md` → `.ruler/AGENTS.md`

**Cascade check:**
1. Did governance documents change?
   - **No** → Skip to Step 3
   - **Yes** → Continue cascade validation

2. Which Cogno modules are affected?
   - Identify memory areas impacted by governance change
   - Check `docs/memories/topics.md` for related areas

3. Cascade propagation needed?
   - Architecture spec: Does `zdx-cogno-architecture.md` need updating?
   - README: Does `docs/memories/README.md` quick-reference need updating?
   - AGENTS.md: Do execution rules in `.ruler/AGENTS.md` need updating?

4. Update frontmatter tracking:
   - Set `cascade-version` to current date
   - Update `propagated-to` / `propagated-from` fields

**Reference**: See `docs/memories/README.md` - "Cascade Maintenance" section for full workflow.

## Step 3: Should I Document This? (Decision Flowchart)

Work through these checkpoints in order:

### ❓ Checkpoint 1: Already Documented?
Already covered in governance docs (`docs/`), `.ruler/AGENTS.md`, official framework docs, or existing Cogno modules?
- ✅ **Yes** → 🛑 **STOP** (nothing to add)
- ❌ **No** → Continue to Checkpoint 2

### ❓ Checkpoint 2: One-Time or Recurring?
One-time fix or unlikely to recur in similar work?
- ✅ **Yes** → 🛑 **STOP** (no documentation needed)
- ❌ **No** → Continue to Checkpoint 3

### ❓ Checkpoint 3: Technical Constraint?
Discovered a technical constraint/limitation or version incompatibility through troubleshooting?
- ✅ **Yes** → 📝 Document in `tech-findings-log/` (see Step 4)
- ❌ **No** → Continue to Checkpoint 4

### ❓ Checkpoint 4: Generator Issue?
Generator output conflicted with our adopted patterns or required mandatory fixes?
- ✅ **Yes** → 📝 Document in `post-generation-checklist/` (see Step 4)
- ❌ **No** → Continue to Checkpoint 5

### ❓ Checkpoint 5: New Standard?
Established or confirmed a standard that should apply across similar components?
- ✅ **Yes** → 📝 Document in `adopted-patterns/` (see Step 4)
- ❌ **No** → Continue to Checkpoint 6

### ❓ Checkpoint 6: None of the Above?
- → 🛑 **STOP** (no documentation needed)

---

**For every "Yes" outcome (Checkpoints 3-5):**
- Identify the governing document/section via `docs/index.md`
- Capture the canonical reference and alignment rationale
- Check cascade implications (see Step 2.5)

## Step 4: Update Cogno Memory Files (If Applicable)

If you identified knowledge that should be documented:

### Memory Area Selection Guide

| Memory Area | Purpose | Target Length |
|-------------|---------|---------------|
| `adopted-patterns/` | "How WE do it" - standards overriding defaults | 50-80 lines per pattern |
| `post-generation-checklist/` | Step-by-step generator fixes | 30-50 lines per checklist |
| `tech-findings-log/` | Technical rationale & constraints | 80-150 lines per entry |
| `testing-reference/` | Jest, MSW, Playwright, coverage | As needed for testing docs |
| `troubleshooting/` | Common development issue solutions | 30-50 lines per issue |

### Module Authoring Rules (from Cogno Architecture Spec)

1. **Keep `*.core.md` scannable** - summaries only, link to deeper modules
2. **Create module file** when:
   - Guidance exceeds ~50 lines
   - Includes detailed workflows/code
   - Represents a distinct reusable scenario
3. **Add to core summary** when:
   - Brief update (<50 lines)
   - Global principle needing immediate visibility
4. **Split patterns/modules** when entry exceeds ~100 lines or covers multiple independent scenarios

### Updating a Memory Area

**Step 4.1: Update or create module file**
```
docs/memories/<area>/module-XX-topic.md
```

**Step 4.2: Update the manifest**
Edit `docs/memories/<area>/manifest.yaml`:
```yaml
- id: <area>-XX-topic
  title: "Human-readable Title"
  file: module-XX-topic.md
  tags: [relevant, tags, for, search]
  checksum: null                    # Leave null (tooling sets this)
  validation_status: needs_review   # Always set this when editing
  last_updated_by: "claude"         # Or your identifier
  last_updated_at: "2025-01-15T10:00:00Z"  # ISO 8601 UTC
```

**Step 4.3: Update the `*.core.md` summary** if the quick reference needs the new information

**Step 4.4: Run validation steps** from the area's maintenance checklist (if any)

**Step 4.5: Cross-reference** - link to related entries in other areas (no duplication)

### Cross-Reference Strategy

**Each piece of information lives in ONE primary location:**
- `adopted-patterns/` → Quick reference pattern description
- `post-generation-checklist/` → Step-by-step fix instructions
- `tech-findings-log/` → Deep technical rationale

**Use cross-references instead of repeating:**
- ✅ "See tech-findings-log module TFL-10 for rationale"
- ❌ Copy-pasting same explanation into multiple files

**Limited acceptable redundancy:**
- Brief context (1-2 sentences) if agents might only read one file
- Example: "This is needed because X. See adopted-patterns module AP-02 for full rationale."

### After Adding Content - Check for Ambiguities

1. **Re-read the ENTIRE `*.core.md`** (not just your additions)
2. Look for:
   - Contradictions with existing entries
   - Unclear boundaries between patterns
   - Ambiguous terminology
   - Missing cross-references
3. Update existing entries if your new content creates ambiguity
4. Add clarifying notes to distinguish similar patterns

## Step 5: Report Back

Provide a summary:

**If you documented something:**
- Which memory area did you update?
- What module/pattern/checklist/finding did you add or modify?
- Which canonical `docs/` artefact (document + section) it aligns with and why
- What manifest fields did you update?
- Why is this important for future work?

**If nothing needs documenting:**
- Explain why (e.g., one-time fix, already documented, too specific)

## Common Checkpoint Mistakes

### ❌ Don't Document:
- Framework basics already covered in official docs
- Component-specific one-offs that won't recur
- Personal preferences without technical rationale
- Routine implementations that followed existing patterns
- Information already in governance docs (`docs/`)

### ✅ Do Document:
- Version constraints or incompatibilities discovered via troubleshooting
- Generator outputs that consistently violate our standards
- Cross-component conventions we expect to reuse
- Integration patterns combining multiple technologies
- Solutions that prevent future problems

## Documentation Length Guidelines

**CRITICAL: Keep entries concise and use cross-references**

| File Type | Target Length | What to Include | What to Omit |
|-----------|---------------|-----------------|--------------|
| `*.core.md` | Brief summary | Scope, links to modules | Detailed content |
| Pattern module | 50-80 lines | Pattern description, when to apply, brief rationale | Deep technical explanations |
| Checklist module | 30-50 lines | Issue description, steps, validation commands | Why the issue exists |
| Tech finding module | 80-150 lines | Context, alternatives, constraints, research | Step-by-step instructions |

**Warning: If total documentation exceeds 200 lines across all files:**
- You're probably repeating yourself
- Consider: Can this be split with cross-references?
- Ask: Is the deep dive really necessary?

## Smell Tests

**Red flags (STOP - nothing to document):**
- "I'm documenting how we generally do X" → Check if already in AGENTS.md or governance
- "This worked fine without issues" → Nothing needs documenting
- "Here's how to use [framework feature]" → Link to official docs instead
- Entry would exceed target length → Too verbose, use cross-references

**Green lights (DO document):**
- "We chose X instead of framework default Y because..." → `adopted-patterns/`
- "Generator created Z, I had to change it to W" → `post-generation-checklist/`
- "I discovered constraint C through troubleshooting" → `tech-findings-log/`
- "This decision prevents future problem P" → Appropriate memory area

## Quality Checklist

Before finishing, verify:
- [ ] **Search check**: Searched ALL memory areas and `topics.md` for existing references
- [ ] **Update vs. Add**: Confirmed this needs a NEW module (not updating existing one)
- [ ] Used the appropriate module naming pattern (`module-XX-topic.md`)
- [ ] Included clear rationale (why, not just what)
- [ ] Added validation/verification steps
- [ ] **Updated manifest**: `id`, `title`, `file`, `tags`, `validation_status`, `last_updated_by`, `last_updated_at`
- [ ] **Updated `*.core.md`** if summary needs the new information
- [ ] **Cross-reference check**: Links to related modules (no duplicated explanations)
- [ ] **Length check**: Each entry within target range for its file type
- [ ] **Cascade check**: Governance docs → architecture spec → README → AGENTS.md aligned
- [ ] **Ambiguity check**: Re-read core summary for contradictions/unclear boundaries

---

**Remember**: Cogno prevents pattern drift. Quality documentation now saves hours of debugging later. **Brevity with cross-references beats verbose repetition.**

**Canonical Reference**: See `docs/memories/zdx-cogno-architecture.md` for the authoritative Cogno specification.
