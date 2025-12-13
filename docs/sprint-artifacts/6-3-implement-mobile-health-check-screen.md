# Story 6.3: Implement Mobile Health Check Screen

Status: ready-for-dev

## Story

As a mobile user,
I want to view a list of health checks and trigger new pings from the mobile app,
so that I can verify the mobile-to-server data flow works identically to the web app.

## Acceptance Criteria

1. **AC-6.3.1**: Health checks list displayed on home screen (`app/index.tsx`) using FlatList or similar
2. **AC-6.3.2**: "Ping" button creates new health check via `POST /api/health`
3. **AC-6.3.3**: List updates immediately after new ping created (refetch or optimistic update)
4. **AC-6.3.4**: Loading state displayed while fetching data
5. **AC-6.3.5**: Error states handled gracefully (API unavailable, network error, timeout)
6. **AC-6.3.6**: Empty state displayed when no health checks exist
7. **AC-6.3.7**: Pull-to-refresh functionality to manually refetch list

## Tasks / Subtasks

- [ ] **Task 1: Create HealthCheckList Component** (AC: 1, 4, 6)
  - [ ] 1.1 Create `apps/mobile/src/components/HealthCheckList.tsx`
  - [ ] 1.2 Implement FlatList to render health check items
  - [ ] 1.3 Create `HealthCheckItem` sub-component for individual items
  - [ ] 1.4 Add loading spinner/skeleton state
  - [ ] 1.5 Add empty state message ("No health checks yet. Tap Ping to create one!")
  - [ ] 1.6 Style with React Native StyleSheet (no external UI libs for walking skeleton)

- [ ] **Task 2: Implement Data Fetching Hook** (AC: 1, 4, 5)
  - [ ] 2.1 Create `apps/mobile/src/hooks/useHealthChecks.ts`
  - [ ] 2.2 Use `apiClient.GET('/api/health')` from story 6.2's api.ts
  - [ ] 2.3 Manage loading, data, and error states
  - [ ] 2.4 Add refetch function for pull-to-refresh
  - [ ] 2.5 Handle network errors with user-friendly messages
  - [ ] 2.6 Write unit test: `useHealthChecks.spec.ts`

- [ ] **Task 3: Implement Ping Mutation** (AC: 2, 3)
  - [ ] 3.1 Create `apps/mobile/src/hooks/useCreateHealthCheck.ts` (or add to existing hook)
  - [ ] 3.2 Use `apiClient.POST('/api/health', { body: { message: 'Mobile ping' } })`
  - [ ] 3.3 Trigger refetch after successful creation
  - [ ] 3.4 Handle mutation errors gracefully
  - [ ] 3.5 Add loading state for ping button during mutation

- [ ] **Task 4: Build Home Screen UI** (AC: 1, 2, 7)
  - [ ] 4.1 Update `apps/mobile/app/index.tsx` to use HealthCheckList
  - [ ] 4.2 Add "Ping" button (Pressable/TouchableOpacity) at bottom or in header
  - [ ] 4.3 Connect Ping button to createHealthCheck mutation
  - [ ] 4.4 Implement pull-to-refresh via RefreshControl
  - [ ] 4.5 Add screen title "Health Checks" in layout

- [ ] **Task 5: Implement Error Handling UI** (AC: 5)
  - [ ] 5.1 Create error display component or inline error message
  - [ ] 5.2 Add "Retry" button for failed fetches
  - [ ] 5.3 Display specific error messages (network error vs server error)
  - [ ] 5.4 Ensure errors don't crash the app (error boundary or try/catch)

- [ ] **Task 6: Manual Testing** (AC: 1-7)
  - [ ] 6.1 Start server: `pnpm exec nx run server:serve`
  - [ ] 6.2 Start mobile: `pnpm exec nx run mobile:start`
  - [ ] 6.3 Test on iOS Simulator:
    - [ ] 6.3.1 Verify list loads and displays health checks
    - [ ] 6.3.2 Verify "Ping" button creates new entry
    - [ ] 6.3.3 Verify list updates after ping
    - [ ] 6.3.4 Verify pull-to-refresh works
    - [ ] 6.3.5 Test with server stopped (error handling)
  - [ ] 6.4 Test on Android Emulator (same test cases)
  - [ ] 6.5 Document any platform-specific issues

- [ ] **Task 7: Write Component Tests** (AC: 1, 4, 5, 6)
  - [ ] 7.1 Create `HealthCheckList.spec.tsx` using @testing-library/react-native
  - [ ] 7.2 Test loading state renders correctly
  - [ ] 7.3 Test empty state renders when data is empty
  - [ ] 7.4 Test error state renders error message
  - [ ] 7.5 Test list renders items correctly
  - [ ] 7.6 Run: `pnpm exec nx run mobile:test`

- [ ] **Task 8: Update Sprint Status** (AC: all)
  - [ ] 8.1 Update sprint-status.yaml: set 6-3 status to done
  - [ ] 8.2 Document completion notes in Dev Agent Record

## Dev Notes

### Health Check Screen Architecture

```
app/index.tsx (Home Screen)
    │
    ├── HealthCheckList (Component)
    │   ├── FlatList → HealthCheckItem[]
    │   ├── Loading spinner
    │   ├── Empty state
    │   └── Error state with retry
    │
    ├── Ping Button (Pressable)
    │   └── createHealthCheck() mutation
    │
    └── Pull-to-Refresh (RefreshControl)
        └── refetch() from hook
```

### Data Flow

```
1. Screen mounts
   ↓
2. useHealthChecks() → apiClient.GET('/api/health')
   ↓
3. Express API → Prisma → Supabase
   ↓
4. JSON response: { data: HealthCheck[] }
   ↓
5. FlatList renders items
   ↓
6. User taps "Ping"
   ↓
7. apiClient.POST('/api/health', { body: { message: 'Mobile ping' } })
   ↓
8. Server creates record, returns new HealthCheck
   ↓
9. Trigger refetch → list updates with new item
```

### Implementation Patterns

**Hook Pattern (useHealthChecks):**

```typescript
// apps/mobile/src/hooks/useHealthChecks.ts
import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/api';
import type { HealthCheck } from '@nx-monorepo/schemas';

export function useHealthChecks() {
  const [data, setData] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHealthChecks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: responseData, error: apiError } = await apiClient.GET('/api/health');
      if (apiError) {
        setError('Failed to load health checks');
      } else {
        setData(responseData?.data ?? []);
      }
    } catch (e) {
      setError('Network error. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealthChecks();
  }, [fetchHealthChecks]);

  return { data, loading, error, refetch: fetchHealthChecks };
}
```

**FlatList Pattern:**

```typescript
// apps/mobile/src/components/HealthCheckList.tsx
import { FlatList, Text, View, ActivityIndicator, StyleSheet } from 'react-native';
import type { HealthCheck } from '@nx-monorepo/schemas';

interface Props {
  data: HealthCheck[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  refreshing: boolean;
}

export function HealthCheckList({ data, loading, error, onRefresh, refreshing }: Props) {
  if (loading && data.length === 0) {
    return <ActivityIndicator size="large" />;
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (data.length === 0) {
    return (
      <View style={styles.centered}>
        <Text>No health checks yet. Tap Ping to create one!</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <HealthCheckItem item={item} />}
      refreshing={refreshing}
      onRefresh={onRefresh}
    />
  );
}
```

**Mutation Pattern:**

```typescript
// In hook or component
const createHealthCheck = async () => {
  setMutating(true);
  try {
    const { error } = await apiClient.POST('/api/health', {
      body: { message: 'Mobile ping' }
    });
    if (error) {
      Alert.alert('Error', 'Failed to create health check');
    } else {
      refetch(); // Refresh the list
    }
  } catch (e) {
    Alert.alert('Error', 'Network error');
  } finally {
    setMutating(false);
  }
};
```

### Error State Patterns

| Error Type | User Message | Recovery Action |
|------------|--------------|-----------------|
| Network error | "Network error. Check your connection." | Retry button |
| Server error (5xx) | "Server unavailable. Try again later." | Retry button |
| Timeout | "Request timed out. Check your connection." | Retry button |
| Empty data | "No health checks yet. Tap Ping to create one!" | Ping button |

### Testing Strategy

**Unit Tests (Jest + @testing-library/react-native):**
- Hook tests: Mock apiClient, verify state transitions
- Component tests: Verify rendering for all states (loading, empty, error, data)

**Manual Testing Matrix:**

| Platform | Server Running | Expected Behavior |
|----------|---------------|-------------------|
| iOS Simulator | Yes | List loads, ping works |
| iOS Simulator | No | Error state with retry |
| Android Emulator | Yes | List loads, ping works (use 10.0.2.2) |
| Android Emulator | No | Error state with retry |

### Project Structure Notes

**New Files to Create:**

```
apps/mobile/
├── app/
│   └── index.tsx        # UPDATE - add HealthCheckList and Ping button
├── src/
│   ├── components/
│   │   ├── HealthCheckList.tsx     # NEW
│   │   ├── HealthCheckList.spec.tsx # NEW
│   │   └── HealthCheckItem.tsx     # NEW
│   └── hooks/
│       ├── useHealthChecks.ts      # NEW
│       └── useHealthChecks.spec.ts # NEW
```

**Dependencies (already available):**
- `react-native` - FlatList, View, Text, Pressable, RefreshControl
- `@nx-monorepo/api-client` - Type definitions (configured in story 6.2)
- `@nx-monorepo/schemas` - HealthCheck type
- `@testing-library/react-native` - Component testing (added in post-generation checklist)

### Styling Approach

For walking skeleton, use React Native's built-in StyleSheet:

```typescript
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: 'red',
    fontSize: 16,
  },
  item: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  pingButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    margin: 16,
  },
  pingButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
```

No external UI libraries (NativeBase, Tamagui, etc.) for walking skeleton - keep it simple.

### Prerequisites

- [ ] Story 6.1 complete (mobile app exists at `apps/mobile/`)
- [ ] Story 6.2 complete (`apiClient` configured in `apps/mobile/src/lib/api.ts`)
- [ ] Server running with `/api/health` endpoint working

### References

- [Source: docs/sprint-artifacts/tech-spec-epic-6.md#Story-6.3]
- [Source: docs/sprint-artifacts/epic-6-design-decisions.md]
- [Source: docs/epics.md#Epic-6-Mobile-Walking-Skeleton]
- [Source: docs/architecture.md#Implementation-Patterns]
- [Source: packages/schemas/src/lib/health.schema.ts] - HealthCheck type
- [React Native FlatList](https://reactnative.dev/docs/flatlist)
- [Expo RefreshControl](https://docs.expo.dev/versions/latest/react-native/refreshcontrol/)
- [@testing-library/react-native](https://callstack.github.io/react-native-testing-library/)

## Dev Agent Record

### Context Reference

- `docs/sprint-artifacts/6-3-implement-mobile-health-check-screen.context.xml`

### Agent Model Used

<!-- To be filled during implementation -->

### Debug Log References

<!-- To be populated during implementation -->

### Completion Notes List

<!-- To be populated during implementation -->

### File List

<!-- To be populated during implementation -->

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-12-13 | SM Agent (Rincewind) | Initial draft |
| 2025-12-13 | SM Agent (Rincewind) | Added epics.md citation per validation |
| 2025-12-13 | SM Agent (Rincewind) | Story context generated, status → ready-for-dev |
