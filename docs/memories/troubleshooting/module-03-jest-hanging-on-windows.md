## Jest Hanging on Windows

**Symptoms**: Jest prints "did not exit one second after the test run" or shows "Terminate batch job (Y/N)?". Tests hang indefinitely on Windows.

**✅ Fixed Projects**:
- **@nx-monorepo/web** (2025-11-03): Configuration applied via Pattern 12

**Solution for Fixed Projects**:
Projects with the fix applied will work automatically:
```bash
pnpm exec nx run web:test  # Completes without hanging
```

**Solution for Unfixed Projects**:

### Option 1: Apply Pattern 12 (Recommended - Permanent Fix)
See **Pattern 12** in `docs/memories/adopted-patterns.md` for complete instructions.

Quick summary:
1. Add to `<project>/project.json`:
   ```json
   {
     "targets": {
       "test": {
         "options": {
           "env": {
             "NX_DAEMON": "false"
           }
         }
       }
     }
   }
   ```

2. Ensure `<project>/tsconfig.spec.json` uses `"module": "nodenext"` and `"moduleResolution": "nodenext"` (see Pattern 2).

3. Re-run the test target to confirm the hang is resolved.

### Option 2: Manual Workaround (Temporary)
```bash
NX_DAEMON=false pnpm exec nx run <project>:test
```
Use this only while preparing the permanent fix above.

**Important Notes**:
- Root cause not fully understood — may vary by system state
- Fix has been empirically validated (2025-10-20, 2025-11-03)
- Apply per-project only when the issue manifests (do not apply pre-emptively)
- For additional guidance see `.ruler/AGENTS.md`

**Related**:
- Pattern 12: Windows Jest Hanging - Per-Project Environment Variables
- Pattern 2: TypeScript Module Resolution

---
