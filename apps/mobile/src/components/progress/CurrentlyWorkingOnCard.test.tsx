import { render, screen } from '@testing-library/react-native';
import { CurrentlyWorkingOnCard } from './CurrentlyWorkingOnCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key.endsWith('.currentlyWorkingOnTitle'))
        return key.includes('child')
          ? "What you're working on right now"
          : 'Currently working on';
      if (key.endsWith('.currentlyWorkingOnDetected'))
        return key.includes('child')
          ? 'Spotted in your recent sessions'
          : 'Detected from recent sessions';
      if (key === 'progress.currentlyWorkingOn.andNMore')
        return `and ${opts?.count ?? ''} more`;
      return key;
    },
  }),
}));

describe('CurrentlyWorkingOnCard', () => {
  it('renders null for no items', () => {
    const { toJSON } = render(
      <CurrentlyWorkingOnCard items={[]} register="adult" />,
    );

    expect(toJSON()).toBeNull();
  });

  it('renders one item with the detected label', () => {
    render(<CurrentlyWorkingOnCard items={['Fractions']} register="adult" />);

    screen.getByText('Currently working on');
    screen.getByText('Fractions');
    screen.getByText('Detected from recent sessions');
  });

  it('renders child register copy', () => {
    render(<CurrentlyWorkingOnCard items={['Decimals']} register="child" />);

    screen.getByText("What you're working on right now");
    screen.getByText('Spotted in your recent sessions');
  });

  it('renders three items without the overflow suffix', () => {
    render(
      <CurrentlyWorkingOnCard
        items={['Fractions', 'Decimals', 'Ratios']}
        register="adult"
      />,
    );

    expect(screen.getAllByTestId('currently-working-on-item')).toHaveLength(3);
    expect(screen.queryByText(/and \d+ more/)).toBeNull();
  });

  it('caps at three items and renders the overflow suffix', () => {
    render(
      <CurrentlyWorkingOnCard
        items={['Fractions', 'Decimals', 'Ratios', 'Graphs', 'Angles']}
        register="adult"
      />,
    );

    expect(screen.getAllByTestId('currently-working-on-item')).toHaveLength(3);
    screen.getByText('and 2 more');
    expect(screen.queryByText('Graphs')).toBeNull();
  });
});
