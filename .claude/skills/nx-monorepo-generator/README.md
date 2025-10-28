# nx-monorepo-generator Skill - PoC

## Overview

This is a **Proof of Concept (PoC)** skill that demonstrates converting procedural workflows from the memory system (`docs/memories/`) into an auto-activating Claude Code skill.

**Status**: Testing Phase
**Created**: 2025-10-28
**Focus**: Jest configuration workflow (highest-impact generator with most pattern drift)

## What This Is

A standalone skill that guides AI agents through adding Jest testing configuration to Nx projects while ensuring:
- Correct project type identification (UI/Node/Logic)
- Appropriate testing enhancement installation
- Mandatory post-generation fixes (TypeScript moduleResolution, etc.)
- Pattern adherence validation

## Structure

```
nx-monorepo-generator/
├── SKILL.md (191 lines)
│   └── Workflow-focused guide with phases and decision trees
├── references/
│   └── jest-patterns.md (364 lines)
│       └── Detailed patterns extracted from memory docs
├── TESTING.md (257 lines)
│   └── Comprehensive testing guide
└── README.md (this file)
```

**Total**: 812 lines of focused, actionable content

## Design Principles

1. **Standalone**: Completely independent from `docs/memories/` - no risk to existing system
2. **Focused**: Single workflow (Jest configuration) rather than trying to cover everything
3. **Progressive disclosure**: SKILL.md = workflow, references/ = details
4. **Non-destructive**: Can be deleted without affecting anything else

## Why Jest Configuration?

This workflow was chosen for the PoC because:
- ✅ Most common generator (every project needs testing)
- ✅ Most pattern drift (Nx defaults conflict with our patterns)
- ✅ Clear success criteria (configuration works or doesn't)
- ✅ High impact (prevents hours of debugging)
- ✅ Multiple decision points (UI vs Node vs Logic)

## Comparison to Memory System

### Current System (Documentation)
- Agent must remember to read `adopted-patterns.md` and `post-generation-checklist.md`
- Relies on "MUST READ" directives in `CLAUDE.md`
- Risk of forgetting steps or reading partial content
- More context consumed (full docs loaded)

### Skill System (PoC)
- Auto-activates based on task description matching
- Workflow guide + reference material bundled
- Progressive disclosure (only loads what's needed)
- Explicit phases reduce chance of missed steps

## Success Criteria

The PoC validates the skills approach if:
- ✅ Agent uses skill without explicit prompting
- ✅ All mandatory post-generation fixes applied correctly
- ✅ Project type correctly identified (UI/Node/Logic)
- ✅ Fewer manual prompts needed vs documentation approach
- ✅ Configuration passes validation on first try

See `TESTING.md` for detailed testing methodology.

## Testing Status

- [ ] Test 1: UI Project (Full testing stack)
- [ ] Test 2: Logic Package (No enhancements)
- [ ] Test 3: Node Project (Conditional MSW)
- [ ] Comparison: Skill vs Current Documentation
- [ ] Edge cases tested

## Next Steps

### If PoC Succeeds
1. Document findings in `docs/memories/tech-findings-log.md`
2. Consider using symlinks to reduce duplication
3. Expand to other high-impact generators:
   - `nx g @nx/next:app` (typecheck target setup)
   - `nx g @nx/js:lib` (test location validation)
4. Create additional skills:
   - `nx-testing-troubleshooter` (debugging test failures)
   - `nx-pattern-validator` (automated validation scripts)

### If PoC Fails
1. Document why in `docs/memories/tech-findings-log.md`
2. Delete `.claude/skills/` directory
3. Continue with current documentation-based memory system
4. Apply lessons learned to improve docs

### If Mixed Results
1. Identify what worked well
2. Narrow skill scope to successful parts
3. Iterate on design based on findings

## Maintenance Strategy

**Current (PoC)**: Accept duplication
- Skill contains extracted content from memory docs
- No symlinks (reduces complexity for testing)
- Update both independently during PoC phase

**Future (If Successful)**: Use symlinks
```bash
cd .claude/skills/nx-monorepo-generator/references/
rm jest-patterns.md
ln -s ../../../docs/memories/adopted-patterns.md .
ln -s ../../../docs/memories/post-generation-checklist.md .
```

This makes `docs/memories/` the single source of truth.

## Key Learnings So Far

1. **Focus is critical**: Single workflow (Jest) rather than all generators
2. **Progressive disclosure works**: Workflow guide (SKILL.md) + detailed reference (jest-patterns.md)
3. **Project type matters**: UI/Node/Logic distinction is essential for correct enhancements
4. **Standalone testing is safe**: No risk to existing memory system during PoC
5. **Clear success criteria**: Measurable outcomes (all fixes applied correctly)

## Related Documentation

- `docs/memories/adopted-patterns.md` - Source of Pattern 3 (Jest Configuration) and Pattern 10 (Testing Enhancements)
- `docs/memories/post-generation-checklist.md` - Source of "After: nx g @nx/jest:configuration"
- `docs/memories/README.md` - Memory system overview
- `CLAUDE.md` - Agent rules that currently mandate memory doc reading

## Questions This PoC Answers

1. **Do skills reduce cognitive overhead?** Testing will show if workflow is easier to follow
2. **Does auto-activation work?** Will agents use skill without explicit prompting?
3. **Is duplication worth it?** Does bundling justify maintenance burden?
4. **Should we convert more?** Is this approach worth expanding to other workflows?

## Contact & Feedback

After testing, document findings:
- What worked well?
- What didn't work?
- Would you use this over reading memory docs?
- Should we expand to other generators?
- Any improvements to skill design?

Record findings in `docs/memories/tech-findings-log.md` under a new section: "Skills PoC Results (2025-10-28)"

---

**Remember**: This is an experiment. Whether it succeeds or fails, we learn something valuable about how to structure institutional knowledge for AI agents.
