import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { FluencyDrillEvent } from '../../lib/sse';

const { FluencyDrillStrip } = require('./FluencyDrillStrip');

describe('FluencyDrillStrip', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when drill is inactive and has no score', () => {
    const drill: FluencyDrillEvent = { active: false };
    render(<FluencyDrillStrip drill={drill} onDismissScore={jest.fn()} />);
    expect(screen.queryByTestId('fluency-drill-timer')).toBeNull();
    expect(screen.queryByTestId('fluency-drill-score')).toBeNull();
  });

  it('renders timer with the full countdown when drill is active', () => {
    const drill: FluencyDrillEvent = { active: true, durationSeconds: 90 };
    render(<FluencyDrillStrip drill={drill} onDismissScore={jest.fn()} />);
    screen.getByTestId('fluency-drill-timer');
    screen.getByText('01:30');
  });

  it('decrements displayed countdown as time elapses', () => {
    const drill: FluencyDrillEvent = { active: true, durationSeconds: 60 };
    render(<FluencyDrillStrip drill={drill} onDismissScore={jest.fn()} />);

    screen.getByText('01:00');

    act(() => {
      jest.advanceTimersByTime(15_000);
    });

    screen.getByText('00:45');
  });

  it('shows score card when drill ended with a score', () => {
    const drill: FluencyDrillEvent = {
      active: false,
      score: { correct: 7, total: 10 },
    };
    render(<FluencyDrillStrip drill={drill} onDismissScore={jest.fn()} />);

    screen.getByTestId('fluency-drill-score');
    screen.getByText('7/10');
    screen.getByText('70% correct');
  });

  it('dismiss press invokes onDismissScore', () => {
    const onDismissScore = jest.fn();
    const drill: FluencyDrillEvent = {
      active: false,
      score: { correct: 3, total: 5 },
    };
    render(<FluencyDrillStrip drill={drill} onDismissScore={onDismissScore} />);

    fireEvent.press(screen.getByTestId('fluency-drill-dismiss'));
    expect(onDismissScore).toHaveBeenCalledTimes(1);
  });

  // M7: onSkipDrill prop tests
  it('skip button is absent when onSkipDrill is not provided', () => {
    const drill: FluencyDrillEvent = { active: true, durationSeconds: 60 };
    render(<FluencyDrillStrip drill={drill} onDismissScore={jest.fn()} />);
    expect(screen.queryByTestId('fluency-drill-skip')).toBeNull();
  });

  it('skip button renders when onSkipDrill is provided and drill is active [M7]', () => {
    const drill: FluencyDrillEvent = { active: true, durationSeconds: 60 };
    render(
      <FluencyDrillStrip
        drill={drill}
        onDismissScore={jest.fn()}
        onSkipDrill={jest.fn()}
      />
    );
    screen.getByTestId('fluency-drill-skip');
  });

  it('pressing skip button invokes onSkipDrill callback [M7]', () => {
    const onSkipDrill = jest.fn();
    const drill: FluencyDrillEvent = { active: true, durationSeconds: 60 };
    render(
      <FluencyDrillStrip
        drill={drill}
        onDismissScore={jest.fn()}
        onSkipDrill={onSkipDrill}
      />
    );
    fireEvent.press(screen.getByTestId('fluency-drill-skip'));
    expect(onSkipDrill).toHaveBeenCalledTimes(1);
  });
});
