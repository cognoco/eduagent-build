# Post-Task Checklist

1. **Sync with governance** – If changes touch architecture, tooling, or conventions, cite the relevant canonical doc (`docs/index.md`) and update the matching Cogno module before declaring the task done.
2. **Formatting** – Run `pnpm run format:check` (or `pnpm run format:write` when needed) and fix any Prettier issues.
3. **Lint & type checks** – Execute `pnpm exec nx affected -t lint typecheck` (or targeted `nx run <project>:lint`) to ensure static analysis stays green.
4. **Tests** – Run the smallest meaningful suite:
   - `pnpm exec nx affected -t test` for unit/integration coverage.
   - `pnpm exec nx affected -t e2e` when user-facing flows change.
   - For database changes, add `pnpm run db:migrate:deploy:dev` dry run and verify Prisma generates cleanly.
5. **Build validation** – `pnpm exec nx affected -t build` (or targeted builds) to confirm artifacts compile.
6. **Dependency graph sanity** – `pnpm exec nx graph` (or `nx show project`) if dependencies changed to confirm no circular edges.
7. **Review outputs** – Inspect `git status` / `git diff` and summarize key changes; never commit unless the user explicitly requests it (`AGENTS.md`).
8. **Document** – Update README, docs, or Cogno memories if the task introduced new knowledge or workflows.
9. **Serena maintenance** – After large refactors, rerun `serena project index` to refresh symbol caches before ending the session.
10. **Handoff** – Report test/command results to the user, note any skipped steps, and list next recommended actions.
