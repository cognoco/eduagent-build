# Memory Checkpoint

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

**If NOT already covered there, read memory system files:**
1. `docs/memories/README.md` - Understand the memory system structure and principles
2. `docs/memories/adopted-patterns.md` - Current monorepo architectural standards
3. `docs/memories/post-generation-checklist.md` - Current post-generation steps
4. `docs/memories/tech-findings-log.md` - Current technical findings

**Purpose**: Avoid duplicating existing documentation. Memory system captures GAPS, not general practices.

## Step 3: Identify What Should Be Documented

**Documentation Hierarchy:**
- **AGENTS.md**: General project practices (e.g., "we use Jest for testing")
- **Memory System**: Monorepo-specific architectural decisions, patterns, constraints

Ask yourself these questions:

**Adopted Patterns** (`adopted-patterns.md`):
- Did I make an **intentional architectural decision** through structured design discussion?
- Did I establish a **new standard** that should apply consistently across similar components?
- Did I discover a **framework default that conflicts** with our architectural choices?
- Did an **emerging pattern** surface from solving cross-component problems?
- Did I solve a problem that will **recur when adding similar components**?

**Post-Generation Checklist** (`post-generation-checklist.md`):
- Did I have to **fix generator output** that conflicts with our adopted patterns?
- Will this same fix be **needed every time** we run this generator?
- Is this fix **mandatory** to maintain consistency with our architecture?

**Tech Findings Log** (`tech-findings-log.md`):
- Did I make a **technical decision with non-obvious rationale**?
- Did I discover **empirical findings** through troubleshooting?
- Did I identify a **constraint or limitation** of a tool/framework?
- Did I investigate and **reject alternatives** for specific reasons?

**None of the Above** (most common outcome):
- Was this straightforward implementation following existing patterns?
- Is this already documented in AGENTS.md or official framework docs?
- Was this a one-time fix that won't recur?
- Is this too specific to one component?

## Step 4: Update Memory Files (If Applicable)

If you identified knowledge that should be documented:

**For Adopted Patterns:**
1. Add a new pattern section using the template in `adopted-patterns.md`
2. Include: pattern description, rationale, validation steps, "when to apply" guidance
3. Update the "last-updated" date in frontmatter

**For Post-Generation Checklist:**
1. Add a new checklist section using the template in `post-generation-checklist.md`
2. Include: issue description, required actions, validation commands
3. Update the "last-updated" date in frontmatter

**For Tech Findings Log:**
1. Add a new entry using the template in `tech-findings-log.md`
2. Include: decision, context, alternatives considered, technical rationale
3. Update the "last-updated" date in frontmatter

## Step 5: Report Back

Provide a summary:

**If you documented something:**
- Which file(s) did you update?
- What pattern/checklist/finding did you add?
- Why is this important for future work?

**If nothing needs documenting:**
- Explain why (e.g., one-time fix, already documented, too specific)

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
- [ ] Used the appropriate template from the target file
- [ ] Included clear rationale (why, not just what)
- [ ] Added validation/verification steps
- [ ] Updated "last-updated" date in frontmatter
- [ ] Cross-referenced related documentation
- [ ] **Length check**: Each entry within target range for its file type
- [ ] **Redundancy check**: Not repeating same information across files
- [ ] **Cross-reference check**: Using links instead of duplicating explanations

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
