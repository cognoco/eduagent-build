import { useEffect, useRef } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';

import { useNavigationContract } from '../../../hooks/use-navigation-contract';
import { useParentProxy } from '../../../hooks/use-parent-proxy';
import { useProfile } from '../../../lib/profile';
import { FEATURE_FLAGS } from '../../../lib/feature-flags';

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
  const { activeProfile, switchProfile } = useProfile();
  const { parentProfile } = useParentProxy();
  const navigationContract = useNavigationContract();
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;

    const payerIsAvailable =
      typeof payerPersonId === 'string' && parentProfile?.id === payerPersonId;
    if (!payerIsAvailable) {
      seededRef.current = true;
      router.replace('/profiles' as Href);
      return;
    }

    let cancelled = false;
    const seedManageBillingStack = (): void => {
      if (cancelled || seededRef.current) return;
      seededRef.current = true;
      // WI-2331 AC-2 (core): `/(app)/more` is dead in V2 (not one of the
      // three tabs) — seed the owning tab first so Back from Subscription
      // eventually resolves to a real V2 tab instead of dead-ending at the
      // retired More tab, matching AC-1's tab-highlight contract.
      if (FEATURE_FLAGS.MODE_NAV_V2_ENABLED) {
        router.replace('/(app)/mentor' as Href);
        router.push('/(app)/more' as Href);
      } else {
        router.replace('/(app)/more' as Href);
      }
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

    const switchToPayer = async (): Promise<void> => {
      try {
        const result = await switchProfile(payerPersonId);
        if (result.success) return;
      } catch {
        // Profile selection is the safe recovery surface for switch failures.
      }

      if (!cancelled) {
        seededRef.current = true;
        router.replace('/profiles' as Href);
      }
    };
    void switchToPayer();

    return () => {
      cancelled = true;
    };
  }, [
    activeProfile?.id,
    navigationContract.gates.showBilling,
    parentProfile?.id,
    payerPersonId,
    router,
    switchProfile,
  ]);

  return null;
}
