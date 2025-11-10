# Code Style & Conventions

## TypeScript & Module Resolution
- Strict TypeScript everywhere (`tsconfig.base.json`), enforced by Nx and `docs/tech-stack.md`.
- `moduleResolution: "bundler"` in base configs with `customConditions: ["@nx-monorepo/source"]`; test configs switch to `moduleResolution: "nodenext"` (`adopted-patterns` Pattern 2, `tech-findings-log` module 10).
- Workspace packages imported via `@nx-monorepo/<name>`; dependents declare `