## After: `nx g @nx/node:app <name>`

### Issue
Node.js apps may have version mismatches or missing configurations.

### Required Actions

**1. Verify TypeScript version matches workspace**

Check `package.json` in the generated app:
```json
{
  "devDependencies": {
    "typescript": "5.9.3"  // Should match workspace root
  }
}
```

If version differs, update to match workspace standard.

**2. Verify Node.js version compatibility**

Check that generated code doesn't use Node.js features incompatible with our target version (Node 22+).

**3. Add Jest configuration if needed**

If tests are required:
```bash
pnpm exec nx g @nx/jest:configuration <app-name>
```

Then follow "After: `nx g @nx/jest:configuration`" checklist above.

### Validation

Build and run the app:
```bash
pnpm exec nx run <app-name>:build
pnpm exec nx run <app-name>:serve
```

---
