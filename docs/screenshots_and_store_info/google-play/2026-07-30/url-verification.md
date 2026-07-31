# Privacy, support, and deletion URL verification — 2026-07-30

- **Check time:** 2026-07-30, Europe/Oslo
- **Method:** fresh PowerShell `Invoke-WebRequest`, redirects enabled, no stored
  site session supplied

**Status:** Privacy and deletion pages reachable; support surface not ready

## Repository configuration and public HTTP evidence

| Surface | Repository/public value | HTTP result | Disposition |
| --- | --- | --- | --- |
| Privacy policy | `apps/mobile/app.json` → `https://mentomate.com/privacy` | 200, final URL unchanged, `text/html`, title `Privacy Policy \| Mentomate`; controller, 13+, seven-day, and `support@mentomate.com` markers present | Pass for this environment; repeat immediately before submission |
| Privacy `www` variant | `https://www.mentomate.com/privacy` | 200, title matches | Informational; console should use the configured non-`www` URL |
| Account deletion | intended Play URL `https://mentomate.com/delete-account` | 200, final URL unchanged, `text/html`, title `Delete Your Account \| Mentomate`; in-app steps, seven-day grace, Google Play subscription warning, controller, and `support@mentomate.com` present | Pass for this environment; repeat and test mailbox |
| Deletion `www` variant | `https://www.mentomate.com/delete-account` | 200, title matches | Informational |
| Support web page | `https://mentomate.com/support` | 404, title `404: Not Found` | **Do not enter as support URL** |
| Support email — canonical policy/API/live web | `support@mentomate.com` | `mentomate.com` MX resolves to Microsoft 365 | Delivery/monitoring still requires an operator send-and-reply test |
| Support email — current mobile help/sign-in/subscription copy | `support@mentomate.app` | `mentomate.app` DNS lookup returned no domain record | **Launch blocker; production/localisation builder fix required** |

The tracked `docs/delete-account.html` currently uses
`privacy@mentomate.com`, while the live page uses `support@mentomate.com`.
The deployment source and approved monitored mailbox must be reconciled before
the next publication; do not infer that either mailbox is monitored from HTML
alone.

## Clean-device repeat check for OPQ-60

Run immediately before entering or submitting Play metadata:

1. Use a device/browser profile with no MentoMate cookies, local storage, VPN,
   corporate proxy, or authenticated session. Repeat once over mobile data.
2. Open the exact non-`www` privacy and deletion URLs by typing them, not through
   a cached search result.
3. Confirm valid TLS, HTTP 200, no login wall, no geographic block, no redirect
   to an unrelated host, and readable mobile layout.
4. On privacy, confirm the controller, contact, age posture, recipients,
   retention, rights, and deletion wording match the signed package.
5. On deletion, confirm app and email request paths, seven-day grace, retained
   record caveat, subscription-cancellation warning, and controller/contact.
6. Send a synthetic request from a reviewer-safe address to the exact mailbox
   the page exposes. Confirm receipt, ownership, response procedure, and
   cancellation path without deleting a real user.
7. Confirm the in-app Support actions open the same approved, monitored domain.
   Stop on any `mentomate.app` recipient.
8. Save timestamped screenshots plus requested URL, final URL, status,
   certificate/issuer summary, title, and tester/device/network in the evidence
   pack.

Any failure keeps the Play form and listing on HOLD.
