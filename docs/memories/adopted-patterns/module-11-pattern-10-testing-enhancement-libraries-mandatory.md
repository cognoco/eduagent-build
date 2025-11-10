## Pattern 10: Testing Enhancement Libraries (Mandatory)

**Our Standard**: UI packages MUST use jest-dom, user-event, and MSW for consistent, high-quality testing patterns

### Pattern

**Package Requirements by Type:**

| Package Type | jest-dom | user-event | MSW | Rationale |
|-------------|----------|------------|-----|-----------|
| **UI (web, future mobile)** | ✅ Required | ✅ Required | ✅ Required | Full testing stack for React components |
| **Node (server, APIs)** | ✅ Required | ❌ N/A | ⚠️ Conditional | Consistent assertions; MSW only if testing HTTP endpoints |
| **Pure Logic (schemas, utils)** | ❌ N/A | ❌ N/A | ❌ N/A | Basic Jest sufficient for logic tests |

**Installation (UI packages):**
```bash
pnpm add --save-dev @testing-library/jest-dom @testing-library/user-event msw
```

**Setup Files After Env (`apps/web/jest.config.ts`):**
```typescript
export default {
  // ... other config
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};
```

**Jest Setup File (`apps/web/jest.setup.ts`):**
```typescript
import '@testing-library/jest-dom';
```

**Testing Standards:**

1. **Interactions**: Use `user-event` for ALL user interactions (clicks, typing, keyboard). NEVER use `fireEvent` directly.
   ```typescript
   // ✅ Correct
   await userEvent.click(screen.getByRole('button'));

   // ❌ Wrong
   fireEvent.click(screen.getByRole('button'));
   ```

2. **Assertions**: Use jest-dom matchers for semantic assertions
   ```typescript
   // ✅ Correct
   expect(element).toBeInTheDocument();
   expect(button).toBeDisabled();

   // ❌ Wrong
   expect(element).toBeTruthy();
   expect(button.disabled).toBe(true);
   ```

3. **API Mocking**: Use MSW 2.0 for ALL API mocking in component tests. No fetch mocks, no axios mocks.
   ```typescript
   // ✅ Correct (MSW 2.0 syntax)
   import { http, HttpResponse } from 'msw';  // Note: 'http' not 'rest', 'HttpResponse' not 'res'+'ctx'
   import { setupServer } from 'msw/node';

   // Define handlers
   const handlers = [
     http.get('/api/users', () => {
       return HttpResponse.json([  // HttpResponse.json() not res(ctx.json())
         { id: '1', name: 'Alice' },
         { id: '2', name: 'Bob' }
       ]);
     }),
     http.post('/api/users', async ({ request }) => {
       const body = await request.json();
       return HttpResponse.json(body, { status: 201 });  // Status in options
     }),
     // Error responses
     http.get('/api/error', () => {
       return HttpResponse.json(
         { error: 'Not found' },
         { status: 404 }
       );
     })
   ];

   // Create server
   const server = setupServer(...handlers);

   // Jest lifecycle hooks
   beforeAll(() => server.listen());
   afterEach(() => server.resetHandlers());
   afterAll(() => server.close());
   ```

   **MSW 2.0 Breaking Changes** (migrated from v1.x in 2024):
   - ❌ OLD: `import { rest } from 'msw'` → ✅ NEW: `import { http } from 'msw'`
   - ❌ OLD: `rest.get(url, (req, res, ctx) => res(ctx.json(data)))` → ✅ NEW: `http.get(url, () => HttpResponse.json(data))`
   - ❌ OLD: `res(ctx.status(404), ctx.json({...}))` → ✅ NEW: `HttpResponse.json({...}, { status: 404 })`
   - Handler signature: `({ request, params, cookies })` not `(req, res, ctx)`
   - Request body: `await request.json()` not `req.body`
   - No more `ctx.set()`, `ctx.delay()` - use HttpResponse options

4. **Test IDs**: Use `data-testid` ONLY when semantic queries fail. Prefer `getByRole`, `getByLabelText`, `getByText`.
   ```typescript
   // ✅ Correct (semantic query)
   screen.getByRole('button', { name: /submit/i });

   // ⚠️ Use only when semantic query impossible
   screen.getByTestId('custom-widget');
   ```

5. **Async Operations**: Always use `await` with user-event. Always use `findBy*` for elements appearing after async operations.
   ```typescript
   // ✅ Correct
   await userEvent.click(button);
   const result = await screen.findByText(/success/i);

   // ❌ Wrong
   userEvent.click(button); // Missing await
   const result = screen.getByText(/success/i); // Should be findBy for async
   ```

### Applies To

- **Mandatory**: All UI packages (web, future mobile apps)
- **Conditional**: Node packages with HTTP endpoint testing (server APIs)
- **Not Applicable**: Pure logic packages (schemas, utilities)

### Rationale

**Why mandatory for AI-driven development:**
- ✅ **Reduces AI decision overhead**: Eliminates "which testing approach?" questions on every test
- ✅ **Consistent test generation**: AI agents follow explicit patterns instead of making choices
- ✅ **Industry standard alignment**: React Testing Library official recommendations (2025)
- ✅ **Better test quality**: Semantic assertions, real user interactions, actual API contracts
- ✅ **Monorepo consistency**: All UI packages use identical testing patterns

**Why these specific libraries:**
- **jest-dom**: Semantic matchers provide better error messages for non-technical reviewers
- **user-event**: Simulates real browser interactions (click propagation, focus management)
- **MSW**: Tests actual HTTP contracts, not implementation details (fetch/axios internals)

**Why package-type conditionals:**
- **UI packages**: Need full stack (DOM assertions, user interactions, API mocking)
- **Node packages**: Need consistent assertions (jest-dom) but not browser interactions
- **Logic packages**: Complex patterns would be overkill for pure function tests

**Research validation:**
- All patterns verified as 2025 React best practices (Context7 MCP)
- Used in official React Testing Library examples
- Next.js official testing guide includes these by default
- AI agent testing standardization (AGENTS.md research, 2025)

### When Adding New Projects

**UI Packages (web, mobile):**

1. Install testing enhancements:
   ```bash
   pnpm add --save-dev @testing-library/jest-dom @testing-library/user-event msw
   ```

2. Create `jest.setup.ts`:
   ```typescript
   import '@testing-library/jest-dom';
   ```

3. Update `jest.config.ts`:
   ```typescript
   export default {
     // ... existing config
     setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
   };
   ```

4. Verify setup:
   ```bash
   pnpm exec nx run <project>:test
   ```

**Node Packages (conditional MSW):**

Only install MSW if package tests HTTP endpoints:
```bash
pnpm add --save-dev @testing-library/jest-dom msw
```

**Logic Packages:**

No testing enhancements needed - use basic Jest.

### Implementation Reference

For detailed setup instructions, API documentation, and examples:
- **Setup guide**: `docs/guides/testing-enhancements.md`
- **Baseline config**: `docs/memories/testing-reference.md`
- **Post-generation**: `docs/memories/post-generation-checklist.md`

### Last Validated

2025-10-28 (React Testing Library 15.0.0, user-event 14.5.0, jest-dom 6.6.3, MSW 2.0.0)

**References**:
- React Testing Library documentation (official patterns)
- Next.js testing guide (includes these by default)
- Testing patterns research (2025-10-28 Context7/Exa validation)
- AI-driven development best practices (AGENTS.md standard)

---
