import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { FamilyIntentOnboardingState } from '../../lib/family-intent-onboarding-state';
import * as familyIntentOnboardingState from '../../lib/family-intent-onboarding-state';
import * as mentorBornCeremony from '../../lib/mentor-born-ceremony';
import { FamilyIntentOnboardingGate } from './FamilyIntentOnboardingGate';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const clearFamilyIntentOnboardingSpy = jest
  .spyOn(familyIntentOnboardingState, 'clearFamilyIntentOnboarding')
  .mockResolvedValue(undefined);
const updateFamilyIntentOnboardingStepSpy = jest
  .spyOn(familyIntentOnboardingState, 'updateFamilyIntentOnboardingStep')
  .mockResolvedValue(undefined);
const queueMentorBornCeremonySpy = jest
  .spyOn(mentorBornCeremony, 'queueMentorBornCeremony')
  .mockResolvedValue(null);

const learnerTargetState: FamilyIntentOnboardingState = {
  version: 1,
  profileId: 'adult-profile',
  step: 'learner-target',
};

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  clearFamilyIntentOnboardingSpy.mockRestore();
  updateFamilyIntentOnboardingStepSpy.mockRestore();
  queueMentorBornCeremonySpy.mockRestore();
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
      expect(queueMentorBornCeremonySpy).toHaveBeenCalledWith({
        profileId: 'adult-profile',
        reason: 'first-profile-created',
      });
      expect(clearFamilyIntentOnboardingSpy).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
    expect(updateFamilyIntentOnboardingStepSpy).not.toHaveBeenCalled();
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
      expect(updateFamilyIntentOnboardingStepSpy).toHaveBeenCalledWith(
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
      expect(updateFamilyIntentOnboardingStepSpy).toHaveBeenCalledWith(
        'opening-invitation',
      );
      expect(onStateChange).toHaveBeenCalledWith({
        ...learnerTargetState,
        step: 'opening-invitation',
      });
    });
    expect(clearFamilyIntentOnboardingSpy).not.toHaveBeenCalled();
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
    expect(clearFamilyIntentOnboardingSpy).not.toHaveBeenCalled();
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
      expect(updateFamilyIntentOnboardingStepSpy).toHaveBeenCalledWith(
        'managed-unavailable',
      );
      expect(onStateChange).toHaveBeenCalledWith({
        ...learnerTargetState,
        step: 'managed-unavailable',
      });
    });
  });

  it('keeps the current choice visible with a retry message when a durable transition fails', async () => {
    updateFamilyIntentOnboardingStepSpy.mockRejectedValueOnce(
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
