# Mobile App (@nx-monorepo/mobile)

Expo React Native mobile application for the nx-monorepo template.

## Quick Start

```bash
# Start development server
pnpm exec nx run mobile:start

# Run on iOS Simulator (macOS only)
pnpm exec nx run mobile:run-ios

# Run on Android Emulator
pnpm exec nx run mobile:run-android

# Run tests
pnpm exec nx run mobile:test
```

## Networking Configuration

### API Client Setup

The mobile app uses the shared `@nx-monorepo/api-client` package for type-safe API calls:

```typescript
import { apiClient } from '../lib/api';

// Type-safe API calls with autocomplete
const { data, error } = await apiClient.GET('/health');
```

### Environment-Aware URLs

The API client automatically selects the correct URL based on environment and platform:

| Environment | Platform | API URL |
|-------------|----------|---------|
| Development | iOS Simulator | `http://localhost:4000/api` |
| Development | Android Emulator | `http://10.0.2.2:4000/api` |
| Staging (EAS) | All | `https://nx-monoreposerver-staging.up.railway.app/api` |
| Production (EAS) | All | `https://nx-monoreposerver-production.up.railway.app/api` |

#### URL Resolution Priority

1. **Environment Variable** (`EXPO_PUBLIC_API_URL`) - Recommended for local dev + Expo Go
2. **Expo Config** (`app.json` → `extra.apiUrl`)
3. **Platform Detection** (iOS vs Android development defaults)
4. **Production Fallback** (when not in `__DEV__` mode)

### Why Different URLs?

**iOS Simulator** can access `localhost` directly because it shares the host machine's network stack.

**Android Emulator** runs in a virtual machine with its own network. The special IP `10.0.2.2` is an alias that routes to the host machine's `localhost`.

### Testing Against Staging API

To test the mobile app against staging (without building via EAS):

```bash
# Set environment variable before starting
EXPO_PUBLIC_API_URL=https://nx-monoreposerver-staging.up.railway.app/api pnpm exec nx run mobile:start
```

> Tip: If you are using **Expo Go with a Tunnel URL** (like `exp://*.exp.direct`), your phone cannot reach `http://localhost:4000`.
> Use a reachable API URL (staging, or a LAN IP) via `EXPO_PUBLIC_API_URL`.

Or temporarily modify `app.json`:

```json
{
  "expo": {
    "extra": {
      "apiUrl": "https://nx-monoreposerver-staging.up.railway.app/api"
    }
  }
}
```

### Common Networking Issues

| Issue | Platform | Solution |
|-------|----------|----------|
| "Network request failed" | Android | Use `10.0.2.2` instead of `localhost` |
| "Connection refused" | Both | Ensure server is running: `pnpm exec nx run server:serve` |
| "Cleartext traffic not permitted" | Android | Add to AndroidManifest.xml (see below) or use HTTPS |
| Timeout errors | Both | Check firewall settings, ensure port 4000 is accessible |

### Android Cleartext Traffic (Development Only)

For local HTTP development on Android, you may need to enable cleartext traffic:

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<application
  android:usesCleartextTraffic="true"
  ...>
```

> **Note**: This is for development only. Production builds should always use HTTPS.

### Starting the Backend

Before testing API calls, start the Express server:

```bash
# Terminal 1: Start the backend
pnpm exec nx run server:serve

# Terminal 2: Start the mobile app
pnpm exec nx run mobile:start
```

The server runs on port 4000 by default. Health check endpoint: `GET /api/health`

## Project Structure

```
apps/mobile/
├── app/                    # Expo Router app directory
│   ├── _layout.tsx         # Root layout
│   └── index.tsx           # Home screen
├── src/
│   ├── app/                # App components
│   │   └── App.tsx         # Main app component
│   └── lib/
│       └── api.ts          # API client configuration
├── app.json                # Expo configuration
├── eas.json                # EAS Build configuration
└── tsconfig.json           # TypeScript configuration
```

## Building for Production

```bash
# Build for iOS (requires EAS account)
eas build --platform ios --profile production

# Build for Android
eas build --platform android --profile production
```

See `eas.json` for build profile configurations including environment-specific API URLs.

## Related Documentation

- [Expo Documentation](https://docs.expo.dev/)
- [API Client Package](../../packages/api-client/README.md)
- [Server Deployment Guide](../../docs/guides/server-deployment.md)
