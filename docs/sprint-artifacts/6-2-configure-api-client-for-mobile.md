# Story 6.2: Configure API Client for Mobile

Status: ready-for-dev

## Story

As a mobile developer,
I want the API client working in the mobile app with environment-aware URL configuration,
so that I can make type-safe API calls from mobile to the Express server.

## Acceptance Criteria

1. **AC-6.2.1**: `apiClient` factory created in `apps/mobile/src/lib/api.ts` with correct configuration
2. **AC-6.2.2**: Environment-aware URL configuration working for iOS Simulator, Android Emulator, and production
3. **AC-6.2.3**: Test API call succeeds from mobile app (GET /api/health returns data)
4. **AC-6.2.4**: Type safety preserved - compile-time errors occur on wrong API usage
5. **AC-6.2.5**: Import path `@nx-monorepo/api-client` resolves correctly in mobile app
6. **AC-6.2.6**: Networking configuration documented for local development

## Tasks / Subtasks

- [ ] **Task 1: Create API Client Factory** (AC: 1, 4)
  - [ ] 1.1 Create `apps/mobile/src/lib/api.ts` file
  - [ ] 1.2 Import `createClient` from `openapi-fetch`
  - [ ] 1.3 Import `paths` type from `@nx-monorepo/api-client`
  - [ ] 1.4 Configure base URL using `expo-constants`
  - [ ] 1.5 Export `apiClient` instance with correct typing

- [ ] **Task 2: Configure Environment-Aware URL** (AC: 2)
  - [ ] 2.1 Update `apps/mobile/app.json` with `extra.apiUrl` config
  - [ ] 2.2 Configure iOS Simulator URL: `http://localhost:4000/api`
  - [ ] 2.3 Configure Android Emulator URL: `http://10.0.2.2:4000/api`
  - [ ] 2.4 Configure fallback for production/staging (Railway URL)
  - [ ] 2.5 Document environment variable strategy in Dev Notes

- [ ] **Task 3: Verify TypeScript Path Resolution** (AC: 5)
  - [ ] 3.1 Run `pnpm exec nx run mobile:typecheck` (or verify no IDE errors)
  - [ ] 3.2 Confirm `@nx-monorepo/api-client` import resolves correctly
  - [ ] 3.3 Confirm `paths` type provides autocomplete for API endpoints
  - [ ] 3.4 Document any Metro resolver configuration needed

- [ ] **Task 4: Test API Call Integration** (AC: 3, 4)
  - [ ] 4.1 Start Express server: `pnpm exec nx run server:serve`
  - [ ] 4.2 Add test API call in mobile app (e.g., in `app/index.tsx` temporarily)
  - [ ] 4.3 Test on iOS Simulator - verify GET /api/health succeeds
  - [ ] 4.4 Test on Android Emulator - verify GET /api/health succeeds
  - [ ] 4.5 Verify response data matches expected schema
  - [ ] 4.6 Remove temporary test code after validation

- [ ] **Task 5: Validate Type Safety** (AC: 4)
  - [ ] 5.1 Intentionally write incorrect API call (wrong endpoint)
  - [ ] 5.2 Verify TypeScript shows compile-time error
  - [ ] 5.3 Intentionally pass wrong request body type
  - [ ] 5.4 Verify TypeScript shows compile-time error
  - [ ] 5.5 Document type safety validation in Dev Notes

- [ ] **Task 6: Document Networking Configuration** (AC: 6)
  - [ ] 6.1 Document localhost differences (iOS vs Android)
  - [ ] 6.2 Document how to test against staging API
  - [ ] 6.3 Document common networking errors and solutions
  - [ ] 6.4 Update README or create mobile networking guide

- [ ] **Task 7: Update Sprint Status** (AC: all)
  - [ ] 7.1 Update sprint-status.yaml: set 6-2 status to done
  - [ ] 7.2 Document any issues or workarounds in Dev Notes
  - [ ] 7.3 Note any differences from web API client configuration

## Dev Notes

### API Client Configuration Pattern

```typescript
// apps/mobile/src/lib/api.ts
import createClient from 'openapi-fetch';
import type { paths } from '@nx-monorepo/api-client';
import Constants from 'expo-constants';

// Get API URL from Expo config with fallback
const API_URL = Constants.expoConfig?.extra?.apiUrl
  ?? 'http://localhost:4000/api';

export const apiClient = createClient<paths>({
  baseUrl: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});
```

### Environment URL Matrix

| Environment | API_URL | How to Configure |
|-------------|---------|------------------|
| iOS Simulator | `http://localhost:4000/api` | Default fallback |
| Android Emulator | `http://10.0.2.2:4000/api` | Set in app.json extra or detect platform |
| Physical Device (Dev) | Railway staging URL (HTTPS) | Set via EAS environment |
| Production | Production API URL | Set via EAS environment |

### Platform Detection Pattern (Optional Enhancement)

```typescript
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const getApiUrl = (): string => {
  // First check Expo config
  const configUrl = Constants.expoConfig?.extra?.apiUrl;
  if (configUrl) return configUrl;

  // Development fallback based on platform
  if (__DEV__) {
    return Platform.select({
      ios: 'http://localhost:4000/api',
      android: 'http://10.0.2.2:4000/api',
      default: 'http://localhost:4000/api',
    });
  }

  // Production fallback (should be set via config)
  return 'https://api.example.com/api';
};

const API_URL = getApiUrl();
```

### app.json Extra Configuration

```json
{
  "expo": {
    "extra": {
      "apiUrl": "http://localhost:4000/api"
    }
  }
}
```

For different environments (staging/production), use `eas.json` to override:

```json
{
  "build": {
    "development": {
      "env": {
        "EXPO_PUBLIC_API_URL": "http://localhost:4000/api"
      }
    },
    "staging": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://staging-api.railway.app/api"
      }
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.example.com/api"
      }
    }
  }
}
```

### Testing API Calls

**Basic health check test:**

```typescript
// Temporary test in app/index.tsx
import { useEffect, useState } from 'react';
import { apiClient } from '../src/lib/api';

const TestApiCall = () => {
  const [result, setResult] = useState<string>('Loading...');

  useEffect(() => {
    const testApi = async () => {
      try {
        const { data, error } = await apiClient.GET('/api/health');
        if (error) {
          setResult(`Error: ${JSON.stringify(error)}`);
        } else {
          setResult(`Success: ${JSON.stringify(data)}`);
        }
      } catch (e) {
        setResult(`Exception: ${e}`);
      }
    };
    testApi();
  }, []);

  return <Text>{result}</Text>;
};
```

### Common Networking Issues

| Issue | Platform | Solution |
|-------|----------|----------|
| "Network request failed" | Android Emulator | Use `10.0.2.2` instead of `localhost` |
| "Cleartext traffic not permitted" | Android | Add `android:usesCleartextTraffic="true"` to AndroidManifest.xml or use HTTPS |
| Connection refused | Both | Ensure server is running on correct port |
| CORS errors | Physical device | CORS should not apply to mobile native HTTP; check if using web view |

### Android Cleartext Traffic (If Needed)

For local development with HTTP (not HTTPS), update `android/app/src/main/AndroidManifest.xml`:

```xml
<application
  android:usesCleartextTraffic="true"
  ...>
```

**Note:** This is only for development. Production should always use HTTPS.

### TypeScript Path Resolution

The `@nx-monorepo/api-client` import relies on:
1. `tsconfig.base.json` paths configuration (already set up)
2. Metro resolver respecting TypeScript paths (via expo/metro-config)

If path resolution fails, verify:
```json
// tsconfig.base.json
{
  "compilerOptions": {
    "paths": {
      "@nx-monorepo/api-client": ["packages/api-client/src/index.ts"]
    }
  }
}
```

### openapi-fetch in React Native

**Expected compatibility:** The `openapi-fetch` library uses the standard `fetch` API, which React Native provides globally. No polyfills should be needed.

**If fetch issues occur:**
1. Check React Native version supports global fetch (0.81.x does)
2. Verify no bundler issues stripping fetch
3. As fallback, could use `axios` but prefer keeping `openapi-fetch` for type safety

### Learnings from Previous Story

**From Story 6.1 (Generate Expo Mobile Application):**

Story 6.1 is currently "drafted" status - not yet implemented. When 6.1 is complete, update this section with:
- Any Metro configuration changes needed
- TypeScript path resolution validation results
- Project structure deviations from expected

**Prerequisite Validation:**
- [ ] Story 6.1 complete (mobile app exists at `apps/mobile/`)
- [ ] `@nx-monorepo/api-client` package is importable
- [ ] Server can be started with `pnpm exec nx run server:serve`

### Project Structure Notes

- **Location**: `apps/mobile/src/lib/api.ts` - follows same pattern as potential web lib structure
- **Dependencies**: Only needs `openapi-fetch` (already in workspace) and `expo-constants` (bundled with Expo)
- **No new packages needed**: This story should not require adding any new dependencies

### References

- [Source: docs/sprint-artifacts/tech-spec-epic-6.md#Story-6.2]
- [Source: docs/sprint-artifacts/epic-6-design-decisions.md#D5-API-Client-Approach]
- [Source: docs/epics.md#Story-6.2]
- [Source: packages/api-client/src/index.ts] - Existing API client patterns
- [Expo Constants Documentation](https://docs.expo.dev/versions/latest/sdk/constants/)
- [openapi-fetch Documentation](https://openapi-ts.pages.dev/openapi-fetch)

## Dev Agent Record

### Context Reference

- `docs/sprint-artifacts/stories/6-2-configure-api-client-for-mobile.context.xml`

### Agent Model Used

<!-- To be filled during implementation -->

### Debug Log References

<!-- To be populated during implementation -->

### Completion Notes List

<!-- To be populated during implementation -->

### File List

<!-- To be populated during implementation -->
