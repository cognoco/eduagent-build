# WI-2842 controlled mutation diff

The credited mutation is limited to the final held-response strategy. Ellipses
below separate unchanged regions; every changed statement is shown.

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
+    await route.continue();
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

The mutation removes route ownership and recreates the missing-correlation
response-wrapper behavior. Restoration returned both files to their exact landed
blob IDs recorded in `red-green.md`.

