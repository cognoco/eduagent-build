import { fireEvent, render, screen } from '@testing-library/react-native';

import { RecapsEmptyState } from './RecapsEmptyState';

describe('RecapsEmptyState', () => {
  it('renders the empty card and a "start a session" CTA', () => {
    render(<RecapsEmptyState onStart={jest.fn()} />);

    expect(screen.getByTestId('recaps-empty')).toBeTruthy();
    expect(screen.getByTestId('recaps-empty-start-session')).toBeTruthy();
  });

  it('invokes onStart when the CTA is pressed', () => {
    const onStart = jest.fn();
    render(<RecapsEmptyState onStart={onStart} />);

    fireEvent.press(screen.getByTestId('recaps-empty-start-session'));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('honours an overridden card testID while preserving the shared CTA anchor', () => {
    render(
      <RecapsEmptyState onStart={jest.fn()} testID="journal-recaps-empty" />,
    );

    expect(screen.getByTestId('journal-recaps-empty')).toBeTruthy();
    expect(screen.getByTestId('recaps-empty-start-session')).toBeTruthy();
  });
});
