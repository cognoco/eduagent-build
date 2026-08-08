<!--
Evidence record: build and external test of the dpo@zwizzly.com DPO contact channel (WI-2916,
action-register tracker P1 row). The build summary in §2 is Jørn Kjetil Jørgensen's report,
transcribed verbatim from his message as supplied by the operator into the working session on
2026-08-07; formatting reconstructed, wording unaltered. Test facts in §3 are operator statements
recorded 2026-08-08. Optional strengthening artifacts (§5) may be appended when available.
-->

# DPO contact channel — build and external test record (2026-08-08)

## 1. What this evidences

The DPO contact address `dpo@zwizzly.com` (WI-2916 — create the address, confidential
direct forward to the external DPO, test; tracker P1 row) is **built, externally
tested, and operational** as of 2026-08-08, under the controls the DPO ruled in his
2026-07-30 consolidated response §1 and refined in his 2026-07-31 Q1 answer
(`../DPO exchanges/received/2026-07-31-answers-q1-q6.md`):

| DPO requirement (Q1 / §1) | How the build satisfies it |
|---|---|
| Forwarding-only; no mailbox, no distribution group, no retained copy | Built as an Exchange **mail contact** routing directly to the DPO's Proton address; no tenant copy, no BCC rule, no journaling, no deliver-and-forward (journal rules verified absent; the two existing transport rules verified scoped to other domains) |
| Minimum named admins; configuration changes logged | Microsoft 365 unified audit log on and confirmed; configuration changes to the contact are recorded |
| Delivery log: timestamp, delivery status, unique message-id, sender-only-where-necessary — **no subject line** | Log schema has **no subject column at all** (structurally impossible to store); captures timestamp, delivery status, message ID, sender address. Sender is captured as part of the delivery record — treated as necessary for managing communications and identifying rights requests; flagged to the DPO in the 2026-08-08 acceptance email |
| Restricted access; documented retention | Log lives in **Azure Monitor** (deviation from the internally proposed SharePoint folder — a hardening, not a departure from any DPO condition): append-only, no edit operation, access by explicit Azure role grant only, every read recorded in the tenant audit log; **12-month retention platform-enforced by Microsoft** (not our code); data resides in the same tenant, Norway East region |
| Delivery-failure monitoring | Daily job; emails an alert on any failure; a message to dpo@ generates two records (arrival + onward delivery), and the job flags arrivals with no onward delivery |
| External test with the DPO participating | Completed — §3 |

## 2. Build report (Jørn Kjetil Jørgensen, 2026-08-07 — verbatim)

> The DPO channel is built and tested. Summary below.
>
> **What's live**
>
> dpo@zwizzly.com now routes directly to Stephan's Proton address.
>
> It's a mail contact, exactly as specified — not a mailbox, not a shared mailbox, not
> a distribution group. No copy of any message is retained in our tenant. No BCC rule,
> no journaling, no deliver-and-forward. I explicitly verified that no journal rules
> exist, and that our two existing transport rules are scoped to other domains and
> cannot touch DPO mail.
>
> Admin access + audit: the Microsoft 365 unified audit log is on and confirmed.
> Configuration changes to the contact are recorded, which satisfies Stephan's
> "changes logged" requirement.
>
> The log table has no subject column at all, so a subject cannot be stored even if
> the job were changed carelessly. What's captured is timestamp, delivery status,
> message ID, and sender address — nothing else.
>
> One change from the original request: the log is in Azure Monitor, not a SharePoint
> folder. From a security perspective this is a hardening over SharePoint. For a
> record that exists to evidence when a data-subject request arrived an append-only
> store with platform-enforced retention is materially better evidence than a record
> in a SharePoint list.
>
> 12-month deletion is enforced by Microsoft, not by us. In a SharePoint folder, our
> own script would have to delete rows older than twelve months. In Azure Monitor,
> retention is a platform setting; deletion is not our code's responsibility.
> Entries cannot be altered. A file in a folder can be edited or replaced by anyone
> with write access. The Azure log is append-only — there is no edit operation.
> Records cannot be modified after they are written.
> There is nothing to accidentally share. A folder can be re-shared, a link
> forwarded, or permissions inherited from a parent site. This is not a file: access
> requires an explicit Azure role grant.
> Every read is recorded. SharePoint gives basic file access logging. Here, every
> query against the log is recorded in the tenant audit log.
>
> The data stays in the same Microsoft tenant, under the same administrative
> boundary, and is physically stored in Norway (Norway East region), alongside our
> existing resources.
>
> Delivery-failure monitoring: the job runs daily and emails an alert if anything
> fails. A message to dpo@ generates two records — arrival at dpo@, and onward
> delivery to Stephan.
>
> **Note:**
>
> Silent spam-filing. The alert catches hard bounces — a message rejected outright.
> It cannot detect Proton quietly filing a message in spam, because from Microsoft's
> side that counts as successful delivery. This is why it should be repeated if
> Stephan ever changes email provider.

## 3. External test — execution and result

Two test messages were sent from an external consumer address (mirroring how a real
data-subject request arrives), per the test plan in the build report:

1. **Capture test (pre-forwarding).** Sent while the log capture was live but before
   the forward to the DPO was activated. Result: arrival recorded in the log; no
   onward delivery (none configured yet). Deliberate — verified the capture leg in
   isolation.
2. **End-to-end test (post-setup).** Sent after the forward was activated. Result:
   arrival recorded, onward delivery recorded, and **the DPO confirmed receipt in
   his Proton inbox** (operator-reported 2026-08-08; the DPO had committed in his
   2026-07-31 reply to participate in this test).

**Monitoring verified live, not just configured:** on 2026-08-08 the daily job sent
an alert to both founders — "2 message(s) in the last 25h — 1 delivered to the DPO,
0 failed. 1 message(s) arrived but show no onward delivery — INVESTIGATE." The
flagged message is test message 1 (pre-forwarding capture test), so the alert
correctly detected the one arrival that genuinely had no onward delivery. This is a
true-positive demonstration of the gap-detection the DPO's monitoring condition asks
for.

## 4. Residual notes

- **Spam-filing blind spot** (build report §2 note): Proton filing a forwarded
  message as spam is indistinguishable from successful delivery on the Microsoft
  side. Mitigation on record: repeat the external test if the DPO ever changes email
  provider; the 3-working-day relay-chase rule in the tracker P1 row stands.
- **Sender address captured always**, not only where necessary — justified as
  necessary for managing communications and identifying rights requests; disclosed
  to the DPO in the 2026-08-08 acceptance email rather than left for him to find.
- Rights-request handling stays separate: a data-subject request arriving via dpo@
  is entered into the rights-request register per the DPO's Q1 answer (WI-2917
  workflow).

## 5. Optional strengthening artifacts (append when available)

- The DPO's confirmation text (his reply confirming Proton receipt).
- Screenshot of the Azure Monitor log entry for test message 2 showing timestamp,
  delivery status, message ID, sender — and the structural absence of a subject
  column.
- Jørn's timestamp confirmation that test message 1 predates forwarding activation
  (currently established by operator statement of the test sequence).
