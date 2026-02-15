export interface MockClerkUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export function createMockClerkUser(
  overrides?: Partial<MockClerkUser>
): MockClerkUser {
  return {
    id: 'user_test_' + Math.random().toString(36).substring(2, 10),
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    ...overrides,
  };
}

/** Mock Clerk JWT payload for API testing. */
export function createMockClerkJWT(user: MockClerkUser) {
  return {
    sub: user.id,
    email: user.email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'https://clerk.test',
    azp: 'test-app',
  };
}
