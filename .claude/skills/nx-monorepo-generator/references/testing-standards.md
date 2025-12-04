# Testing Standards

## Package Requirements by Type

| Package Type | jest-dom | user-event | MSW |
|-------------|----------|------------|-----|
| **UI** (web, mobile) | ✅ Required | ✅ Required | ✅ Required |
| **Node** (server, APIs) | ✅ Required | ❌ N/A | ⚠️ Conditional |
| **Logic** (schemas, utils) | ❌ N/A | ❌ N/A | ❌ N/A |

## Jest Setup for UI Projects

**jest.setup.ts**:
```typescript
import '@testing-library/jest-dom';
```

**jest.config.ts**:
```typescript
export default {
  // ... other config
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};
```

## Testing Patterns

### Interactions - Use user-event, NEVER fireEvent
```typescript
// ✅ Correct
await userEvent.click(screen.getByRole('button'));

// ❌ Wrong
fireEvent.click(screen.getByRole('button'));
```

### Assertions - Use jest-dom matchers
```typescript
// ✅ Correct
expect(element).toBeInTheDocument();
expect(button).toBeDisabled();

// ❌ Wrong
expect(element).toBeTruthy();
expect(button.disabled).toBe(true);
```

### API Mocking - Use MSW, no fetch/axios mocks
```typescript
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  http.get('/api/users', () => HttpResponse.json([]))
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Queries - Prefer semantic over testId
```typescript
// ✅ Correct (semantic query)
screen.getByRole('button', { name: /submit/i });

// ⚠️ Only when semantic query impossible
screen.getByTestId('custom-widget');
```

### Async - Always await user-event, use findBy* for async elements
```typescript
// ✅ Correct
await userEvent.click(button);
const result = await screen.findByText(/success/i);

// ❌ Wrong
userEvent.click(button);  // Missing await
screen.getByText(/success/i);  // Should be findBy
```

**Last Validated**: 2025-10-28 (RTL 15.0.0, user-event 14.5.0, jest-dom 6.6.3, MSW 2.0.0)
