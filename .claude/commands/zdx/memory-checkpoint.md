# Memory Checkpoint

> **Note**: This command applies to Cogno memories in `docs/memories/`. Tool-specific operational caches (like `.serena/memories/`) are maintained separately by their respective tools.

## ⚡ TL;DR - Quick Exit

**Most tasks require NO documentation.** Jump straight to Step 3 (Decision Flowchart) to check if your work needs documenting. Common exits:
- ✅ One-time fix → **STOP** (no documentation)
- ✅ Following existing patterns → **STOP** (no documentation)
- ✅ Framework basics → **STOP** (link to official docs instead)

**Only document when**: discovering new patterns, technical constraints, or generator issues that will recur.

---

You have just completed a task. Now reflect on whether anything from this work should be documented in the memory system to prevent future rework or pattern drift.

## Step 1: Review What You Just Did

Briefly summarize the work you just completed:
- What was the task?
- What components were generated, modified, or configured?
- What problems did you solve?
- What patterns did you follow or discover?

## Step 2: Check Existing Documentation

**FIRST - Check if already documented:**
1. `.ruler/AGENTS.md` or `CLAUDE.md` - General project practices, workflows, technology choices
2. Official framework documentation (Next.js, Nx, Prisma, etc.)
3. Open `docs/index.md` to locate the governing artefact (plan, architecture decision, tech stack, constitution, etc.) and confirm whether the intent/constraint is already captured upstream

**If NOT already covered there, read ALL memory system files:**
1. `docs/memories/README.md` - Understand the memory system structure and principles
2. `docs/memories/adopted-patterns.md` - Current monorepo architectural standards
3. `docs/memories/post-generation-checklist.md` - Current post-generation steps
4. `docs/memories/tech-findings-log.md` - Current technical findings

**CRITICAL - Search for existing references to your topic:**
- Use grep/search across ALL memory files for keywords related to your work
- Consult `docs/memories/topics.md` for canonical keywords and mapped memory areas before searching
- Check if similar patterns, fixes, or findings already exist
- Look for related entries that might need updating instead of adding new ones
- Example: If documenting TypeScript config, search for "TypeScript", "tsconfig", "Project References"

**Purpose**: Avoid duplicating existing documentation. Memory system captures GAPS, not general practices.

## Step 2.5: Cascade Validation (If Documenting Governance Changes)

**When to use this step**: If your work involved governance documents (`docs/architecture-decisions.md`, `docs/tech-stack.md`, etc.)

**Cascade check:**
1. Did governance documents change?
   - **No** → Skip to Step 3
   - **Yes** → Continue cascade validation

2. Which Cogno modules are affected?
   - Identify memory areas impacted by governance change
   - Check `docs/memories/topics.md` for related areas

3. Cascade propagation needed?
   - Architecture spec: Does `zdx-cogno-architecture.md` need updating?
   - README: Does quick-reference in `README.md` need updating?
   - AGENTS.md: Do execution rules in `.ruler/AGENTS.md` need updating?

4. Update frontmatter tracking:
   - Set `cascade-version` to current date
   - Update `propagated-to` / `propagated-from` fields
   - Maintain cascade synchronization

**Reference**: See `docs/memories/README.md` - "Cascade Maintenance" section for full workflow.

## Step 3: Should I Document This? (Decision Flowchart)

Work through these checkpoints in order:

### ❓ Checkpoint 1: Already Documented?
Already covered in `.ruler/AGENTS.md`, official framework docs, or `docs/` governance?
- ✅ **Yes** → 🛑 **STOP** (nothing to add)
- ❌ **No** → Continue to Checkpoint 2

### ❓ Checkpoint 2: One-Time or Recurring?
One-time fix or unlikely to recur in similar work?
- ✅ **Yes** → 🛑 **STOP** (no documentation needed)
- ❌ **No** → Continue to Checkpoint 3

### ❓ Checkpoint 3: Technical Constraint?
Discovered a technical constraint/limitation or version incompatibility through troubleshooting?
- ✅ **Yes** → 📝 Document in `tech-findings-log.md` (see Step 4)
- ❌ **No** → Continue to Checkpoint 4

### ❓ Checkpoint 4: Generator Issue?
Generator output conflicted with our adopted patterns or required mandatory fixes?
- ✅ **Yes** → 📝 Document in `post-generation-checklist.md` (see Step 4)
- ❌ **No** → Continue to Checkpoint 5

### ❓ Checkpoint 5: New Standard?
Established or confirmed a standard that should apply across similar components?
- ✅ **Yes** → 📝 Document in `adopted-patterns.md` (see Step 4)
- ❌ **No** → Continue to Checkpoint 6

### ❓ Checkpoint 6: None of the Above?
- → 🛑 **STOP** (no documentation needed)

---

**For every "Yes" outcome (Checkpoints 3-5):**
- Identify the governing document/section via `docs/index.md`
- Capture the canonical reference and alignment rationale when updating manifests or proposing the change
- Check cascade implications (see Step 2.5 below)

## Step 4: Update Memory Files (If Applicable)

If you identified knowledge that should be documented:

**CRITICAL RULES - Minimize Overlap:**

1. **Each piece of information should live in ONE primary location**
   - Adopted-patterns: Quick reference pattern description
   - Post-generation-checklist: Step-by-step fix instructions
   - Tech-findings-log: Deep technical rationale

2. **Use cross-references instead of repeating**
   - ✅ "See tech-findings-log.md - [Entry Name] for rationale"
   - ❌ Copy-pasting same explanation into multiple files

3. **Limited acceptable redundancy:**
   - Brief context (1-2 sentences) if agents might only read one file
   - Example: Post-generation-checklist can say "This is needed because X" (1 sentence) then "See adopted-patterns.md for full rationale"

**For Adopted Patterns:**
1. Add a new pattern section using the template in `adopted-patterns.md`
2. Include: pattern description, when to apply, **brief** rationale
3. **Omit**: Deep technical explanations (link to tech-findings-log instead)
4. Update the "last-updated" date in frontmatter
5. Record the governing `docs/` artefact (document + section) and add a one-sentence alignment rationale within the entry

**For Post-Generation Checklist:**
1. Add a new checklist section using the template in `post-generation-checklist.md`
2. Include: issue description, required actions, validation commands
3. **Omit**: Why the issue exists (link to tech-findings-log instead), detailed pattern explanation (link to adopted-patterns instead)
4. Update the "last-updated" date in frontmatter
5. Capture the governing `docs/` artefact and briefly explain why the fix preserves that canonical guidance

**For Tech Findings Log:**
1. Add a new entry using the template in `tech-findings-log.md`
2. Include: decision, context, alternatives considered, technical rationale
3. **Omit**: Step-by-step instructions (link to post-generation-checklist instead)
4. Update the "last-updated" date in frontmatter
5. Cite the governing `docs/` artefact and describe how the finding clarifies or supports it

**After Adding Content - Check for Ambiguities:**

1. **Re-read the ENTIRE memory file** (not just your additions)
2. Look for:
   - Contradictions with existing entries
   - Unclear boundaries between patterns
   - Ambiguous terminology that could confuse agents
   - Missing cross-references to related entries
3. Update existing entries if your new content creates ambiguity
4. Add clarifying notes to distinguish similar patterns

## Step 5: Report Back

Provide a summary:

**If you documented something:**
- Which file(s) did you update?
- What pattern/checklist/finding did you add?
- Which canonical `docs/` artefact (document + section) it aligns with and why
- Why is this important for future work?

**If nothing needs documenting:**
- Explain why (e.g., one-time fix, already documented, too specific)

## Common Checkpoint Mistakes

### ❌ Don’t Document:
- Framework basics already covered in official docs (e.g., “How to use Next.js App Router”)
- Component-specific one-offs that won’t recur
- Personal preferences without technical rationale (tabs vs. spaces)
- Routine implementations that followed existing patterns without surprises

### ✅ Do Document:
- Version constraints or incompatibilities discovered via troubleshooting
- Generator outputs that consistently violate our standards
- Cross-component conventions we expect to reuse (state management approach, theming strategy)

## Guidelines

**DO document** when:
- ✅ Intentional architectural decision from design discussion
- ✅ Pattern that emerged from solving cross-component problems
- ✅ Generator output conflicts with our architectural choices
- ✅ Technical constraint or limitation discovered
- ✅ Decision with non-obvious rationale that prevents future rework

**DON'T document** when:
- ❌ Already documented in AGENTS.md or official framework docs
- ❌ General project practice without monorepo-specific nuance
- ❌ One-time fix or edge case
- ❌ Specific to single component
- ❌ Personal preference without technical requirement
- ❌ Work completed smoothly following existing patterns

## Documentation Length Guidelines

**CRITICAL: Keep entries concise and use cross-references**

Each memory file has a different purpose and appropriate length:

**adopted-patterns.md** - **Target: 50-80 lines per pattern**
- Purpose: Quick reference for "how we do it"
- What to include: Pattern description, when to apply, brief rationale
- What to omit: Deep technical explanations (link to tech-findings-log instead)
- Example: "Use `moduleResolution: nodenext` for all projects. See tech-findings-log.md for rationale."

**post-generation-checklist.md** - **Target: 30-50 lines per checklist**
- Purpose: Step-by-step fix instructions
- What to include: Issue description, required actions, validation commands
- What to omit: Why the issue exists (link to tech-findings-log instead)
- Example: "Change `moduleResolution: node10` → `nodenext`. See adopted-patterns.md Pattern 2."

**tech-findings-log.md** - **Target: 80-150 lines per entry**
- Purpose: Deep dive technical rationale
- What to include: Context, alternatives, technical constraints, research references
- What to omit: Step-by-step instructions (link to post-generation-checklist instead)
- Example: Full explanation of TypeScript Project References incompatibility with Next.js

**Cross-reference instead of repeating:**
- ✅ "See tech-findings-log.md - [Entry Title] for rationale"
- ❌ Copy-pasting same explanation into multiple files

**Warning: If total documentation exceeds 200 lines across all files:**
- You're probably repeating yourself
- Consider: Can this be split with cross-references?
- Ask: Is the deep dive really necessary, or is a brief explanation sufficient?

## Smell Tests

**Red flags that suggest NOTHING should be documented:**
- "I'm documenting how we generally do X" → Check if already in AGENTS.md
- **Entry would be >100 lines in adopted-patterns.md** → Too verbose, move detail to tech-findings-log
- **Entry would be >50 lines in post-generation-checklist.md** → Too verbose, simplify to steps only
- **Total documentation >200 lines across all files** → Repetitive, use cross-references
- "This worked fine without any issues" → Then nothing needs documenting
- "Here's how to use [framework feature]" → Link to official docs instead

**Green lights that suggest something SHOULD be documented:**
- "We chose X instead of framework default Y because..." → adopted-patterns.md (~60 lines)
- "Generator created Z, I had to change it to W" → post-generation-checklist.md (~40 lines)
- "I discovered constraint C through troubleshooting" → tech-findings-log.md (~100 lines)
- "This decision prevents future problem P" → Appropriate memory file, appropriate length

## Quality Check

Before finishing, verify:
- [ ] **Search check**: Searched ALL memory files for existing references to this topic
- [ ] **Update vs. Add**: Confirmed this needs a NEW entry (not updating existing one)
- [ ] Used the appropriate template from the target file
- [ ] Included clear rationale (why, not just what)
- [ ] Added validation/verification steps
- [ ] Updated "last-updated" date in frontmatter
- [ ] **Cross-reference check**: Each file links to others (no duplicated explanations)
- [ ] **Length check**: Each entry within target range for its file type
- [ ] **Redundancy check**: Each piece of info lives in ONE primary location
- [ ] **Overlap check**: Only minimal context redundancy (1-2 sentences max)
- [ ] **Ambiguity check**: Re-read ENTIRE memory file for contradictions/unclear boundaries
- [ ] **Related entries check**: Updated or cross-referenced similar existing patterns

## Documentation Length Examples

**❌ Too Verbose** (avoid this):
```
adopted-patterns.md: 150 lines explaining TypeScript Project References incompatibility
post-generation-checklist.md: 100 lines explaining same incompatibility + steps
tech-findings-log.md: 160 lines explaining same incompatibility + research
Total: 410 lines with massive repetition
```

**✅ Just Right** (do this):
```
adopted-patterns.md: 60 lines
  - Brief: "Next.js uses single tsconfig.json; Node.js uses Project References"
  - When: "Apply X to Next.js, Y to Node.js"
  - Reference: "See tech-findings-log.md - TypeScript Project References for rationale"

post-generation-checklist.md: 40 lines
  - Issue: "Generator doesn't create typecheck target"
  - Steps: Concrete actions to fix
  - Reference: "See adopted-patterns.md Pattern 4"

tech-findings-log.md: 100 lines
  - Full technical explanation with research
  - Alternatives considered
  - References to external docs
  - Cross-refs: "See adopted-patterns.md Pattern 4, post-generation-checklist.md"

Total: 200 lines, no repetition, clear separation of concerns
```

---

**Remember**: The memory system prevents pattern drift. Quality documentation now saves hours of debugging later. **Brevity with cross-references beats verbose repetition.**
