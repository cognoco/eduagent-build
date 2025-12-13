# Epic Technical Specification: Mobile Walking Skeleton

**Date:** 2025-12-13 (Revised for SDK 54)
**Author:** Jørn
**Epic ID:** 6
**Status:** Approved

---

> **Revision Note:** This tech spec was updated on 2025-12-13 to reflect Expo SDK 54 requirements established by Epic 5b (Nx 22.x Infrastructure Upgrade). The original SDK 53 spec is obsolete.
>
> **Related Documents:**
> - `docs/sprint-artifacts/epic-6-design-decisions.md` - Detailed architectural decisions (revised for SDK 54)
> - `docs/sprint-artifacts/epic-5b-nx-upgrade-analysis.md` - Infrastructure upgrade analysis

## Overview

Epic 6 delivers the mobile walking skeleton for the AI-Native Nx Monorepo Template, extending the validated web-server-database infrastructure to cross-platform mobile development using Expo and React Native. This epic validates that the shared infrastructure patterns (API client, schemas, authentication) work identically across web and mobile platforms, proving the building-block philosophy of the template.

The walking skeleton approach continues from Epic 1's pattern: rather than building features, we validate that all mobile infrastructure layers connect and function correctly before any mobile feature development begins. The health check feature used in Epic 1 will be replicated on mobile to prove cross-platform data synchronization.

**Context**: Epic 5b (completed 2025-12-12) upgraded the monorepo to Nx 22.2.0 with @nx/expo plugin and Expo SDK 54, establishing the infrastructure foundation for this epic.

---

## Objectives and Scope

### In Scope

**Infrastructure Objectives:**
- Generate Expo mobile application using `@nx/expo:application` generator
- Configure API client for mobile environment (localhost for simulators, staging URL for devices)
- Integrate shared packages (`@nx-monorepo/api-client`, `@nx-monorepo/schemas`) into mobile app
- Implement health check screen mirroring web functionality
- Validate cross-platform data synchronization (web creates → mobile sees, mobile creates → web sees)
- Document mobile development setup and troubleshooting
- Integrate mobile app into CI/CD pipeline (lint, test, build validation)

**Walking Skeleton Features:**
- Display list of health checks from API
- "Ping" button to create new health check
- Real-time sync validation between web and mobile

### Out of Scope

**Explicitly NOT included in Epic 6:**
- Custom navigation patterns (tabs, drawers, complex stacks) - use out-of-the-box Expo Router
- State management libraries (Redux, Zustand, MobX) - use React state
- Offline-first/caching patterns - online-only for walking skeleton
- Platform-specific native modules - pure JavaScript/TypeScript
- Custom theming system - use Expo defaults
- New Architecture migration - use Legacy Architecture (SDK 54 is last supporting it)
- Authentication flows - deferred to Epic 11 (Mobile Task Management)
- Production app store deployment - EAS Build/Submit deferred to post-PoC

---

## System Architecture Alignment

### Monorepo Integration

Epic 6 extends the existing dependency flow with a new mobile application:

```
apps/web ────────┐
                 ├──► packages/api-client ──► packages/schemas
apps/mobile ─────┘                                   ↑
                                                     │
apps/server ──► packages/database ──────────────────┘
                      │
                      └──► packages/supabase-client
```

**Alignment Points:**
- Mobile app depends on shared packages (api-client, schemas) - same as web
- No app-to-app imports (mobile does not import from web)
- API server remains the security boundary - mobile uses REST+OpenAPI like web
- Nx task graph includes mobile targets (build, lint, test, start)

### Technology Alignment

| Component | Web | Mobile | Alignment |
|-----------|-----|--------|-----------|
| React | 19.1.0 | 19.1.0 | ✅ Exact match via pnpm overrides |
| React Native | N/A | 0.81.5 | ✅ SDK 54 bundled version |
| API Client | openapi-fetch | openapi-fetch | ✅ Same library |
| Schema Validation | Zod | Zod | ✅ Same library |
| TypeScript | ~5.9.2 | ~5.9.2 | ✅ Same version |
| Testing | Jest 30 | Jest (Expo preset) | ✅ Same framework |

### Architectural Constraints

From `docs/architecture-decisions.md` and Epic 5b analysis:
- **SDK 54 is required** - @nx/expo 22.2.0 plugin requires `expo >= 54.0.0`
- **Legacy Architecture** - SDK 55 will require New Architecture; SDK 54 is transition period
- **Metro auto-configuration** - Since SDK 52, no manual watchFolders configuration needed
- **Single React version** - pnpm overrides enforce 19.1.0 monorepo-wide

---

## Detailed Design

### Services and Modules

| Module | Location | Responsibility |
|--------|----------|----------------|
| **Mobile App** | `apps/mobile/` | Expo application shell with Expo Router navigation |
| **Health Check Screen** | `apps/mobile/app/index.tsx` | Display health checks, trigger new pings |
| **API Configuration** | `apps/mobile/src/lib/api.ts` | Environment-aware API client factory |
| **Shared API Client** | `packages/api-client/` | Type-safe REST client (existing) |
| **Shared Schemas** | `packages/schemas/` | Zod schemas for validation (existing) |

### Project Structure

> **Decision:** Using Expo Router v6 (file-based routing). See `epic-6-design-decisions.md`.

```
apps/mobile/
├── app/                        # Expo Router routes (file-based)
│   ├── _layout.tsx             # Root layout (providers, navigation config)
│   ├── index.tsx               # Home/Health check screen (/)
│   └── +not-found.tsx          # 404 handler
├── assets/                     # Static assets (images, fonts)
├── src/
│   ├── components/             # Reusable components
│   │   └── HealthCheckList.tsx # Health check list component
│   └── lib/
│       └── api.ts              # API client configuration
├── app.json                    # Expo configuration
├── babel.config.js             # Babel configuration
├── metro.config.js             # Metro bundler config (auto-configured since SDK 52)
├── tsconfig.json               # TypeScript configuration
├── jest.config.ts              # Jest configuration
└── project.json                # Nx project configuration
```

**Note:** For the walking skeleton, use the out-of-the-box Expo Router structure. Do not introduce custom navigation patterns (tabs, drawers, complex stacks) yet.

### Data Models and Contracts

Mobile reuses existing schemas from `@nx-monorepo/schemas`:

```typescript
// packages/schemas/src/lib/health.schema.ts (existing)
import { z } from 'zod';

export const HealthCheckSchema = z.object({
  id: z.string().uuid(),
  message: z.string(),
  timestamp: z.string().datetime(),
});

export const CreateHealthCheckSchema = z.object({
  message: z.string().min(1).max(500),
});

export type HealthCheck = z.infer<typeof HealthCheckSchema>;
export type CreateHealthCheck = z.infer<typeof CreateHealthCheckSchema>;
```

### APIs and Interfaces

Mobile consumes existing REST+OpenAPI endpoints:

| Method | Path | Request | Response | Mobile Usage |
|--------|------|---------|----------|--------------|
| `GET` | `/api/health` | - | `{ data: HealthCheck[] }` | Fetch health check list |
| `POST` | `/api/health` | `CreateHealthCheck` | `{ data: HealthCheck }` | Create new health check (Ping) |

**API Client Configuration (Mobile-Specific):**

```typescript
// apps/mobile/src/lib/api.ts
import createClient from 'openapi-fetch';
import type { paths } from '@nx-monorepo/api-client';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl
  ?? 'http://localhost:4000/api';

export const apiClient = createClient<paths>({
  baseUrl: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});
```

**Environment URL Configuration:**

| Environment | API_URL | Notes |
|-------------|---------|-------|
| iOS Simulator | `http://localhost:4000/api` | Same as web dev |
| Android Emulator | `http://10.0.2.2:4000/api` | Android's localhost alias |
| Physical Device (Dev Build) | Railway staging URL | Must be public HTTPS |
| Production | Production API URL | Future consideration |

### Workflows and Sequencing

**Story Sequence (Epic 6):**

```
6.1 Generate Expo Application
    │
    ▼
6.2 Configure API Client for Mobile
    │
    ▼
6.3 Implement Mobile Health Check Screen
    │
    ▼
6.4 Validate Cross-Platform Sync
    │
    ▼
6.5 Document Mobile Development Setup
    │
    ▼
6.6 Mobile CI/CD Pipeline Integration
    │
    ▼
6.7 Validate Mobile Deployment Pipeline
```

**Health Check Flow (Mobile):**

```
1. User opens mobile app
   ↓
2. HealthScreen mounts
   ↓
3. useEffect triggers: apiClient.GET('/api/health')
   ↓
4. Express API → Prisma → Supabase PostgreSQL
   ↓
5. JSON response returns to mobile
   ↓
6. State updates, FlatList renders health checks
   ↓
7. User taps "Ping" button
   ↓
8. apiClient.POST('/api/health', { body: { message: 'Mobile ping' } })
   ↓
9. New record created in database
   ↓
10. Refetch list, new record appears
```

---

## Non-Functional Requirements

### Performance

| Metric | Target | Rationale |
|--------|--------|-----------|
| App startup | < 3 seconds | Standard mobile expectation |
| API call latency | < 200ms | Same as web (shared API) |
| Metro bundler start | < 30 seconds | Development productivity |
| CI build time | < 5 minutes | Addition to existing ~10 min pipeline |

**Validation Method:** Manual testing during Story 6.1 and 6.3; CI timing in Story 6.6.

### Security

**Mobile-Specific Security Concerns:**

| Concern | Mitigation |
|---------|------------|
| API URL exposure | Use `expo-constants` for environment configuration |
| Transport security | HTTPS required for non-localhost (enforced by iOS ATS) |
| Secret storage | Defer to Epic 11 (auth flows); walking skeleton has no secrets |
| Code signing | EAS Build handles signing; deferred to post-PoC |

**Alignment with Architecture:**
- API server remains security boundary (no direct database access from mobile)
- Input validation via Zod schemas (same as web)
- No authentication in walking skeleton (public health check endpoint)

### Reliability/Availability

**Walking Skeleton Reliability Targets:**

| Scenario | Expected Behavior |
|----------|-------------------|
| API unavailable | Display error message, allow retry |
| Network timeout | 10-second timeout, error display |
| Invalid response | Validation error via Zod, graceful handling |

**Note:** Walking skeleton prioritizes "happy path" validation. Comprehensive error handling patterns will be established during Task App PoC (Epic 11).

### Observability

**Deferred to Epic 3 Extension:**
- Sentry SDK is available for React Native but not wired in walking skeleton
- Basic `console.log` debugging sufficient for infrastructure validation
- Full mobile observability integration planned for Task App PoC

**CI Observability:**
- Nx Cloud will capture mobile task execution metrics
- GitHub Actions will log lint/test/build results
- Pipeline failures will block PR merges

---

## Dependencies and Integrations

### Package Dependencies (Installed via Epic 5b)

| Package | Version | Purpose |
|---------|---------|---------|
| expo | ~54.0.0 | Expo SDK and CLI |
| react-native | 0.81.5 | Mobile framework |
| react | 19.1.0 | UI library (aligned with web) |
| expo-router | ~6.0.17 | File-based navigation |
| expo-constants | (bundled) | Environment configuration |
| @nx/expo | 22.2.0 | Nx plugin for Expo |

### Development Dependencies (To Be Added in Story 6.1)

| Package | Purpose | Added By |
|---------|---------|----------|
| @testing-library/react-native | Mobile component testing | Post-generation checklist |
| jest-expo | Jest preset for Expo | @nx/expo generator |

### External Integrations

| Service | Integration Point | Status |
|---------|-------------------|--------|
| Expo Dev Server | `nx run mobile:start` | Story 6.1 |
| Expo Go (testing) | QR code scanning | Story 6.1 |
| Nx Cloud | Remote caching | Already configured |
| GitHub Actions | CI/CD pipeline | Story 6.6 |
| Railway API | Staging backend | Already deployed |

### Metro Configuration

Since SDK 52, Expo automatically configures Metro for monorepos when using `expo/metro-config`. **No manual configuration required.**

```javascript
// apps/mobile/metro.config.js (expected from generator)
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
```

**Note:** If @nx/expo generator includes `withNxMetro` wrapper, it should be compatible with automatic monorepo support. Validate during Story 6.1.

---

## Acceptance Criteria (Authoritative)

### Epic-Level Success Criteria

1. **AC-E6.1**: Mobile app generated with correct Nx project structure and Expo Router navigation
2. **AC-E6.2**: API client configured and making successful calls to server
3. **AC-E6.3**: Health check screen displays data from API and creates new pings
4. **AC-E6.4**: Cross-platform sync validated (web ↔ mobile data consistency)
5. **AC-E6.5**: Mobile development documentation complete and accurate
6. **AC-E6.6**: CI/CD pipeline includes mobile targets (lint, test, build)
7. **AC-E6.7**: Mobile deployment pipeline validated end-to-end

### Story-Level Acceptance Criteria

**Story 6.1: Generate Expo Mobile Application**
- [ ] `pnpm exec nx g @nx/expo:application mobile --directory=apps/mobile` succeeds
- [ ] `pnpm exec nx run mobile:start` launches Expo dev server
- [ ] `pnpm exec nx run mobile:lint` passes
- [ ] `pnpm exec nx run mobile:test` passes (default tests)
- [ ] TypeScript path aliases resolve (`@nx-monorepo/*`)

**Story 6.2: Configure API Client for Mobile**
- [ ] `apiClient` factory created in `apps/mobile/src/lib/api.ts`
- [ ] Environment-aware URL configuration working
- [ ] Test API call succeeds from mobile app
- [ ] Type safety preserved (compile-time errors on wrong API usage)

**Story 6.3: Implement Mobile Health Check Screen**
- [ ] Health checks list displayed on home screen
- [ ] "Ping" button creates new health check
- [ ] List updates after new ping created
- [ ] Error states handled (API unavailable, network error)

**Story 6.4: Validate Cross-Platform Sync**
- [ ] Web creates ping → Mobile sees it immediately (after refresh)
- [ ] Mobile creates ping → Web sees it immediately (after refresh)
- [ ] Same data displayed on both platforms
- [ ] Timestamps and IDs match exactly

**Story 6.5: Document Mobile Development Setup**
- [ ] README section for mobile development added
- [ ] Simulator/emulator setup documented
- [ ] Network configuration for local development documented
- [ ] Troubleshooting section with common issues

**Story 6.6: Mobile CI/CD Pipeline Integration**
- [ ] `.github/workflows/ci.yml` updated with mobile targets
- [ ] `pnpm exec nx run mobile:lint` runs in CI
- [ ] `pnpm exec nx run mobile:test` runs in CI
- [ ] `pnpm exec nx run mobile:build-deps` runs in CI (if applicable)
- [ ] CI passes with new mobile project

**Story 6.7: Validate Mobile Deployment Pipeline**
- [ ] CI pipeline completes successfully with mobile targets
- [ ] Nx Cloud shows mobile task caching working
- [ ] No regression in existing web/server CI
- [ ] Pipeline timing documented

---

## Traceability Mapping

| AC ID | PRD Requirement | Spec Section | Component/API | Test Idea |
|-------|-----------------|--------------|---------------|-----------|
| AC-E6.1 | FR20 (shared patterns) | Services/Modules | `apps/mobile/` | Generator output validation |
| AC-E6.2 | FR20 (API client sharing) | APIs/Interfaces | `api.ts` | API call integration test |
| AC-E6.3 | FR21 (mirror web flows) | Workflows | Health screen | E2E user journey |
| AC-E6.4 | FR21 (identical behavior) | Workflows | Cross-platform | Manual + automated sync test |
| AC-E6.5 | FR22 (documentation) | NFR/Observability | `README.md` | Documentation review |
| AC-E6.6 | FR13 (CI pipeline) | NFR/Performance | `.github/workflows/` | CI execution verification |
| AC-E6.7 | FR13 (CI validation) | NFR/Reliability | Nx Cloud | Pipeline health check |

---

## Risks, Assumptions, Open Questions

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Metro bundler issues with monorepo | Medium | High | Use SDK 52+ auto-configuration; validate in Story 6.1 |
| TypeScript path alias resolution | Medium | Medium | Verify `tsconfig.base.json` paths work with Metro |
| openapi-fetch incompatibility with RN | Low | High | Test early in Story 6.2; fallback to native fetch if needed |
| Android emulator networking issues | Medium | Low | Document `10.0.2.2` workaround; test both platforms |
| Jest configuration drift | Low | Medium | Follow post-generation checklist; align with workspace patterns |

### Assumptions

| Assumption | Validation Point |
|------------|------------------|
| A1: Expo SDK 54 stable for production use | Epic 5b research confirmed 2+ months stable |
| A2: @nx/expo generator produces valid project | Validate in Story 6.1 |
| A3: openapi-fetch works in React Native | Test in Story 6.2 |
| A4: pnpm workspaces resolve correctly for Metro | Verify in Story 6.1 |
| A5: Legacy Architecture sufficient for walking skeleton | Confirmed in Epic 5b design decisions |

### Open Questions

| Question | Decision Point | Owner | Status |
|----------|----------------|-------|--------|
| Q1: Use Expo Go or Dev Build for development? | Story 6.1 | Dev Agent | Open |
| Q2: Add mobile-specific ESLint rules? | Story 6.1 | Dev Agent | Open |
| Q3: Include visual regression testing? | Story 6.6 | SM | Deferred |
| Q4: EAS Build for CI artifacts? | Post-PoC | Architect | Deferred |

---

## Test Strategy Summary

### Testing Levels

| Level | Framework | Scope | Coverage Target |
|-------|-----------|-------|-----------------|
| **Unit** | Jest + @testing-library/react-native | Components, utilities | 60% (walking skeleton) |
| **Integration** | Jest | API client integration | API call success/failure |
| **E2E** | Manual | Full user journey | Sync validation |

### Test Plan by Story

| Story | Test Focus | Validation Method |
|-------|------------|-------------------|
| 6.1 | Project generation | `nx run mobile:test` passes |
| 6.2 | API integration | Mock API tests + real API smoke test |
| 6.3 | UI rendering | Component tests + manual QA |
| 6.4 | Cross-platform sync | Manual testing (web ↔ mobile) |
| 6.5 | Documentation accuracy | Review checklist |
| 6.6 | CI integration | Pipeline execution |
| 6.7 | Pipeline reliability | Multiple CI runs |

### Coverage Strategy

**Walking Skeleton Baseline:**
- Coverage measured but not enforced (consistent with MVP phase)
- Focus on critical paths: API calls, data rendering
- Component tests for reusable UI elements

**Deferred to Task App PoC:**
- 80% coverage enforcement
- Comprehensive error handling tests
- Authentication flow tests

---

## References

### Source Documents

- `docs/PRD.md` - FR20-FR22 (Mobile requirements)
- `docs/architecture.md` - Dependency flow, project structure
- `docs/architecture-decisions.md` - REST+OpenAPI, Expo choices
- `docs/tech-stack.md` - Version matrix, Expo SDK 54
- `docs/epics.md` - Epic 6 user stories
- `docs/sprint-artifacts/epic-6-design-decisions.md` - SDK 54 decisions
- `docs/sprint-artifacts/epic-5b-nx-upgrade-analysis.md` - Infrastructure upgrade

### External Documentation

- [Expo SDK 54 Changelog](https://expo.dev/changelog/sdk-54)
- [Expo Router Documentation](https://docs.expo.dev/router/introduction)
- [Expo Monorepo Guide](https://docs.expo.dev/guides/monorepos)
- [Nx Expo Plugin](https://nx.dev/nx-api/expo)
- [openapi-fetch Documentation](https://openapi-ts.pages.dev/openapi-fetch)

---

## Document History

| Date | Author | Change |
|------|--------|--------|
| 2025-12-05 | SM Agent (Rincewind) | Initial draft with SDK 53 assumptions |
| 2025-12-13 | SM Agent (Rincewind) | **Major revision**: Updated for SDK 54 per Epic 5b; revised React 19.1.0, expo-router v6, removed obsolete Metro config guidance, updated dependencies, aligned with epic-6-design-decisions.md |
