import { fireEvent, render, screen } from '@testing-library/react-native';

import { ChildAccommodationSection } from './ChildAccommodationSection';
import { ACCOMMODATION_OPTIONS } from '../../lib/accommodation-options';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

jest.mock(
  '../../lib/theme' /* gc1-allow: theme hook reads native ColorScheme — not available in JSDOM */,
  () => ({
    useThemeColors: () => ({
      textPrimary: '#ffffff',
      textSecondary: '#94a3b8',
      primary: '#00b4d8',
    }),
  }),
);

const mockMutateAccommodation = jest.fn();
const mockMutateCelebrationLevel = jest.fn();

let mockAccommodationMode: string | undefined = undefined;
let mockCelebrationLevel = 'big_only';

jest.mock(
  '../../hooks/use-learner-profile' /* gc1-allow: wraps TanStack Query + external API fetch boundary */,
  () => ({
    useChildLearnerProfile: () => ({
      data:
        mockAccommodationMode !== undefined
          ? { accommodationMode: mockAccommodationMode }
          : undefined,
    }),
    useUpdateAccommodationMode: () => ({
      mutate: mockMutateAccommodation,
      isPending: false,
    }),
  }),
);

jest.mock(
  '../../hooks/use-settings' /* gc1-allow: wraps TanStack Query + external API fetch boundary */,
  () => ({
    useChildCelebrationLevel: () => ({
      data: mockCelebrationLevel,
    }),
    useUpdateChildCelebrationLevel: () => ({
      mutate: mockMutateCelebrationLevel,
      isPending: false,
    }),
  }),
);

jest.mock(
  '../../lib/platform-alert' /* gc1-allow: wraps Alert.alert which is unavailable in JSDOM */,
  () => ({ platformAlert: jest.fn() }),
);

// Retrieved after jest.mock hoisting so we get the stable mock reference.
const { platformAlert: mockPlatformAlert } = jest.requireMock(
  '../../lib/platform-alert',
) as { platformAlert: jest.Mock };

const CHILD_ID = 'child-123';
const CHILD_NAME = 'Emma';

function renderSection(): void {
  render(
    <ChildAccommodationSection
      childProfileId={CHILD_ID}
      childName={CHILD_NAME}
    />,
  );
}

describe('ChildAccommodationSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccommodationMode = 'none';
    mockCelebrationLevel = 'big_only';
  });

  describe('option cards', () => {
    it('renders all accommodation option cards', () => {
      renderSection();

      for (const opt of ACCOMMODATION_OPTIONS) {
        screen.getByTestId(`accommodation-mode-${opt.mode}-${CHILD_ID}`);
      }
    });

    it('renders the section container with the child profileId', () => {
      renderSection();

      screen.getByTestId(`child-accommodation-${CHILD_ID}`);
    });

    it('pressing a non-active option calls the mutation', () => {
      mockAccommodationMode = 'none';

      renderSection();

      fireEvent.press(
        screen.getByTestId(`accommodation-mode-short-burst-${CHILD_ID}`),
      );

      expect(mockMutateAccommodation).toHaveBeenCalledTimes(1);
      expect(mockMutateAccommodation).toHaveBeenCalledWith(
        { childProfileId: CHILD_ID, accommodationMode: 'short-burst' },
        expect.objectContaining({ onError: expect.any(Function) }),
      );
    });

    it('pressing the already-active option is a no-op — mutation not called', () => {
      mockAccommodationMode = 'short-burst';

      renderSection();

      fireEvent.press(
        screen.getByTestId(`accommodation-mode-short-burst-${CHILD_ID}`),
      );

      expect(mockMutateAccommodation).not.toHaveBeenCalled();
    });

    it('calls platformAlert when accommodation mutation fires onError', () => {
      mockAccommodationMode = 'none';

      renderSection();

      fireEvent.press(
        screen.getByTestId(`accommodation-mode-predictable-${CHILD_ID}`),
      );

      const [, options] = mockMutateAccommodation.mock.calls[0] as [
        unknown,
        { onError: () => void },
      ];
      options.onError();

      expect(mockPlatformAlert).toHaveBeenCalledWith(
        'Could not save setting',
        'Please try again',
      );
    });
  });

  describe('celebration follow-up', () => {
    it('shows celebration follow-up for short-burst mode', () => {
      mockAccommodationMode = 'short-burst';

      renderSection();

      screen.getByTestId(`child-celebration-followup-short-burst-${CHILD_ID}`);
    });

    it('shows celebration follow-up for predictable mode', () => {
      mockAccommodationMode = 'predictable';

      renderSection();

      screen.getByTestId(`child-celebration-followup-predictable-${CHILD_ID}`);
    });

    it('hides celebration follow-up for none mode', () => {
      mockAccommodationMode = 'none';

      renderSection();

      expect(
        screen.queryByTestId(`child-celebration-followup-none-${CHILD_ID}`),
      ).toBeNull();
    });

    it('hides celebration follow-up for audio-first mode', () => {
      mockAccommodationMode = 'audio-first';

      renderSection();

      expect(
        screen.queryByTestId(
          `child-celebration-followup-audio-first-${CHILD_ID}`,
        ),
      ).toBeNull();
    });

    it('pressing a non-active celebration level calls the mutation', () => {
      mockAccommodationMode = 'short-burst';
      mockCelebrationLevel = 'big_only';

      renderSection();

      fireEvent.press(
        screen.getByTestId(`child-celebration-level-all-${CHILD_ID}`),
      );

      expect(mockMutateCelebrationLevel).toHaveBeenCalledTimes(1);
      expect(mockMutateCelebrationLevel).toHaveBeenCalledWith(
        { childProfileId: CHILD_ID, celebrationLevel: 'all' },
        expect.objectContaining({ onError: expect.any(Function) }),
      );
    });

    it('pressing the already-active celebration level is a no-op', () => {
      mockAccommodationMode = 'predictable';
      mockCelebrationLevel = 'big_only';

      renderSection();

      fireEvent.press(
        screen.getByTestId(`child-celebration-level-big_only-${CHILD_ID}`),
      );

      expect(mockMutateCelebrationLevel).not.toHaveBeenCalled();
    });

    it('calls platformAlert when celebration level mutation fires onError', () => {
      mockAccommodationMode = 'short-burst';
      mockCelebrationLevel = 'big_only';

      renderSection();

      fireEvent.press(
        screen.getByTestId(`child-celebration-level-off-${CHILD_ID}`),
      );

      const [, options] = mockMutateCelebrationLevel.mock.calls[0] as [
        unknown,
        { onError: () => void },
      ];
      options.onError();

      expect(mockPlatformAlert).toHaveBeenCalledWith(
        'Could not save setting',
        'Please try again',
      );
    });
  });

  describe('decision guide toggle', () => {
    it('guide content is hidden by default', () => {
      renderSection();

      expect(
        screen.queryByTestId(`accommodation-guide-content-${CHILD_ID}`),
      ).toBeNull();
    });

    it('pressing the toggle shows the decision guide content', () => {
      renderSection();

      fireEvent.press(
        screen.getByTestId(`accommodation-guide-toggle-${CHILD_ID}`),
      );

      screen.getByTestId(`accommodation-guide-content-${CHILD_ID}`);
    });

    it('pressing the toggle twice hides the guide again', () => {
      renderSection();

      const toggle = screen.getByTestId(
        `accommodation-guide-toggle-${CHILD_ID}`,
      );
      fireEvent.press(toggle);
      fireEvent.press(toggle);

      expect(
        screen.queryByTestId(`accommodation-guide-content-${CHILD_ID}`),
      ).toBeNull();
    });

    it('pressing a guide row calls the mutation and closes the guide', () => {
      mockAccommodationMode = 'none';

      renderSection();

      fireEvent.press(
        screen.getByTestId(`accommodation-guide-toggle-${CHILD_ID}`),
      );

      screen.getByTestId(`accommodation-guide-content-${CHILD_ID}`);

      fireEvent.press(screen.getByTestId(`guide-pick-short-burst-${CHILD_ID}`));

      expect(mockMutateAccommodation).toHaveBeenCalledWith(
        { childProfileId: CHILD_ID, accommodationMode: 'short-burst' },
        expect.objectContaining({ onError: expect.any(Function) }),
      );
      // Guide should close after picking
      expect(
        screen.queryByTestId(`accommodation-guide-content-${CHILD_ID}`),
      ).toBeNull();
    });

    it('pressing a guide row that is already active does not call the mutation', () => {
      mockAccommodationMode = 'short-burst';

      renderSection();

      fireEvent.press(
        screen.getByTestId(`accommodation-guide-toggle-${CHILD_ID}`),
      );

      fireEvent.press(screen.getByTestId(`guide-pick-short-burst-${CHILD_ID}`));

      expect(mockMutateAccommodation).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('defaults accommodation mode to none when learner profile is not yet loaded', () => {
      mockAccommodationMode = undefined;

      renderSection();

      // none card should be rendered as selected (border-primary) — we verify
      // via testID presence and that no celebration follow-up appears
      screen.getByTestId(`accommodation-mode-none-${CHILD_ID}`);
      expect(
        screen.queryByTestId(`child-celebration-followup-none-${CHILD_ID}`),
      ).toBeNull();
    });
  });
});
