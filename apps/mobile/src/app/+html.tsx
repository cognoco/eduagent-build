import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Expo Router 3+ (SDK 50+) controls HTML generation from this file. Without
// it, Expo falls back to a built-in template that omits `viewport-fit=cover`,
// which means env(safe-area-inset-*) returns 0 on iOS Safari with a notch.
//
// The legacy `apps/mobile/web/index.html` is no longer picked up by the
// Metro web bundler — it's leftover from the pre-Router-3 era. The duplicate
// height anchor in global.css remains as a belt-and-braces fix for any future
// Expo update that changes how this file gets bundled in dev mode.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
