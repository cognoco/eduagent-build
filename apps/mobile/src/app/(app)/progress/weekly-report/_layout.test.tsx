import { render } from '@testing-library/react-native';

import WeeklyReportLayout, { unstable_settings } from './_layout';

const mockStack = jest.fn((_props: unknown) => null);

jest.mock('expo-router', () => ({
  Stack: (props: unknown) => mockStack(props),
}));

jest.mock(
  '../../../../lib/theme' /* gc1-allow: isolate layout styling from theme provider */,
  () => ({
    useThemeColors: () => ({ background: '#ffffff' }),
  }),
);

describe('progress/weekly-report/_layout.tsx', () => {
  beforeEach(() => {
    mockStack.mockClear();
  });

  it('exports unstable_settings.initialRouteName = "index"', () => {
    expect(unstable_settings).toEqual({ initialRouteName: 'index' });
  });

  it('sets the stack initial route to index', () => {
    render(<WeeklyReportLayout />);

    expect(mockStack).toHaveBeenCalledWith(
      expect.objectContaining({ initialRouteName: 'index' }),
    );
  });
});
