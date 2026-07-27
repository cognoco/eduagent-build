# WI-2842 faithful legacy-reversion audit

## Exact legacy seam

The review-corrected mutation retained the historical correlated continuation.
The journey file was byte-for-byte identical to historical blob
`012399938c90facc3f66ede4ff61683a24d7f054`; the helper regained only the
historical matcher export required by that blob.

```diff
diff --git a/apps/mobile/e2e-web/flows/v2/returning-learner-resume.spec.ts b/apps/mobile/e2e-web/flows/v2/returning-learner-resume.spec.ts
--- a/apps/mobile/e2e-web/flows/v2/returning-learner-resume.spec.ts
+++ b/apps/mobile/e2e-web/flows/v2/returning-learner-resume.spec.ts
@@
-import { expect, test, type APIResponse } from '@playwright/test';
+import { expect, test } from '@playwright/test';
 import {
   createHeldNowRequestDiscriminator,
-  fetchAndFulfillHeldNowResponse,
-  isHeldNowCaptureCandidate,
+  matchesHeldNowRequest,
   type HeldNowRequestDiscriminator,
-  waitForHeldNowResponse,
 } from '../../helpers/held-now-request';
@@
-  let observePostBackNowResponse!: (response: APIResponse) => void;
-  let rejectPostBackNowResponse!: (error: unknown) => void;
-  const postBackNowResponsePromise = new Promise<APIResponse>(
-    (resolve, reject) => {
-      observePostBackNowResponse = resolve;
-      rejectPostBackNowResponse = reject;
-    },
-  );
   const postBackNowCorrelation = `wi-2234-${randomUUID()}`;
   await page.route('**/v1/now?*', async (route) => {
     const request = route.request();
-    if (!isHeldNowCaptureCandidate(request, capturePostBackNowRequest)) {
+    const url = new URL(request.url());
+    if (
+      request.method() !== 'GET' ||
+      url.searchParams.get('scope') !== 'self' ||
+      !capturePostBackNowRequest
+    ) {
       await route.continue();
       return;
     }
@@
-    try {
-      const response = await fetchAndFulfillHeldNowResponse(
-        route,
-        discriminator,
-      );
-      observePostBackNowResponse(response);
-    } catch (error) {
-      rejectPostBackNowResponse(error);
-      throw error;
-    }
+    await route.continue({ url: discriminator.url });
   });
@@
-  const boundedPostBackNowResponsePromise = waitForHeldNowResponse(
-    postBackNowResponsePromise,
+  const postBackNowResponsePromise = page.waitForResponse((response) =>
+    matchesHeldNowRequest(response.request(), heldPostBackNowRequest),
   );
   releasePostBackNowResponse();
-  const postBackNowResponse = await boundedPostBackNowResponsePromise;
-  expect(postBackNowResponse.url()).toBe(heldPostBackNowRequest.url);
+  const postBackNowResponse = await postBackNowResponsePromise;

diff --git a/apps/mobile/e2e-web/helpers/held-now-request.ts b/apps/mobile/e2e-web/helpers/held-now-request.ts
--- a/apps/mobile/e2e-web/helpers/held-now-request.ts
+++ b/apps/mobile/e2e-web/helpers/held-now-request.ts
@@
+export function matchesHeldNowRequest(
+  candidate: RequestView,
+  discriminator: HeldNowRequestDiscriminator,
+): boolean {
+  return (
+    candidate.method() === discriminator.method &&
+    candidate.url() === discriminator.url
+  );
+}
```

This faithful reversion passed four independent staging seeds, so it did not
produce the AC-3 RED.

## Withdrawn synthetic attempt

The first WI-2842 evidence commit used bare `route.continue()` instead of the
historical `route.continue({ url: discriminator.url })`. That omission guaranteed
the later URL matcher could not observe the correlated URL and produced a timeout
for a new reason. Codex review thread `PRRT_kwDORREiyc6T6TVe` correctly rejected it.
It is withdrawn and is not credited as red-green-revert evidence.
