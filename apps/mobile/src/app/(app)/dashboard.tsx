import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import type { Href } from 'expo-router';

/**
 * /(app)/dashboard is preserved as an indefinite redirect to /(app)/family.
 * Deep links, notifications, and old bookmarks continue to land on the
 * canonical Family route while preserving returnTo for contextual back.
 */
export default function DashboardRedirect(): React.ReactElement {
  const { returnTo } = useLocalSearchParams<{
    returnTo?: string | string[];
  }>();
  const returnToValue = Array.isArray(returnTo) ? returnTo[0] : returnTo;

  const href: Href = returnToValue
    ? { pathname: '/(app)/family', params: { returnTo: returnToValue } }
    : '/(app)/family';

  return <Redirect href={href} />;
}
