## TypeScript Path Resolution

**Symptoms**: Import errors, "Cannot find module" errors for workspace packages.

**Solutions**:
- Ensure `tsconfig.base.json` includes paths for all packages
- Nx manages these automatically via generators
- If paths are missing, run `pnpm exec nx g @nx/js:library <name>` to regenerate

---
