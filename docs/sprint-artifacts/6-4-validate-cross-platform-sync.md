# Story 6.4: Validate Cross-Platform Sync

Status: ready-for-dev

## Story

As a product owner,
I want to verify that health check data syncs correctly between web and mobile platforms,
So that I have confidence in cross-platform functionality and shared infrastructure.

## Acceptance Criteria

1. **AC-6.4.1**: Web creates ping → Mobile sees it immediately (after manual refresh)
2. **AC-6.4.2**: Mobile creates ping → Web sees it immediately (after page refresh)
3. **AC-6.4.3**: Same data displayed on both platforms (message, ID, timestamp)
4. **AC-6.4.4**: Timestamps and UUIDs match exactly between platforms
5. **AC-6.4.5**: Validation documented with screenshots or video recording
6. **AC-6.4.6**: Any sync limitations or latency observations documented

## Tasks / Subtasks

- [ ] **Task 1: Prepare Test Environment** (AC: 1-4)
  - [ ] 1.1 Ensure server is running: `pnpm exec nx run server:serve`
  - [ ] 1.2 Ensure web app is running: `pnpm exec nx run web:dev`
  - [ ] 1.3 Ensure mobile app is running: `pnpm exec nx run mobile:start`
  - [ ] 1.4 Clear existing health checks from database (optional, for clean test)
  - [ ] 1.5 Verify API endpoint is accessible from both platforms

- [ ] **Task 2: Test Web → Mobile Sync** (AC: 1, 3, 4)
  - [ ] 2.1 Open web app health check page
  - [ ] 2.2 Open mobile app on simulator/emulator
  - [ ] 2.3 Create new health check via web app "Ping" button
  - [ ] 2.4 Note the timestamp and ID of created record
  - [ ] 2.5 Refresh mobile app (pull-to-refresh)
  - [ ] 2.6 Verify new record appears with matching ID and timestamp
  - [ ] 2.7 Screenshot both platforms showing same data
  - [ ] 2.8 Repeat test 3 times for consistency validation

- [ ] **Task 3: Test Mobile → Web Sync** (AC: 2, 3, 4)
  - [ ] 3.1 Create new health check via mobile app "Ping" button
  - [ ] 3.2 Note the timestamp and ID of created record
  - [ ] 3.3 Refresh web app page
  - [ ] 3.4 Verify new record appears with matching ID and timestamp
  - [ ] 3.5 Screenshot both platforms showing same data
  - [ ] 3.6 Repeat test 3 times for consistency validation

- [ ] **Task 4: Validate Data Integrity** (AC: 3, 4)
  - [ ] 4.1 Create 5 health checks alternating between web and mobile
  - [ ] 4.2 Verify all 5 appear on both platforms after refresh
  - [ ] 4.3 Verify chronological order is preserved
  - [ ] 4.4 Verify UUIDs are valid v4 format
  - [ ] 4.5 Verify timestamps are in ISO 8601 format
  - [ ] 4.6 Compare raw API responses from both platforms (optional)

- [ ] **Task 5: Test iOS Simulator** (AC: 1-4)
  - [ ] 5.1 Run all sync tests on iOS Simulator
  - [ ] 5.2 Document any iOS-specific behavior
  - [ ] 5.3 Note latency observations (time from create to visible after refresh)

- [ ] **Task 6: Test Android Emulator** (AC: 1-4)
  - [ ] 6.1 Run all sync tests on Android Emulator
  - [ ] 6.2 Document any Android-specific behavior
  - [ ] 6.3 Note latency observations
  - [ ] 6.4 Verify 10.0.2.2 localhost alias works correctly

- [ ] **Task 7: Document Validation Results** (AC: 5, 6)
  - [ ] 7.1 Create validation report section in Dev Agent Record
  - [ ] 7.2 Include screenshots showing:
    - Web app with health check list
    - Mobile app (iOS) with same data
    - Mobile app (Android) with same data
  - [ ] 7.3 Document test execution dates and times
  - [ ] 7.4 Document any sync limitations discovered
  - [ ] 7.5 Document latency observations (typical refresh-to-visible time)
  - [ ] 7.6 Document any edge cases or known issues

- [ ] **Task 8: Optional - Screen Recording** (AC: 5)
  - [ ] 8.1 Record video of complete sync test cycle
  - [ ] 8.2 Show web create → mobile refresh → data visible
  - [ ] 8.3 Show mobile create → web refresh → data visible
  - [ ] 8.4 Save recording for demo/documentation purposes

- [ ] **Task 9: Update Sprint Status** (AC: all)
  - [ ] 9.1 Update sprint-status.yaml: set 6-4 status to done
  - [ ] 9.2 Document completion notes in Dev Agent Record

## Dev Notes

### Cross-Platform Sync Architecture

```
Web App                    Mobile App
   │                           │
   │  POST /api/health         │  POST /api/health
   └──────────┬────────────────┴──────────┬───────────┘
              │                           │
              ▼                           ▼
         ┌─────────────────────────────────────┐
         │         Express API Server          │
         │        (Railway Staging)            │
         └─────────────────┬───────────────────┘
                           │
                           ▼
         ┌─────────────────────────────────────┐
         │          Supabase PostgreSQL        │
         │         (Single Source of Truth)    │
         └─────────────────────────────────────┘
              │                           │
              ▼                           ▼
   ┌──────────────────┐         ┌──────────────────┐
   │  GET /api/health │         │  GET /api/health │
   │  (Web refetch)   │         │  (Mobile refetch)│
   └──────────────────┘         └──────────────────┘
```

### What "Sync" Means in Walking Skeleton

**Important:** The walking skeleton does NOT implement real-time sync (WebSockets, polling, push notifications). "Sync" validation confirms:

1. **Shared Database**: Both platforms read/write to the same Supabase PostgreSQL database
2. **Eventual Consistency**: After manual refresh, both platforms see identical data
3. **Data Integrity**: UUIDs and timestamps created by either platform are valid and preserved

**Future Enhancements (Out of Scope):**
- Real-time updates via WebSocket/SSE
- Push notifications on new data
- Optimistic UI with background sync
- Conflict resolution

### Test Data Format

Health check records should match this structure on both platforms:

```typescript
interface HealthCheck {
  id: string;        // UUID v4, e.g., "550e8400-e29b-41d4-a716-446655440000"
  message: string;   // "Web ping" or "Mobile ping"
  timestamp: string; // ISO 8601, e.g., "2025-12-13T10:30:00.000Z"
}
```

### Validation Checklist

| Test | Web | iOS | Android | Notes |
|------|-----|-----|---------|-------|
| Create from web, see on mobile | ☐ | ☐ | ☐ | |
| Create from mobile, see on web | ☐ | ☐ | ☐ | |
| UUIDs match exactly | ☐ | ☐ | ☐ | |
| Timestamps match exactly | ☐ | ☐ | ☐ | |
| Order preserved | ☐ | ☐ | ☐ | |
| 5+ record stress test | ☐ | ☐ | ☐ | |

### Expected Latency Observations

| Scenario | Expected Time |
|----------|---------------|
| Create record (API call) | < 200ms |
| Refresh to see new data | < 500ms |
| Total create-to-visible | < 1 second |

**Note:** Latency may vary based on network conditions and Railway cold start.

### Common Issues and Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Mobile doesn't see web data | Different API endpoint | Verify both use same `API_URL` |
| Timestamps differ | Timezone conversion | Ensure UTC storage, local display |
| UUIDs appear different | Display formatting | Compare raw values, not UI |
| Android can't reach server | Network config | Use `10.0.2.2` for localhost |
| Data appears delayed | Cold start | Retry after server warm-up |

### Environment Configurations

**Local Development (Default):**
```
Web App:      http://localhost:3000
Server API:   http://localhost:4000/api
iOS Sim:      http://localhost:4000/api
Android Emu:  http://10.0.2.2:4000/api
```

**Staging (Optional Test):**
```
Web App:      https://[vercel-staging-url]
Server API:   https://[railway-staging-url]/api
Mobile:       https://[railway-staging-url]/api
```

### Prerequisites

- [ ] Story 6.1 complete (mobile app exists)
- [ ] Story 6.2 complete (API client configured for mobile)
- [ ] Story 6.3 complete (health check screen implemented)
- [ ] Server running with health check endpoint
- [ ] iOS Simulator and/or Android Emulator available

### References

- [Source: docs/sprint-artifacts/tech-spec-epic-6.md#Story-6.4]
- [Source: docs/sprint-artifacts/epic-6-design-decisions.md]
- [Source: apps/web/src/app/health/page.tsx] - Web health check page
- [Source: apps/mobile/app/index.tsx] - Mobile health check screen
- [Source: apps/server/src/routes/health.ts] - Health check API endpoints

## Dev Agent Record

### Context Reference

- `docs/sprint-artifacts/6-4-validate-cross-platform-sync.context.xml`

### Agent Model Used

<!-- To be filled during implementation -->

### Debug Log References

<!-- To be populated during implementation -->

### Validation Results

<!-- To be populated during implementation with:
- Screenshot links or inline images
- Test execution timestamps
- Latency measurements
- Pass/fail for each test case
-->

### Completion Notes List

<!-- To be populated during implementation -->

### File List

<!-- No files modified - this is a validation story -->
