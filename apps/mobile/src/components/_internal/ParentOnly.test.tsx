import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ParentOnly } from './ParentOnly';

const mockReplace = jest.fn();
const mockUseRole = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock(
  '../../hooks/use-active-profile-role' /* gc1-allow: ParentOnly tests role-based branching; hook is the unit boundary */,
  () => ({ useActiveProfileRole: () => mockUseRole() }),
);

describe('ParentOnly', () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockUseRole.mockReset();
  });

  it('renders children for owner', () => {
    mockUseRole.mockReturnValue('owner');
    const { getByText } = render(
      <ParentOnly>
        <Text>Inner</Text>
      </ParentOnly>,
    );

    expect(getByText('Inner'));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects child role to home', () => {
    mockUseRole.mockReturnValue('child');
    const { getByTestId } = render(
      <ParentOnly>
        <Text>Inner</Text>
      </ParentOnly>,
    );

    getByTestId('parent-only-redirect');
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('redirects impersonated-child role to home', () => {
    mockUseRole.mockReturnValue('impersonated-child');
    const { getByTestId } = render(
      <ParentOnly>
        <Text>Inner</Text>
      </ParentOnly>,
    );

    getByTestId('parent-only-redirect');
    expect(mockReplace).toHaveBeenCalledWith('/(app)/home');
  });

  it('renders a visible fallback while role is loading', () => {
    mockUseRole.mockReturnValue(null);
    const { getByTestId, queryByText } = render(
      <ParentOnly>
        <Text>Inner</Text>
      </ParentOnly>,
    );

    getByTestId('parent-only-loading');
    expect(queryByText('Inner')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
