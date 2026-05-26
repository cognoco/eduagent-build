import React from 'react';
import * as SecureStore from '../../../lib/secure-storage';
import { useConsentStatus } from '../../../hooks/use-consent';
import { useSubjects } from '../../../hooks/use-subjects';
import type { ActiveProfileRole } from '../../../hooks/use-active-profile-role';

/**
 * Checks whether the post-approval landing screen should be shown.
 * Returns [shouldShow, dismiss] — call dismiss() when user taps "Let's Go".
 */
export function usePostApprovalLanding(
  profileId: string | undefined,
  consentStatus: string | null | undefined,
  // [BUG-914] Suppress the "Your parent said yes" celebration for an
  // impersonating parent — they aren't the audience.
  // [BUG-61] Teen-owners (11-17 with their own account) who transitioned
  // PARENTAL_CONSENT_REQUESTED → CONSENTED ARE the audience and have
  // role === 'owner'. Discriminator vs adult-owners: a parental consent record
  // exists (parentEmail is set). Adult-owners with no parental consent flow
  // have parentEmail === null and never see the celebration.
  role: ActiveProfileRole | null,
): [boolean, () => void] {
  const isConsented = !!profileId && consentStatus === 'CONSENTED';
  const { data: consentData } = useConsentStatus();
  const hadParentalConsentFlow = !!consentData?.parentEmail;
  const acceptsPostApproval =
    role === 'child' || (role === 'owner' && hadParentalConsentFlow);
  const [shouldShow, setShouldShow] = React.useState(false);
  const [checked, setChecked] = React.useState(false);
  // [IMP-2] Only query subjects once we know the screen should show — avoids
  // an unnecessary network request (and loading delay) for users whose SecureStore
  // key is already set to 'true'. For new users, the query fires after the
  // SecureStore async read completes.
  const subjects = useSubjects({
    enabled: isConsented && acceptsPostApproval && checked && shouldShow,
  });

  React.useEffect(() => {
    if (!profileId || consentStatus !== 'CONSENTED' || !acceptsPostApproval) {
      setChecked(true);
      setShouldShow(false);
      return;
    }

    const key = `postApprovalSeen_${profileId}`;
    (async () => {
      try {
        const value = await SecureStore.getItemAsync(key);
        setShouldShow(value !== 'true');
        setChecked(true);
      } catch {
        setChecked(true);
      }
    })();
  }, [profileId, consentStatus, acceptsPostApproval]);

  const dismiss = React.useCallback(() => {
    if (!profileId) return;
    setShouldShow(false);
    const key = `postApprovalSeen_${profileId}`;
    void SecureStore.setItemAsync(key, 'true').catch(() => {
      /* non-fatal */
    });
  }, [profileId]);

  // Don't show if subjects are still loading or if user already has subjects
  const subjectsReady = !subjects.isLoading;
  const hasSubjects = (subjects.data?.length ?? 0) > 0;
  return [
    acceptsPostApproval &&
      checked &&
      subjectsReady &&
      shouldShow &&
      !hasSubjects,
    dismiss,
  ];
}
