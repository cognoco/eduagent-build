import { renderHook } from '@testing-library/react-native';
import { useActivationLaunchEvents } from './use-activation-launch-events';

describe('useActivationLaunchEvents', () => {
  it('fires nothing when isSignedIn is false', () => {
    const reportActivationEvent = jest.fn();
    renderHook(() =>
      useActivationLaunchEvents({
        isSignedIn: false,
        userCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
        reportActivationEvent,
      }),
    );
    expect(reportActivationEvent).not.toHaveBeenCalled();
  });

  it('fires app_opened once on first signed-in render, not again on re-render', () => {
    const reportActivationEvent = jest.fn();
    const { rerender } = renderHook(
      (props: { isSignedIn: boolean; userCreatedAt: Date | undefined }) =>
        useActivationLaunchEvents({ ...props, reportActivationEvent }),
      {
        initialProps: { isSignedIn: true, userCreatedAt: undefined },
      },
    );

    expect(reportActivationEvent).toHaveBeenCalledWith('app_opened', {
      route: 'app_launch',
    });
    expect(reportActivationEvent).toHaveBeenCalledTimes(1);

    rerender({ isSignedIn: true, userCreatedAt: undefined });

    // Still just the one call from the first render — the ref guard
    // suppresses a second app_opened on re-render.
    expect(reportActivationEvent).toHaveBeenCalledTimes(1);
  });

  it('fires day2_return when userCreatedAt is a prior UTC day', () => {
    const reportActivationEvent = jest.fn();
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    renderHook(() =>
      useActivationLaunchEvents({
        isSignedIn: true,
        userCreatedAt: yesterday,
        reportActivationEvent,
      }),
    );

    expect(reportActivationEvent).toHaveBeenCalledWith('app_opened', {
      route: 'app_launch',
    });
    expect(reportActivationEvent).toHaveBeenCalledWith('day2_return', {
      route: 'app_launch',
    });
  });

  it('does NOT fire day2_return when userCreatedAt is today (UTC)', () => {
    const reportActivationEvent = jest.fn();
    const today = new Date();

    renderHook(() =>
      useActivationLaunchEvents({
        isSignedIn: true,
        userCreatedAt: today,
        reportActivationEvent,
      }),
    );

    expect(reportActivationEvent).toHaveBeenCalledWith('app_opened', {
      route: 'app_launch',
    });
    expect(reportActivationEvent).not.toHaveBeenCalledWith(
      'day2_return',
      expect.anything(),
    );
    expect(reportActivationEvent).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire day2_return when userCreatedAt is undefined', () => {
    const reportActivationEvent = jest.fn();

    renderHook(() =>
      useActivationLaunchEvents({
        isSignedIn: true,
        userCreatedAt: undefined,
        reportActivationEvent,
      }),
    );

    expect(reportActivationEvent).toHaveBeenCalledWith('app_opened', {
      route: 'app_launch',
    });
    expect(reportActivationEvent).not.toHaveBeenCalledWith(
      'day2_return',
      expect.anything(),
    );
  });
});
