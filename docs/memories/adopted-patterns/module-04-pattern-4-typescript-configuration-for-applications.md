## Pattern 4: TypeScript Configuration for Applications

**Our Standard**: Framework-specific TypeScript configurations

**Note:** This pattern is about tsconfig.json **file structure** (Project References vs single file). For the `moduleResolution` compiler setting that applies to ALL projects, see Pattern 2.

### Pattern by Framework

#### Next.js Applications (web, future mobile)

**Structure**:
```
apps/web/
├── tsconfig.json          # Single file with noEmit: true
├── tsconfig.spec.json     # Test configuration
└── project.json           # Contains manual typecheck target
```

**Configuration**:
- Single `tsconfig.json` with `noEmit: true`
- Manual typecheck target in `project.json` (see post-generation-checklist.md for complete configuration)
- Command: `tsc --noEmit`

#### Node.js Applications (server, future APIs)

- Uses TypeScript Project References (standard Nx pattern)
- Typecheck target auto-inferred by `@nx/js/typescript` plugin
- No manual configuration needed

### Applies To

- All applications (current: web, server; future: mobile, additional APIs)
- Does NOT apply to libraries (they use buildable library pattern)

### Rationale

Different application frameworks have different compilation models:

- **Next.js**: Uses SWC/Turbopack for compilation. TypeScript is only used for type-checking, not code generation. Requires `noEmit: true`.
- **Node.js**: Uses TypeScript compiler for both type-checking and compilation. Compatible with TypeScript Project References.

This workspace uses TypeScript Project References (Nx 20+ recommended approach) for optimal build performance. Next.js apps cannot use this pattern due to `noEmit: true` requirement, so they use single tsconfig.json with manual typecheck configuration.

### When Adding New Applications

- **Next.js apps**: See post-generation-checklist.md for manual typecheck target setup
- **Node.js apps**: Generator handles everything automatically
- **React Native apps** (future): Follow Next.js pattern (will be validated in Phase 2)

### Last Validated

2025-10-21 (Next.js 15.2, Nx 21.6, TypeScript 5.9)

**Reference**:
- `docs/memories/tech-findings-log.md` - "Next.js TypeScript Project References Incompatibility"
- `docs/memories/post-generation-checklist.md` - After `nx g @nx/next:app`

---
