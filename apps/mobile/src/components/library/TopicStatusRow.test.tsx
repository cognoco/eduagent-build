import { fireEvent, render } from '@testing-library/react-native';
import { TopicStatusRow } from './TopicStatusRow';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    primary: '#0088cc',
    accent: '#d97706',
    success: '#22c55e',
    textSecondary: '#6b7280',
    border: '#e5e7eb',
    surface: '#ffffff',
  }),
}));

describe('TopicStatusRow', () => {
  const onPress = jest.fn();

  beforeEach(() => {
    onPress.mockClear();
  });

  it('renders continue-now and calls onPress', () => {
    const { getByTestId } = render(
      <TopicStatusRow
        state="continue-now"
        title="Linear Equations"
        chapterName="Grand Overview"
        onPress={onPress}
        testID="row-continue"
      />
    );

    fireEvent.press(getByTestId('row-continue'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders a started row with chapter and session count', () => {
    const { getByText } = render(
      <TopicStatusRow
        state="started"
        title="Photosynthesis"
        chapterName="Green Factories"
        sessionCount={3}
        onPress={onPress}
      />
    );

    expect(getByText('Photosynthesis')).toBeTruthy();
    expect(getByText('Green Factories')).toBeTruthy();
    expect(getByText('3 sessions')).toBeTruthy();
  });

  it('renders an up-next row', () => {
    const { getByTestId } = render(
      <TopicStatusRow
        state="up-next"
        title="Cell Division"
        chapterName="Biology Basics"
        onPress={onPress}
        testID="row-up-next"
      />
    );

    expect(getByTestId('row-up-next')).toBeTruthy();
  });

  it('renders the hero up-next variant', () => {
    const { getByTestId } = render(
      <TopicStatusRow
        state="up-next"
        variant="hero"
        title="Cell Division"
        chapterName="Biology Basics"
        onPress={onPress}
        testID="row-up-next-hero"
      />
    );

    expect(getByTestId('row-up-next-hero')).toBeTruthy();
  });

  it('renders a done row with the chapter inline', () => {
    const { getByText } = render(
      <TopicStatusRow
        state="done"
        title="Algebra Basics"
        chapterName="Chapter 1"
        onPress={onPress}
      />
    );

    expect(getByText('Algebra Basics')).toBeTruthy();
    expect(getByText('Chapter 1')).toBeTruthy();
  });

  it('uses singular session copy when sessionCount is 1', () => {
    const { getByText } = render(
      <TopicStatusRow
        state="started"
        title="Topic"
        chapterName="Chapter"
        sessionCount={1}
        onPress={onPress}
      />
    );

    expect(getByText('1 session')).toBeTruthy();
  });
});
