## Test Failures

**Symptoms**: Tests fail, unexpected test behavior.

**Solutions**:

```bash
# Run single test file
pnpm exec nx run web:test --testFile=path/to/spec.ts

# Run tests in watch mode
pnpm exec nx run web:test --watch

# Clear Jest cache
pnpm exec nx run web:test --clearCache
```

**⚠️ For Jest hanging/slow exit on Windows**: See [Jest Hanging on Windows](#jest-hanging-on-windows) section above.

---
