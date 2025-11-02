---
Created: 2025-10-21T13:59
Modified: 2025-10-28T20:30
---
# Testing Enhancements (Optional)

## Prerequisites

This guide assumes familiarity with the baseline testing infrastructure documented in [../memories/testing-reference.md](../memories/testing-reference.md):
- Jest configuration patterns
- TypeScript test configuration
- Coverage thresholds
- Co-located test file conventions

## When to Use These Enhancements

**Phase 1 (Current)**: Optional - Core testing works without these patterns.

**Phase 2+ (Recommended)**: Adopt these patterns as feature complexity increases:
- **jest-dom**: When UI components need semantic assertions
- **user-event**: When simulating realistic user interactions
- **MSW**: When testing components that fetch external data

**Start simple. Add complexity only when justified.**

The base Jest configuration provided by Nx is sufficient for most testing needs. Add these enhancements only when:
- You have specific testing requirements they address
- Your team benefits from more expressive test assertions
- You're testing complex UI interactions or API integrations

## Table of Contents

1. [@testing-library/jest-dom](#testinglibraryjest-dom)
2. [setupFilesAfterEnv Configuration](#setupfilesafterenv-configuration)
3. [@testing-library/user-event](#testinglibraryuser-event)
4. [Test ID Best Practices](#test-id-best-practices)
5. [MSW (Mock Service Worker)](#msw-mock-service-worker)
6. [Custom Render with Providers](#custom-render-with-providers)

---

## @testing-library/jest-dom

### What

A library that provides custom Jest matchers for asserting on DOM node states, making test assertions more readable and expressive.

### Why

When you want to:
- Write more semantic and readable test assertions (`toBeVisible()` instead of checking CSS properties manually)
- Test accessibility features like ARIA attributes, roles, and descriptions
- Reduce boilerplate code when testing DOM states (disabled, checked, focused, etc.)

### How

#### Installation

```bash
# Using pnpm (recommended for Nx)
pnpm add --save-dev @testing-library/jest-dom
```

#### Configuration (Per-Project)

1. Create a Jest setup file in your project (e.g., `apps/web/jest.setup.ts`):

```typescript
// apps/web/jest.setup.ts
import '@testing-library/jest-dom';
```

2. Update your project's Jest config (`apps/web/jest.config.ts`):

```typescript
export default {
  displayName: 'web',
  preset: '../../jest.preset.js',
  testEnvironment: 'jsdom',

  // Add this line to include the setup file
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  testMatch: ['<rootDir>/src/**/*.(spec|test).[jt]s?(x)'],
  // ... rest of config
};
```

3. Update TypeScript config to recognize jest-dom types (`apps/web/tsconfig.spec.json`):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./out-tsc/jest",
    "types": ["jest", "node", "@testing-library/jest-dom"]
  },
  "include": [
    "jest.setup.ts",
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/*.test.tsx",
    "src/**/*.spec.tsx"
  ]
}
```

#### Code Examples

```typescript
// apps/web/src/components/Button.spec.tsx
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

describe('Button', () => {
  it('should be disabled when disabled prop is true', () => {
    render(<button disabled>Click me</button>);

    // ✅ With jest-dom - readable and semantic
    expect(screen.getByRole('button')).toBeDisabled();

    // ❌ Without jest-dom - verbose and unclear
    // expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true)
  });

  it('should have correct accessibility attributes', () => {
    render(
      <button aria-label="Close dialog" aria-describedby="close-desc">
        X
      </button>
    );

    expect(screen.getByRole('button')).toHaveAccessibleName('Close dialog');
    expect(screen.getByRole('button')).toHaveAttribute('aria-describedby', 'close-desc');
  });

  it('should be visible when not hidden', () => {
    render(<div>Visible content</div>);

    expect(screen.getByText('Visible content')).toBeVisible();
    expect(screen.getByText('Visible content')).toBeInTheDocument();
  });
});
```

#### Available Matchers (Most Commonly Used)

- `toBeDisabled()` / `toBeEnabled()` - Check disabled state
- `toBeVisible()` - Check if element is visible to user
- `toBeInTheDocument()` - Check if element exists in DOM
- `toHaveTextContent(text)` - Check text content
- `toHaveAttribute(attr, value)` - Check attributes
- `toHaveClass(...classNames)` - Check CSS classes
- `toHaveStyle(css)` - Check inline/computed styles
- `toHaveFocus()` - Check focus state
- `toHaveValue(value)` - Check input values
- `toBeChecked()` - Check checkbox/radio state
- `toHaveAccessibleName(name)` - Check accessibility name
- `toHaveAccessibleDescription(desc)` - Check accessibility description
- `toHaveRole(role)` - Check ARIA role

---

## setupFilesAfterEnv Configuration

### What

A Jest configuration option that runs setup code after the test framework is initialized but before tests execute. This is the recommended place to import global test utilities like jest-dom.

### Why

When you want to:
- Import custom matchers (like jest-dom) globally without importing in every test file
- Configure global test utilities once per project
- Set up test environment configurations (mocks, polyfills, etc.) that apply to all tests

### How

#### Best Practice Structure for Nx Monorepo

```
apps/web/
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   └── page.spec.tsx
│   └── components/
│       ├── Button.tsx
│       └── Button.spec.tsx
├── jest.config.ts       # Project-specific Jest config
├── jest.setup.ts        # Project-specific setup file
└── tsconfig.spec.json   # TypeScript config for tests
```

#### Example Setup File

```typescript
// apps/web/jest.setup.ts

// Import jest-dom matchers globally
import '@testing-library/jest-dom';

// Optional: Configure test environment
// Set up global mocks
global.matchMedia = global.matchMedia || function () {
  return {
    matches: false,
    addListener: jest.fn(),
    removeListener: jest.fn(),
  };
};

// Optional: Configure global test utilities
beforeEach(() => {
  // Reset mocks before each test
  jest.clearAllMocks();
});

// Optional: Add custom matchers or utilities
expect.extend({
  // Add project-specific custom matchers here if needed
});
```

#### Jest Config

```typescript
// apps/web/jest.config.ts
export default {
  displayName: 'web',
  preset: '../../jest.preset.js',
  testEnvironment: 'jsdom',

  // Setup files run AFTER the test framework is installed
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  testMatch: ['<rootDir>/src/**/*.(spec|test).[jt]s?(x)'],
  coverageDirectory: '../../coverage/apps/web',
};
```

#### For Multiple Projects

Each project can have its own setup file:

```
apps/
├── web/
│   ├── jest.config.ts
│   └── jest.setup.ts      # Web-specific setup (React, jest-dom)
└── server/
    ├── jest.config.ts
    └── jest.setup.ts      # Server-specific setup (Node mocks)
```

#### Shared Setup Across Projects (Advanced)

If you have common setup across multiple projects:

```
jest-config/
└── shared-setup.ts        # Shared test utilities

apps/web/jest.setup.ts:
import '../../../jest-config/shared-setup';
import '@testing-library/jest-dom';
```

---

## @testing-library/user-event

### What

A companion library to React Testing Library that simulates user interactions more realistically than `fireEvent`. It triggers the same events that would occur if a real user interacted with the UI.

### Why

When you want to:
- Test user interactions more realistically (e.g., typing triggers keydown, keypress, keyup, input, and change events)
- Test complex interactions like typing, clicking, selecting text, or keyboard navigation
- Ensure accessibility by testing keyboard interactions (Tab, Enter, Escape)

### How

#### Installation

```bash
pnpm add --save-dev @testing-library/user-event
```

#### Usage Examples

```typescript
// apps/web/src/components/LoginForm.spec.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

describe('LoginForm', () => {
  it('should handle user typing and form submission', async () => {
    // Create a user event instance
    const user = userEvent.setup();

    render(<LoginForm />);

    const usernameInput = screen.getByLabelText(/username/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /submit/i });

    // ✅ user-event - realistic typing with all events
    await user.type(usernameInput, 'john.doe');
    await user.type(passwordInput, 'secret123');

    // ❌ fireEvent - only triggers change event
    // fireEvent.change(usernameInput, { target: { value: 'john.doe' } })

    expect(usernameInput).toHaveValue('john.doe');
    expect(passwordInput).toHaveValue('secret123');

    await user.click(submitButton);

    expect(await screen.findByText(/success/i)).toBeInTheDocument();
  });

  it('should handle keyboard navigation', async () => {
    const user = userEvent.setup();

    render(<LoginForm />);

    const usernameInput = screen.getByLabelText(/username/i);

    // Tab to next field
    await user.tab();
    expect(usernameInput).toHaveFocus();

    await user.type(usernameInput, 'test');

    // Tab to password field
    await user.tab();
    expect(screen.getByLabelText(/password/i)).toHaveFocus();

    // Press Enter to submit
    await user.keyboard('{Enter}');
  });

  it('should handle checkbox interactions', async () => {
    const user = userEvent.setup();

    render(<TermsCheckbox />);

    const checkbox = screen.getByRole('checkbox', { name: /agree to terms/i });

    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });
});
```

#### Common user-event APIs

```typescript
const user = userEvent.setup();

// Click interactions
await user.click(element);
await user.dblClick(element);
await user.tripleClick(element);

// Keyboard interactions
await user.type(element, 'text to type');
await user.keyboard('{Shift}{Enter}');
await user.tab(); // Tab forward
await user.tab({ shift: true }); // Shift+Tab backward

// Selection
await user.selectOptions(selectElement, ['option1', 'option2']);
await user.deselectOptions(selectElement, ['option1']);

// Pointer interactions
await user.hover(element);
await user.unhover(element);

// File upload
await user.upload(fileInput, file);

// Clear input
await user.clear(element);
```

---

## Test ID Best Practices

### What

A systematic approach to naming `data-testid` attributes using namespaced, hierarchical conventions that improve test maintainability and reduce selector brittleness.

### Why

When you want to:
- Make test selectors more maintainable and less likely to break
- Provide context about where an element exists in the component hierarchy
- Avoid test ID collisions in large applications
- Make tests self-documenting through descriptive IDs

### How

#### Naming Convention

```
Format: {feature}.{component}.{element}-{identifier}

Examples:
- "auth.login.button-submit"
- "product.list.item-123"
- "checkout.cart.total"
```

#### Helper Function

Create a reusable helper (e.g., in `packages/ui/src/test-utils.ts`):

```typescript
// packages/ui/src/test-utils.ts

/**
 * Generate test ID attributes conditionally based on environment
 * Omits data-testid in production builds for cleaner HTML
 */
export const testId = (id: string) => {
  return process.env.NODE_ENV !== 'production'
    ? { 'data-testid': id }
    : {};
};

// Usage in components:
export function LoginButton() {
  return (
    <button {...testId('auth.login.button-submit')}>
      Login
    </button>
  );
}
```

#### Component Example

```typescript
// apps/web/src/components/ProductList.tsx
import { testId } from '@nx-monorepo/ui/test-utils';

interface Product {
  id: string;
  name: string;
  price: number;
}

export function ProductList({ products }: { products: Product[] }) {
  return (
    <div {...testId('product.list.container')}>
      <h2 {...testId('product.list.heading')}>Products</h2>
      <ul>
        {products.map((product) => (
          <li key={product.id} {...testId(`product.list.item-${product.id}`)}>
            <span {...testId(`product.list.name-${product.id}`)}>
              {product.name}
            </span>
            <span {...testId(`product.list.price-${product.id}`)}>
              ${product.price}
            </span>
            <button {...testId(`product.list.add-${product.id}`)}>
              Add to Cart
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

#### Test Example

```typescript
// apps/web/src/components/ProductList.spec.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductList } from './ProductList';

describe('ProductList', () => {
  const mockProducts = [
    { id: '1', name: 'Widget', price: 9.99 },
    { id: '2', name: 'Gadget', price: 19.99 },
  ];

  it('should render product list with namespaced test IDs', () => {
    render(<ProductList products={mockProducts} />);

    expect(screen.getByTestId('product.list.container')).toBeInTheDocument();
    expect(screen.getByTestId('product.list.heading')).toHaveTextContent('Products');

    // Access specific product
    expect(screen.getByTestId('product.list.item-1')).toBeInTheDocument();
    expect(screen.getByTestId('product.list.name-1')).toHaveTextContent('Widget');
    expect(screen.getByTestId('product.list.price-1')).toHaveTextContent('$9.99');
  });

  it('should handle add to cart for specific product', async () => {
    const user = userEvent.setup();
    const onAddToCart = jest.fn();

    render(<ProductList products={mockProducts} onAddToCart={onAddToCart} />);

    // Click specific product's add button
    await user.click(screen.getByTestId('product.list.add-1'));

    expect(onAddToCart).toHaveBeenCalledWith('1');
  });
});
```

#### Best Practices

```typescript
// ✅ GOOD - Namespaced, descriptive, stable
<button {...testId('checkout.payment.button-submit')}>Pay Now</button>
<input {...testId('auth.signup.input-email')} />
<div {...testId(`order.item-${order.id}`)}>...</div>

// ❌ BAD - Generic, collision-prone
<button data-testid="button">Pay Now</button>
<button data-testid="submit">Submit</button>

// ❌ BAD - Random/dynamic IDs (breaks tests)
<button data-testid={`button-${Math.random()}`}>Click</button>

// ⚠️ PREFER ACCESSIBLE QUERIES when possible
// Use testId only when semantic queries aren't sufficient
screen.getByRole('button', { name: /submit/i }); // ✅ Best
screen.getByLabelText(/email/i); // ✅ Better
screen.getByTestId('auth.login.button-submit'); // ✅ Good fallback
```

---

## MSW (Mock Service Worker)

### What

A library that intercepts network requests at the service worker level (browser) or http/https modules (Node), enabling realistic API mocking without modifying application code.

**Version**: MSW 2.0+ (breaking changes from v1.x - see notes below)

### Why

When you want to:
- Test components that make API calls without hitting real endpoints
- Create deterministic tests that don't depend on external services
- Simulate error states, loading states, and edge cases easily
- Share API mocks between tests, Storybook, and development

### How

#### Installation

```bash
pnpm add --save-dev msw
```

#### MSW 2.0 Migration Notes

**If you see old examples online (MSW v1.x), here are the key breaking changes:**

| MSW v1.x (OLD ❌) | MSW 2.0 (NEW ✅) |
|-------------------|------------------|
| `import { rest } from 'msw'` | `import { http } from 'msw'` |
| `rest.get(url, (req, res, ctx) => ...)` | `http.get(url, ({ request }) => ...)` |
| `res(ctx.json(data))` | `HttpResponse.json(data)` |
| `res(ctx.status(404), ctx.json(data))` | `HttpResponse.json(data, { status: 404 })` |
| `req.body` | `await request.json()` |
| `ctx.set('Header', 'value')` | `HttpResponse.json(data, { headers: { 'Header': 'value' } })` |

**All examples below use MSW 2.0 syntax.**

#### Setup for Node (Jest) Environment

```typescript
// apps/web/src/test-utils/msw-server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Create server instance with default handlers
export const server = setupServer(...handlers);
```

#### Define Handlers

```typescript
// apps/web/src/test-utils/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  // GET request handler
  http.get('/api/products', () => {
    return HttpResponse.json([
      { id: '1', name: 'Product 1', price: 10 },
      { id: '2', name: 'Product 2', price: 20 },
    ]);
  }),

  // POST request handler
  http.post('/api/login', async ({ request }) => {
    const { username, password } = await request.json();

    if (username === 'admin' && password === 'password') {
      return HttpResponse.json({
        token: 'fake_token_123',
        user: { id: '1', username: 'admin' }
      });
    }

    return HttpResponse.json(
      { message: 'Invalid credentials' },
      { status: 401 }
    );
  }),
];
```

#### Configure in Jest Setup

```typescript
// apps/web/jest.setup.ts
import '@testing-library/jest-dom';
import { server } from './src/test-utils/msw-server';

// Start server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));

// Reset handlers after each test
afterEach(() => server.resetHandlers());

// Clean up after all tests
afterAll(() => server.close());
```

#### Usage in Tests

```typescript
// apps/web/src/components/ProductList.spec.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { server } from '../test-utils/msw-server';
import { http, HttpResponse } from 'msw';
import { ProductList } from './ProductList';

describe('ProductList', () => {
  it('should fetch and display products', async () => {
    render(<ProductList />);

    // Wait for products to load
    await waitFor(() => {
      expect(screen.getByText('Product 1')).toBeInTheDocument();
    });

    expect(screen.getByText('Product 2')).toBeInTheDocument();
  });

  it('should handle API errors gracefully', async () => {
    // Override default handler for this test only
    server.use(
      http.get('/api/products', () => {
        return HttpResponse.json(
          { message: 'Server error' },
          { status: 500 }
        );
      })
    );

    render(<ProductList />);

    await waitFor(() => {
      expect(screen.getByText(/error loading products/i)).toBeInTheDocument();
    });
  });

  it('should handle empty product list', async () => {
    server.use(
      http.get('/api/products', () => {
        return HttpResponse.json([]);
      })
    );

    render(<ProductList />);

    await waitFor(() => {
      expect(screen.getByText(/no products found/i)).toBeInTheDocument();
    });
  });
});
```

---

## Custom Render with Providers

### What

A wrapper around React Testing Library's `render` that automatically wraps components with common providers (Router, Theme, Store, etc.), reducing test boilerplate.

### Why

When you want to:
- Avoid repeating provider setup in every test
- Ensure consistent test environment across all component tests
- Simplify testing of components that depend on context providers
- Make tests more maintainable when provider configuration changes

### How

#### Create Custom Render Utility

```typescript
// apps/web/src/test-utils/custom-render.tsx
import { render, RenderOptions } from '@testing-library/react';
import { ReactElement, ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Define custom render options
interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialRoute?: string;
  theme?: 'light' | 'dark';
}

// Create a custom render function
export function renderWithProviders(
  ui: ReactElement,
  {
    initialRoute = '/',
    theme = 'light',
    ...renderOptions
  }: CustomRenderOptions = {}
) {
  // Create a fresh QueryClient for each test
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Disable retries in tests
      },
    },
  });

  // Define the providers wrapper
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ThemeProvider theme={{ mode: theme }}>
            {children}
          </ThemeProvider>
        </BrowserRouter>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient, // Return queryClient for advanced testing
  };
}

// Re-export everything from React Testing Library
export * from '@testing-library/react';

// Override the default render
export { renderWithProviders as render };
```

#### Usage in Tests

```typescript
// apps/web/src/components/Dashboard.spec.tsx
import { screen, waitFor } from '@testing-library/react';
import { render } from '../test-utils/custom-render'; // Import custom render
import userEvent from '@testing-library/user-event';
import { Dashboard } from './Dashboard';

describe('Dashboard', () => {
  it('should render with all providers', async () => {
    // No need to wrap with providers manually!
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
    });
  });

  it('should render with dark theme', () => {
    render(<Dashboard />, { theme: 'dark' });

    const container = screen.getByTestId('dashboard-container');
    expect(container).toHaveStyle({ backgroundColor: '#000' });
  });

  it('should handle navigation', async () => {
    const user = userEvent.setup();

    render(<Dashboard />, { initialRoute: '/settings' });

    expect(screen.getByText(/settings/i)).toBeInTheDocument();
  });
});
```

#### Advanced: Testing with React Query

```typescript
// apps/web/src/components/UserProfile.spec.tsx
import { screen, waitFor } from '@testing-library/react';
import { render } from '../test-utils/custom-render';
import { server } from '../test-utils/msw-server';
import { http, HttpResponse } from 'msw';
import { UserProfile } from './UserProfile';

describe('UserProfile', () => {
  it('should fetch and display user data', async () => {
    server.use(
      http.get('/api/user', () => {
        return HttpResponse.json({
          id: '1',
          name: 'John Doe',
          email: 'john@example.com'
        });
      })
    );

    const { queryClient } = render(<UserProfile userId="1" />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Can inspect query cache if needed
    const userData = queryClient.getQueryData(['user', '1']);
    expect(userData).toEqual({
      id: '1',
      name: 'John Doe',
      email: 'john@example.com'
    });
  });
});
```

---

## Summary

These enhancements transform your testing infrastructure from basic to production-grade:

1. **@testing-library/jest-dom** - Essential for readable, semantic assertions
2. **setupFilesAfterEnv** - Best practice for global test configuration
3. **@testing-library/user-event** - Realistic user interaction testing
4. **Test ID conventions** - Maintainable selectors with namespacing
5. **MSW** - Professional API mocking without test coupling
6. **Custom render** - DRY principle for provider-dependent components

All of these are optional but highly recommended for a "gold standard" template. They represent 2025 industry best practices for testing React/Next.js applications in monorepo environments.

**Remember**: Start simple. Add these enhancements incrementally as your testing needs grow.
