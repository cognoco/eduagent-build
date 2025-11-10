## Build Failures

**Symptoms**: Build fails, dependency order issues, compilation errors.

**Solutions**:

```bash
# Build in dependency order (Nx handles this automatically)
pnpm exec nx run-many -t build

# Build only affected projects
pnpm exec nx affected -t build

# Show affected dependency graph
pnpm exec nx affected:graph
```

---
