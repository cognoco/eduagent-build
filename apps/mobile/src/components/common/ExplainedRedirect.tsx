import { useCallback, useEffect, useRef } from 'react';
import { useRouter, type Href } from 'expo-router';

import { ErrorFallback } from './ErrorFallback';

interface ExplainedRedirectProps {
  href: Href;
  title: string;
  message: string;
  ctaLabel: string;
  testID: string;
  ctaTestID: string;
  delayMs?: number;
}

export function ExplainedRedirect({
  href,
  title,
  message,
  ctaLabel,
  testID,
  ctaTestID,
  delayMs = 1200,
}: ExplainedRedirectProps): React.JSX.Element {
  const router = useRouter();
  const hasNavigatedRef = useRef(false);

  const navigate = useCallback(() => {
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    router.replace(href);
  }, [href, router]);

  useEffect(() => {
    const timer = setTimeout(navigate, delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, navigate]);

  return (
    <ErrorFallback
      variant="centered"
      title={title}
      message={message}
      primaryAction={{
        label: ctaLabel,
        onPress: navigate,
        testID: ctaTestID,
      }}
      testID={testID}
    />
  );
}
