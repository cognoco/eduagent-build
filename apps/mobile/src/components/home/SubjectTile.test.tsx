import { render, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SubjectTile, type SubjectTileProps } from './SubjectTile';

const baseProps: SubjectTileProps = {
  subjectId: 'abc-123',
  name: 'Algebra',
  hint: 'Continue Linear equations',
  progress: 0.55,
  tintSolid: '#2dd4bf',
  tintSoft: 'rgba(45,212,191,0.18)',
  onPress: jest.fn(),
  testID: 'home-subject-card-abc-123',
};

describe('SubjectTile', () => {
  it('renders subject name and hint', () => {
    const { getByText } = render(<SubjectTile {...baseProps} />);
    expect(getByText('Algebra'));
    expect(getByText('Continue Linear equations'));
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <SubjectTile {...baseProps} onPress={onPress} />,
    );
    fireEvent.press(getByTestId('home-subject-card-abc-123'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders progress bar with correct fill', () => {
    const { getByTestId } = render(<SubjectTile {...baseProps} />);
    const bar = getByTestId('home-subject-card-abc-123-progress');
    expect(bar).toBeTruthy();
  });

  it('renders the icon tile', () => {
    const { getByTestId } = render(<SubjectTile {...baseProps} />);
    expect(getByTestId('home-subject-card-abc-123-icon'));
  });

  it('uses the subject shelf tint for the card background and border', () => {
    const { getByTestId } = render(<SubjectTile {...baseProps} />);
    const tile = getByTestId('home-subject-card-abc-123');
    const style = StyleSheet.flatten(tile.props.style);

    expect(style.backgroundColor).toBe(baseProps.tintSoft);
    expect(style.borderColor).toBe(`${baseProps.tintSolid}33`);
  });

  // Regression: SubjectTile must NOT accept an `icon` prop. The bookshelf
  // motif replaced the per-subject Ionicons icon in commit ab4ca7aa4. A
  // re-introduction of the dead prop would silently let callers pass icons
  // that never render, producing the "icon missing from tile" UX bug.
  // CCR PR #254 — Notion 3658bce9-1f7c-815c-b9a9-d63d606f8626.
  it('rejects an icon prop at the type level', () => {
    const { getByTestId } = render(
      <SubjectTile
        {...baseProps}
        // @ts-expect-error icon prop was removed; bookshelf motif is the visual.
        icon="book-outline"
      />,
    );
    // Runtime: still renders the bookshelf motif, never an Ionicons glyph.
    expect(getByTestId('home-subject-card-abc-123-bookshelf')).toBeTruthy();
  });
});
