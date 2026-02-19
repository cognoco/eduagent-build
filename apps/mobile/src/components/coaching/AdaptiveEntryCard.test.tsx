import { render, screen, fireEvent } from '@testing-library/react-native';
import { AdaptiveEntryCard } from './AdaptiveEntryCard';

describe('AdaptiveEntryCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders headline and primary action', () => {
    const onPress = jest.fn();
    render(
      <AdaptiveEntryCard
        headline="Ready for homework?"
        actions={[{ label: 'Camera', onPress }]}
      />
    );

    expect(screen.getByText('Ready for homework?')).toBeTruthy();
    expect(screen.getByText('Camera')).toBeTruthy();
  });

  it('renders subtext when provided', () => {
    render(
      <AdaptiveEntryCard
        headline="Hey there"
        subtext="2 things are fading"
        actions={[{ label: 'Sure', onPress: jest.fn() }]}
      />
    );

    expect(screen.getByText('2 things are fading')).toBeTruthy();
  });

  it('renders first action as primary button', () => {
    const onPrimary = jest.fn();
    render(
      <AdaptiveEntryCard
        headline="Test"
        actions={[{ label: 'Primary', onPress: onPrimary }]}
      />
    );

    fireEvent.press(screen.getByTestId('adaptive-entry-card-primary'));
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('renders secondary actions below primary', () => {
    const onSecond = jest.fn();
    const onThird = jest.fn();
    render(
      <AdaptiveEntryCard
        headline="What do you need?"
        actions={[
          { label: 'Homework', onPress: jest.fn() },
          { label: 'Practice', onPress: onSecond },
          { label: 'Just ask', onPress: onThird },
        ]}
      />
    );

    expect(screen.getByText('Practice')).toBeTruthy();
    expect(screen.getByText('Just ask')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Practice'));
    expect(onSecond).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('Just ask'));
    expect(onThird).toHaveBeenCalledTimes(1);
  });

  it('returns null when actions array is empty', () => {
    const { toJSON } = render(
      <AdaptiveEntryCard headline="Test" actions={[]} />
    );

    expect(toJSON()).toBeNull();
  });

  it('renders skeleton when loading', () => {
    render(
      <AdaptiveEntryCard
        headline="Test"
        actions={[{ label: 'Go', onPress: jest.fn() }]}
        isLoading
      />
    );

    expect(screen.getByTestId('coaching-card-skeleton')).toBeTruthy();
    expect(screen.queryByText('Test')).toBeNull();
  });
});
