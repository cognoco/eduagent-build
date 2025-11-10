## Nx Cache Issues

**Symptoms**: Stale build artifacts, unexpected behavior after code changes, tasks not running when expected.

**Solution**:
```bash
# Clear cache and reinstall
pnpm exec nx reset
rm -rf node_modules
pnpm install
```

---
