## Unit Tests (Jest)

- Located in `*.spec.ts` files alongside source code
- Test individual functions, classes, and components in isolation
- Target: >= 80% code coverage
- Run fast (< 5 seconds per test suite)

**Example**:
```typescript
// packages/schemas/src/user.schema.spec.ts
import { userSchema } from './user.schema';

describe('userSchema', () => {
  it('should validate correct user data', () => {
    expect(() => userSchema.parse({ id: '123', name: 'Alice' })).not.toThrow();
  });
});
```

---
