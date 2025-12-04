# Post-Generation Checklist

After running `nx g @nx/jest:configuration`, execute these steps based on project type.

## Quick Reference

| Step | UI | Node | Logic |
|------|:--:|:----:|:-----:|
| 1. Install testing libs | ✅ | ✅ | ❌ |
| 2. Create jest.setup.ts | ✅ | ❌ | ❌ |
| 3. Update jest.config.ts | ✅ | ❌ | ❌ |
| 4. Fix moduleResolution | ✅ | ✅ | ✅ |
| 5. Verify Jest types | ✅ | ✅ | ✅ |
| 6. Clean production config | ✅ | ✅ | ✅ |

## Step Details

### 1. Install Testing Enhancement Packages

**UI Projects**:
```bash
pnpm add --save-dev @testing-library/jest-dom @testing-library/user-event msw
```

**Node Projects** (only if testing HTTP endpoints):
```bash
pnpm add --save-dev @testing-library/jest-dom msw
```

**Logic Projects**: Skip this step.

### 2. Create Jest Setup File (UI Only)

File: `<project>/jest.setup.ts`
```typescript
import '@testing-library/jest-dom';
```

### 3. Update jest.config.ts (UI Only)

Add setupFilesAfterEnv:
```typescript
export default {
  // ... existing config
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};
```

### 4. Fix TypeScript Module Resolution (ALL)

File: `<project>/tsconfig.spec.json`

**Change**:
```json
"module": "commonjs",
"moduleResolution": "node10"
```

**To**:
```json
"module": "nodenext",
"moduleResolution": "nodenext"
```

Or run: `scripts/fix-tsconfig-spec.sh <project-path>`

### 5. Verify Jest Types (ALL)

File: `<project>/tsconfig.spec.json`
```json
"types": ["jest", "node"]
```

### 6. Clean Production Config (ALL)

File: `<project>/tsconfig.json` - Ensure NO jest types:
```json
"types": []
```

## Validation

Run: `scripts/validate-jest-config.sh <project-path>`

Or manually:
```bash
pnpm exec nx run <project>:test
```

**Success**: Tests run without TypeScript errors or module resolution warnings.
