'use client';

/**
 * Global Error Boundary
 *
 * This component catches unhandled errors that occur in the root layout
 * and replaces the entire application UI with a fallback. It must include
 * <html> and <body> tags because it replaces the root layout when active.
 *
 * This is the last line of defense for React rendering errors.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/routing/error-handling
 * Sentry: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#step-3-capture-react-render-errors
 */

import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    // Report the error to Sentry
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        {/* NextError is the default Next.js error page component.
            Its type definition requires a statusCode prop. However,
            since the App Router does not expose status codes for errors,
            we pass 0 to render a generic error message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
