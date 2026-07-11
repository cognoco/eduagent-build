import { useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';

import { useNavigationContract } from '../../../hooks/use-navigation-contract';
import { useProfile } from '../../../lib/profile';

/**
 * Owner-safe landing route for payment-failure pushes and email deep links.
 * It switches to the canonical subscription payer before building the full
 * More -> Account -> Subscription stack, so Back never falls through to Home.
 */
export default function BillingManageLanding(): null {
  const router = useRouter();
  const { payerPersonId: rawPayerPersonId } = useLocalSearchParams<{
    payerPersonId?: string | string[];
  }>();
  const payerPersonId = Array.isArray(rawPayerPersonId)
    ? rawPayerPersonId[0]
    : rawPayerPersonId;
  const { activeProfile, profiles, switchProfile } = useProfile();
  const navigationContract = useNavigationContract();
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;

    const payerIsAvailable =
      typeof payerPersonId === 'string' &&
      profiles.some((profile) => profile.id === payerPersonId);
    if (!payerIsAvailable) {
      seededRef.current = true;
      router.replace('/profiles' as Href);
      return;
    }

    let cancelled = false;
    const seedManageBillingStack = (): void => {
      if (cancelled || seededRef.current) return;
      seededRef.current = true;
      router.replace('/(app)/more' as Href);
      router.push('/(app)/more/account' as Href);
      router.push('/(app)/subscription' as Href);
    };

    if (activeProfile?.id === payerPersonId) {
      if (!navigationContract.gates.showBilling) {
        seededRef.current = true;
        router.replace('/profiles' as Href);
        return;
      }
      seedManageBillingStack();
      return;
    }

    void switchProfile(payerPersonId).then((result) => {
      if (!result.success) {
        if (!cancelled) {
          seededRef.current = true;
          router.replace('/profiles' as Href);
        }
        return;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeProfile?.id,
    navigationContract.gates.showBilling,
    payerPersonId,
    profiles,
    router,
    switchProfile,
  ]);

  return null;
}
