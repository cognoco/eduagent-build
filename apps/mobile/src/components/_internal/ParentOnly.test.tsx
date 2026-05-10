import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ParentOnly } from './ParentOnly';

const mockReplace = jest.fn();
const mockUseRole = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('../../hooks/use-active-profile-role', () => ({
  // gc1-allow: ParentOnly's purpose is to test role-based branching; mocking the role hook is the unit boundary.
  useActiveProfileRole: () => mockUseRole(),
}));

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

    expect(getByText('Inner')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('redirects child role to home', () => {
    mockUseRole.mockReturnValue('child');
    render(
      <ParentOnly>
        <Text>Inner</Text>
      </ParentOnly>,
    );

    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('redirects impersonated-child role to home', () => {
    mockUseRole.mockReturnValue('impersonated-child');
    render(
      <ParentOnly>
        <Text>Inner</Text>
      </ParentOnly>,
    );

    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('renders nothing while role is loading', () => {
    mockUseRole.mockReturnValue(null);
    const { queryByText } = render(
      <ParentOnly>
        <Text>Inner</Text>
      </ParentOnly>,
    );

    expect(queryByText('Inner')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
