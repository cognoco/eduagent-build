import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { FamilyOrientationCue } from './FamilyOrientationCue';
import * as SecureStorageModule from '../../lib/secure-storage';

// Real lib/secure-storage (wraps expo-secure-store, globally mocked in
// test-setup.ts). Spy on getItemAsync/setItemAsync so each test can control
// return values including pending-promise scenarios.
const mockGetItem = jest.spyOn(SecureStorageModule, 'getItemAsync');
const mockSetItem = jest.spyOn(SecureStorageModule, 'setItemAsync');

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('FamilyOrientationCue', () => {
  beforeEach(() => {
    mockGetItem.mockReset();
    mockSetItem.mockReset();
  });

  it('renders nothing while the SecureStore lookup is pending', async () => {
    let resolve: (value: string | null) => void = () => undefined;
    mockGetItem.mockReturnValue(
      new Promise<string | null>((r) => {
        resolve = r;
      }),
    );

    render(<FamilyOrientationCue />);

    expect(screen.queryByTestId('family-orientation-cue')).toBeNull();
    await act(async () => {
      resolve(null);
    });
  });

  it('renders the cue when no dismissal flag is stored', async () => {
    mockGetItem.mockResolvedValue(null);

    render(<FamilyOrientationCue />);

    await waitFor(() => {
      expect(screen.getByTestId('family-orientation-cue'));
    });
  });

  it('does not render when the dismissal flag is set', async () => {
    mockGetItem.mockResolvedValue('true');

    render(<FamilyOrientationCue />);

    await waitFor(() => {
      expect(screen.queryByTestId('family-orientation-cue')).toBeNull();
    });
  });

  it('writes the dismissal flag and hides on dismiss tap', async () => {
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);

    render(<FamilyOrientationCue />);

    await screen.findByTestId('family-orientation-cue');
    fireEvent.press(screen.getByTestId('family-orientation-cue-dismiss'));

    await waitFor(() => {
      expect(mockSetItem).toHaveBeenCalledWith(
        'family_orientation_cue_dismissed_v1',
        'true',
      );
      expect(screen.queryByTestId('family-orientation-cue')).toBeNull();
    });
  });
});
