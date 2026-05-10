import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { FamilyOrientationCue } from './FamilyOrientationCue';

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();

jest.mock('../../lib/secure-storage', () => ({
  getItemAsync: (key: string) => mockGetItem(key),
  setItemAsync: (key: string, value: string) => mockSetItem(key, value),
}));

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
      expect(screen.getByTestId('family-orientation-cue')).toBeTruthy();
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
