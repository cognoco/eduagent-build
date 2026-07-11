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
      (props: {
        isSignedIn: boolean;
        userCreatedAt: Date | null | undefined;
      }) => useActivationLaunchEvents({ ...props, reportActivationEvent }),
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

  // [WI-1689 rework] day2_return hydration latch. Regression for: on a
  // signed-in cold launch, useUser() can still be loading (userCreatedAt is
  // null), so the OLD single combined ref latched itself on that first
  // render and permanently skipped the day-2 check once createdAt hydrated
  // on a later render. app_opened and day2_return must latch independently.
  it('still fires day2_return exactly once when createdAt hydrates to a prior day on a later render', () => {
    const reportActivationEvent = jest.fn();
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    // Cold launch: signed in, Clerk's useUser() still loading (createdAt null).
    // Explicitly typed so the `null` literal widens to the hook's real prop
    // type instead of pinning `rerender`'s param type to exactly `null`.
    const initialProps: {
      isSignedIn: boolean;
      userCreatedAt: Date | null | undefined;
    } = { isSignedIn: true, userCreatedAt: null };

    const { rerender } = renderHook(
      (props: typeof initialProps) =>
        useActivationLaunchEvents({ ...props, reportActivationEvent }),
      { initialProps },
    );

    expect(reportActivationEvent).toHaveBeenCalledWith('app_opened', {
      route: 'app_launch',
    });
    expect(reportActivationEvent).not.toHaveBeenCalledWith(
      'day2_return',
      expect.anything(),
    );

    // useUser() resolves on a later render, hydrating createdAt to a prior day.
    rerender({ isSignedIn: true, userCreatedAt: yesterday });

    expect(reportActivationEvent).toHaveBeenCalledWith('day2_return', {
      route: 'app_launch',
    });
    expect(reportActivationEvent).toHaveBeenCalledTimes(2); // app_opened + day2_return
    expect(
      reportActivationEvent.mock.calls.filter(
        ([eventType]) => eventType === 'day2_return',
      ),
    ).toHaveLength(1);

    // A further re-render (same createdAt) must not fire it again.
    rerender({ isSignedIn: true, userCreatedAt: yesterday });
    expect(reportActivationEvent).toHaveBeenCalledTimes(2);
  });
});
