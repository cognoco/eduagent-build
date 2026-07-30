import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { FamilyIntentOnboardingState } from '../../lib/family-intent-onboarding-state';
import {
  clearFamilyIntentOnboarding,
  updateFamilyIntentOnboardingStep,
} from '../../lib/family-intent-onboarding-state';
import { queueMentorBornCeremony } from '../../lib/mentor-born-ceremony';
import { FamilyIntentOnboardingGate } from './FamilyIntentOnboardingGate';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock(
  '../../lib/family-intent-onboarding-state' /* gc1-allow: SecureStore boundary; component tests assert the state transitions requested by each visible branch */,
  () => ({
    ...jest.requireActual('../../lib/family-intent-onboarding-state'),
    clearFamilyIntentOnboarding: jest.fn().mockResolvedValue(undefined),
    updateFamilyIntentOnboardingStep: jest.fn().mockResolvedValue(undefined),
  }),
);

jest.mock(
  '../../lib/mentor-born-ceremony' /* gc1-allow: durable SecureStore ceremony boundary; this suite asserts the self-learning handoff request */,
  () => ({
    queueMentorBornCeremony: jest.fn().mockResolvedValue(undefined),
  }),
);

const learnerTargetState: FamilyIntentOnboardingState = {
  version: 1,
  profileId: 'adult-profile',
  step: 'learner-target',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('FamilyIntentOnboardingGate', () => {
  it('Me continues the adult learner onboarding without creating relationship state', async () => {
    const onStateChange = jest.fn();
    const onComplete = jest.fn();
    render(
      <FamilyIntentOnboardingGate
        state={learnerTargetState}
        onStateChange={onStateChange}
        onComplete={onComplete}
        onOpenInvitation={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('family-intent-target-me'));

    await waitFor(() => {
      expect(queueMentorBornCeremony).toHaveBeenCalledWith({
        profileId: 'adult-profile',
        reason: 'first-profile-created',
      });
      expect(clearFamilyIntentOnboarding).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(updateFamilyIntentOnboardingStep).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('Someone else asks whether the learner has their own login', async () => {
    const onStateChange = jest.fn();
    render(
      <FamilyIntentOnboardingGate
        state={learnerTargetState}
        onStateChange={onStateChange}
        onComplete={jest.fn()}
        onOpenInvitation={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('family-intent-target-someone-else'));

    await waitFor(() => {
      expect(updateFamilyIntentOnboardingStep).toHaveBeenCalledWith(
        'login-choice',
      );
      expect(onStateChange).toHaveBeenCalledWith({
        ...learnerTargetState,
        step: 'login-choice',
      });
    });
  });

  it('routes a credentialed learner directly to the existing invitation form', async () => {
    const onStateChange = jest.fn();
    render(
      <FamilyIntentOnboardingGate
        state={{ ...learnerTargetState, step: 'login-choice' }}
        onStateChange={onStateChange}
        onComplete={jest.fn()}
        onOpenInvitation={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('family-intent-login-yes'));

    await waitFor(() => {
      expect(updateFamilyIntentOnboardingStep).toHaveBeenCalledWith(
        'opening-invitation',
      );
      expect(onStateChange).toHaveBeenCalledWith({
        ...learnerTargetState,
        step: 'opening-invitation',
      });
    });
    expect(clearFamilyIntentOnboarding).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('retries the invitation route from a durable opening-invitation step after remount', async () => {
    const onOpenInvitation = jest.fn();
    render(
      <FamilyIntentOnboardingGate
        state={{ ...learnerTargetState, step: 'opening-invitation' }}
        onStateChange={jest.fn()}
        onComplete={jest.fn()}
        onOpenInvitation={onOpenInvitation}
      />,
    );

    await waitFor(() => {
      expect(onOpenInvitation).toHaveBeenCalledTimes(1);
    });
    expect(mockPush).not.toHaveBeenCalled();
    expect(clearFamilyIntentOnboarding).not.toHaveBeenCalled();
  });

  it('gates the unavailable managed learner path explicitly and durably', async () => {
    const onStateChange = jest.fn();
    render(
      <FamilyIntentOnboardingGate
        state={{ ...learnerTargetState, step: 'login-choice' }}
        onStateChange={onStateChange}
        onComplete={jest.fn()}
        onOpenInvitation={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('family-intent-login-no'));

    await waitFor(() => {
      expect(updateFamilyIntentOnboardingStep).toHaveBeenCalledWith(
        'managed-unavailable',
      );
      expect(onStateChange).toHaveBeenCalledWith({
        ...learnerTargetState,
        step: 'managed-unavailable',
      });
    });
  });

  it('keeps the current choice visible with a retry message when a durable transition fails', async () => {
    (updateFamilyIntentOnboardingStep as jest.Mock).mockRejectedValueOnce(
      new Error('storage unavailable'),
    );
    const onStateChange = jest.fn();
    render(
      <FamilyIntentOnboardingGate
        state={learnerTargetState}
        onStateChange={onStateChange}
        onComplete={jest.fn()}
        onOpenInvitation={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('family-intent-target-someone-else'));

    await waitFor(() => {
      screen.getByTestId('family-intent-action-error');
    });
    expect(onStateChange).not.toHaveBeenCalled();
    screen.getByTestId('family-intent-target-someone-else');
  });
});
