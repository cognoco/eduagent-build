# Jest Configuration Patterns

## Workspace Preset Inheritance

**Workspace-level preset** (`jest.preset.js`):
```javascript
const nxPreset = require('@nx/jest/preset').default;
module.exports = { ...nxPreset };
```

**Project-level config** (`apps/web/jest.config.ts`):
```typescript
export default {
  displayName: '@nx-monorepo/web',
  preset: '../../jest.preset.js',  // ✅ Extend workspace preset
  testEnvironment: 'jsdom',         // or 'node' for Node.js projects
  testMatch: ['<rootDir>/src/**/*.(spec|test).[jt]s?(x)'],
  coverageDirectory: '../../coverage/apps/web',
};
```

## Type Isolation

**Test config** (`tsconfig.spec.json`):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./out-tsc/jest",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "types": ["jest", "node"]
  },
  "include": ["src/**/*.test.ts", "src/**/*.spec.ts"]
}
```

**Production config** (`tsconfig.json`) - NO jest types:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": []
  }
}
```

## Why "nodenext" for Test Configs

- Jest runs in Node.js with ts-jest transpilation
- Workspace uses `customConditions` in `tsconfig.base.json`
- This feature only works with: `node16`, `nodenext`, or `bundler`
- Generator's `node10` default causes TypeScript errors

**Last Validated**: 2025-10-20 (TypeScript 5.9, Nx 21.6, Jest 30.2)
