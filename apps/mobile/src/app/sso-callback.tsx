import { useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';

/**
 * OAuth SSO callback route.
 *
 * Clerk redirects here after the user completes OAuth consent in the
 * in-app browser. `maybeCompleteAuthSession()` closes the browser
 * and hands the auth result back to the `useSSO` hook.
 */
export default function SSOCallbackScreen() {
  useEffect(() => {
    void WebBrowser.maybeCompleteAuthSession();
  }, []);

  return null;
}
