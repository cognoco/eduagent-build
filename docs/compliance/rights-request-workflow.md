# Data-Subject Rights Request Workflow

**Register action:** 11 (partial — see §7) · **Law:** GDPR Articles 12(3), 12(4), 15–22 · **Status:** DRAFT — not legally reviewed, not approved, and not a compliance determination. Nothing here has been reviewed or accepted by the External DPO or by counsel.
**Controller:** **ZWIZZLY AS**, org.nr **811696072**, Fiskekroken 3B, 0139 Oslo, Norway. **Lead regulator:** Norwegian Datatilsynet.
**Source:** DPO Interim Advice action register, [action 11 and prerequisite P1](DPO%20exchanges/2026-07-26-action-register-tracker.md); the External DPO's Q1 answer of 2026-07-31 recorded in that register's correspondence log.

> **The one-line rule.** A rights request is answered by **the controller (ZWIZZLY AS)** within the **Article 12(3) one-month deadline**, whichever channel it arrived at. When a request arrives at `dpo@zwizzly.com`, the **DPO relays it — he does not answer it**. Relay is a forwarding duty, not a substitute for the controller's answer, and it does not stop or restart the clock.

This document exists so that an agent or a person holding a rights request does not have to ask **who answers**, **by when**, or **where it is recorded**.

---

## 1. Who answers

| | |
|---|---|
| **Answers the data subject** | **ZWIZZLY AS**, as controller. |
| **Does not answer the data subject** | The External DPO. His statutory role under GDPR Articles 38–39 is to advise and monitor; the appointment documents place the functional address in front of him as a confidential forward, not as a support desk. A request reaching him is **relayed to the controller**, who answers it. |
| **Deadline** | **One month from receipt** (Art 12(3)) — measured from receipt at the channel where the data subject sent it, **not** from the date it reached the controller after a relay. |
| **Extension** | Art 12(3) permits an extension of up to two further months where necessary given complexity or number of requests, **but the data subject must be told of the extension, with reasons, within the original one month.** An extension is a notified act, never a silent overrun. |
| **Refusal / no action** | If the controller does not act on a request, Art 12(4) requires informing the data subject within the same one month, with the reasons and with notice of the right to complain to Datatilsynet and to a judicial remedy. |

Identity of the External DPO is recorded in [`DPO exchanges/2026-07-31-formal-designation-clean.md`](DPO%20exchanges/2026-07-31-formal-designation-clean.md); this document refers to the role rather than the individual.

## 2. Channels: where a request can arrive, and what happens

| Channel | Published to users? | Reaches | First action | Source |
|---|---|---|---|---|
| **In-app — *Delete account*** | Yes | The product directly (self-service) | Direct exercise, **not** a request to the controller — see §4.2. The durable record is the `deletion_audit` row; the schedule stamp it starts from is **transient** — §4.2 states exactly what each one does and does not carry. A register row is opened only if the person **makes a controller-directed request** through any valid channel in this table (which they may of course do after self-service fails or is unavailable to them — §2.1). | `apps/mobile/src/app/(app)/more/privacy.tsx`; `apps/api/src/routes/account.ts` (`POST /account/delete`); privacy policy [§9](privacy-policy.html) |
| **In-app — *Export my data*** | Yes | The product directly (self-service) | Direct exercise, **not** a request to the controller — see §4.2. **No durable record is created: `GET /account/export` performs no write, and `export-v2.ts` is read-only end to end.** The only trace is the generic request log (§4.2), which is an operational log rather than accountability evidence. That is an open gap, not a settled position — §4.2. A register row is opened only if the person **makes a controller-directed request** through any valid channel in this table (including after self-service fails or is unavailable — §2.1). | `apps/mobile/src/app/(app)/more/privacy.tsx`; `apps/api/src/routes/account.ts` (`GET /account/export`); privacy policy [§9](privacy-policy.html) |
| **`support@mentomate.com`** | Yes | Controller | Recognise it as a rights request, open a register row the same working day, start the Art 12(3) clock at the date of receipt. | Privacy policy [§9 and §11](privacy-policy.html) |
| **Postal address** (ZWIZZLY AS, Fiskekroken 3B, 0139 Oslo) | Yes | Controller | As for `support@`. Clock starts on receipt of the letter. | Privacy policy [§11](privacy-policy.html) |
| **`dpo@zwizzly.com`** | **No — not a published rights channel. See §5.** | External DPO, as a confidential forward | **Relay to the controller** under §3. Clock started at the data subject's send/receipt date, not at relay. | [`evidence/2026-07-31-dpo-mailbox-setup-memo.md`](evidence/2026-07-31-dpo-mailbox-setup-memo.md); register P1 |
| **Any other route** (app-store review, a reply in an unrelated support thread, social channel) | — | Whoever sees it | A rights request is valid however it arrives; Art 12 attaches no form requirement. Route it to `support@`, open a register row, and date it from the original arrival — not from the internal hand-off. | GDPR Art 12; no form requirement |

### 2.1 The learner who has no self-service route

The in-app *Export my data* and *Delete account* rows are **owner-gated** — both render only when `showOwnerPrivacyGates` is true (`apps/mobile/src/app/(app)/more/privacy.tsx`, the two `SettingsRow` blocks following the Terms row). A learner who is a **non-owner profile on a parent's account** therefore sees no in-app export or deletion control at all.

Consequence for this workflow: for that person, **"use the in-app settings" is not an available route** — they have **no in-app self-service route**. Every other intake channel in §2 remains fully available to them: `support@mentomate.com`, the **postal address**, and **any other route** by which the request happens to arrive. What is missing is self-service, not standing. An operator must **not** treat a letter or a request arriving through another valid route from a non-owner learner as outside the documented path, and must not ask them to resubmit by email — Art 12 attaches no form requirement, and the clock dates from the original arrival either way (§2). Such a request is a normal Art 15/17 request that the controller answers on the same one-month clock; it is not refused, and not deferred to the account owner, merely because the learner cannot self-serve in the app.

**Unverified / open:** whether, and on what basis, the account owner or guardian must be involved before the controller acts on such a request is an **authority-verification question that this document does not settle** — see §7. Until those rules are drafted and reviewed, treat any request from a non-owner learner as requiring a documented authority decision recorded in the register row, and escalate to the controller rather than deciding it ad hoc.

## 3. The relay duty on `dpo@zwizzly.com`

`dpo@zwizzly.com` is configured as a **forwarding address, not a mailbox** — a direct, confidential forward to the External DPO's professional address, with no shared mailbox, no distribution-group membership, and no BCC or journaling rule that would retain content inside our tenant ([`evidence/2026-07-31-dpo-mailbox-setup-memo.md`](evidence/2026-07-31-dpo-mailbox-setup-memo.md) §1). It follows that the controller does **not** see the content of mail sent to this address; the controller sees only that mail arrived.

The relay duty is therefore the DPO's, and it runs as follows.

1. **Relay.** A rights request reaching the External DPO at `dpo@zwizzly.com` is relayed to the controller. He does not answer the data subject; the controller does.
2. **Chase — 3 working days.** The **3-working-day relay-chase rule** applies to the relay. If a delivery to `dpo@` has been recorded and no relay has reached the controller within **3 working days**, the controller chases the DPO for it. The same 3-working-day rule already governs unresolved bounces and delivery failures on this address, which escalate to Zuzana Kopečná (mailbox memo §1, *Access controls*).
3. **Detect.** The chase is triggered from the **delivery log** maintained under WI-2916 (timestamp, delivery status, unique message-id, sender only where necessary — **no subject line**). That log proves *that* mail arrived and when, which is exactly what a chase needs; it deliberately reveals nothing about *what* arrived. A delivery row with no matching relay after 3 working days is the trigger condition.
4. **The clock does not wait for the relay.** Once relayed, the register row is opened and dated from the data subject's original send/receipt date at `dpo@`. Relay latency consumes the controller's month; it does not extend it. This is the operational reason the chase rule is short.

**Unverified / open:** the relay mechanism has not been exercised. The address is not yet live — the external test with the External DPO participating has not been run, and the forwarding target address is not recorded in any repository document. `[Forwarding target — TODO; blocked on OPQ-167 "Provide the DPO forwarding address for dpo@zwizzly.com + participate in the delivery test (WI-2916)" (Operator Queue, Open), not forgotten]`

## 4. The rights-request register

Every rights request **made to the controller** goes into a **rights-request register**, per the External DPO's Q1 answer of 2026-07-31 (register correspondence log, entry of that date). Direct self-service exercise of a right is a different act and is treated in **§4.2** — read it before applying the word "every" here.

### 4.1 It is a separate record from the delivery log

This is the load-bearing distinction, and it is the DPO's ruling rather than our design choice:

| | Delivery log (WI-2916) | Rights-request register (this document) |
|---|---|---|
| Records | **That** mail arrived at `dpo@` — timestamp, delivery status, unique message-id, sender only where necessary | **What was requested and what we did about it** — the substance and the handling |
| Subject line | **Excluded**, deliberately — a subject line may carry substantive or special-category content | n/a — the register records the request on its merits, in a record built to hold that content |
| Scope | Every message delivered to `dpo@`, rights request or not | Every rights request **made to the controller**, whichever channel it arrived at — not only `dpo@`. Direct self-service exercise is out of scope and separately treated (§4.2) |
| Purpose | Proving delivery and detecting failure | Art 5(2) / Art 12 accountability: proving requests were answered, and when |

A rights request that arrives at `dpo@` therefore produces **two records**: the standard metadata row in the delivery log — and **nothing more there** — plus a full row in this register. The mailbox memo states the same boundary from the other side: *"if a data subject rights request arrives at `dpo@`, it does not get logged here beyond the standard metadata row… It goes into a separate rights-request register"* ([`evidence/2026-07-31-dpo-mailbox-setup-memo.md`](evidence/2026-07-31-dpo-mailbox-setup-memo.md) §2). The same wording is carried into the DPO Services Agreement ([`DPO exchanges/2026-07-31-services-agreement-clean.md`](DPO%20exchanges/2026-07-31-services-agreement-clean.md)).

Do not merge the two records, and do not copy request substance into the delivery log.

### 4.2 Direct self-service exercise — why it is not a register row, and where the position is weak

This subsection exists because an earlier version of this document said in one place that self-service
exercises do not enter the register and in two others that **every** rights request does. Both could not
be true. The exception was the unauthorised statement; these are the terms on which it now stands.

**The position.** A self-service *Delete account* or *Export my data* is the data subject **exercising**
a right directly through a facility the controller built for that purpose. It is not a **request made to
the controller** that someone must recognise, answer and date. The distinction is not cosmetic:

- **Art 12(3)'s one-month deadline attaches to a request the controller must answer.** Where the subject
  acts directly there is nothing to answer, no recipient, and no clock — which is why a self-service
  action cannot be late.
- **Recital 63 expressly contemplates direct remote access** as a means of satisfying the right of
  access: *"where possible, the controller should be able to provide remote access to a secure system
  which would provide the data subject with direct access to his or her personal data."* Building that
  facility is the controller satisfying Art 15, not deferring it.
- **The register's own stated purpose (§4.1) is proving requests were answered, and when.** A row
  recording that a subject served themselves proves nothing about controller responsiveness, because
  responsiveness was not engaged.

**Where the accountability actually sits, verified in code rather than assumed:**

| Self-service action | Identified record | Verified at |
|---|---|---|
| *Delete account* — **during the grace period** | `organization.deletion_scheduled_at`, set by `scheduleDeletionV2`. **TRANSIENT BY DESIGN** — it is a column on the organization row, and `executeDeletionV2` deletes that row when the erasure runs. It does not survive the thing it records. | `apps/api/src/routes/account.ts` (`POST /account/delete`); `deletion-v2.ts` (`tryScheduleDeletionV2`; `delete(organization)` in the execute path) |
| *Delete account* — **after erasure** | The `deletion_audit` row, written before the organization row is dropped and explicitly built to outlive the person. On **this** path it carries `person_id`, `reason` = `user_initiated`, `retained_at` and `retention_period`. **`deleted_by` is NULL on this path** — both the initial and the retry call pass `deletedBy: null`, and they are the only production callers — and the row carries **neither the exercise date nor the grace-period end**. So it proves *that* an erasure happened, that it was **subject-initiated rather than system-initiated**, and *when it executed*: **not which person initiated it**, and not when the right was exercised. | `packages/database/src/schema/identity.ts` (`deletion_audit`); `apps/api/src/inngest/functions/account-deletion.ts` (both `executeDeletionV2` calls) |
| *Export my data* | **No durable record.** The route generates and returns the export and performs **no write**; the export service is read-only end to end. **At the application layer**, the only trace is the generic structured request log applied to every route (`api.use('*', requestLogger)`), and it emits **method, path, status and latency — and no subject identifier at all**. This audit covers the application layer only: whatever the hosting platform may record independently was **not** examined and is not claimed either way. The logger reads `user.profileId`, but production auth sets `user` with `userId`, `email`, `emailVerified` and an optional factor age and **never a `profileId`**; the profile scope is stored on a separate context key and nothing copies it onto `user`, so that field is always absent in production (`request-logger.test.ts` asserts the omission for exactly this shape). The trace therefore shows *that an export succeeded and when* — **not whose**. It is an **operational log, not accountability evidence**: not purpose-built, not queryable as a register, and carrying no data subject. Its retention was **not** established here — no compliance retention period is defined for it, and none should be assumed in either direction. | `apps/api/src/routes/account.ts` (`GET /account/export`); `apps/api/src/services/identity-v2/export-v2.ts`; `apps/api/src/middleware/request-logger.ts`; `apps/api/src/index.ts` |

**So the position is PARTIAL for deletion and ABSENT for export, and this document does not paper over
either.** Under Art 5(2) the controller must be able to demonstrate compliance:

- **Deletion:** demonstrable *that it happened*, that it was **subject-initiated rather than
  system-initiated** (`reason` = `user_initiated`), and *when it executed* — from `deletion_audit`.
  **Not** demonstrable *which person initiated it*, because this path writes `deleted_by` as NULL, and
  **not** demonstrable *when the subject exercised the right*, because the only artifact carrying that
  date is deleted by the erasure it triggered.

  > **This row has now been narrowed twice by independent review, and the pattern is the point.** The
  > first draft named the schedule stamp as the durable record — it is a column on a row the erasure
  > deletes. The second named `deletion_audit` as proving the erasure "by whom" — the column exists in
  > the schema but this path never populates it. Both times the check performed was *does the field
  > exist*, and the claim made was *the field is evidence*. The third narrowing was the same again one
  > level out: the request logger contains code that writes a profile identifier, and production auth
  > never puts one on the object it reads. **A field's presence in a schema — or a write in a
  > consumer — says nothing about whether any producer populates it**, and a passing test can *confirm*
  > the absence rather than contradict it (`request-logger.test.ts` asserts the omission). Trace the
  > value from its producer to its consumer; do not read the consumer and infer the producer.
- **Export:** not demonstrable at all. The generic request log records that the route was called and
  when, and **carries no data subject** — production auth never puts a profile identifier on the object
  the logger reads. So it cannot even distinguish which person exercised the right, which is the one
  fact an access-accountability record has to carry. An earlier draft of this line claimed the log
  records the caller's profile; independent review established it does not, and that correction is the
  third time this subsection has had to be narrowed. See the callout above — the failure each time was
  reading the consumer of a value instead of tracing it from its producer.

**Open — do not read this subsection as closing either gap.**
`[1. Self-service export leaves no accountability record at all. 2. Self-service deletion leaves no
durable record of the EXERCISE date — deletion_audit carries execution, not exercise. 3. Self-service
deletion leaves no durable record of the INITIATING ACTOR — deletion_audit.deleted_by is NULL on this
path; the surviving reason field distinguishes subject-initiated from system-initiated, and that is
all. TODO for all three: either the product records them (the smaller change: one dated audit row on
GET /account/export identifying the subject who exercised the right, and the exercise date - i.e. the
schedule timestamp - plus the grace-period end and the initiating person carried into deletion_audit),
or the controller registers self-service exercises, which needs a mechanism that does
not exist today. This is a product/legal call, not a documentation one, and it is NOT resolved by this
document. Owner: controller, with the External DPO.]`

Requiring a register row here without that mechanism would state a control the system does not have —
which is the failure this document exists to avoid, not one to commit in the act of closing it.

> **Drafting status.** The reasoning in this subsection is a **drafted legal position, not counsel- or
> DPO-reviewed.** It is recorded so it can be contested on its merits. If the DPO or counsel reads
> self-service exercise as within the register's scope, the fix is the mechanism named above, and this
> subsection is what should be shown to them to get that answer.

### 4.3 Minimal shape — fields

One row per request. These fields are the minimum; add only what a specific request genuinely needs.

| Field | Notes |
|---|---|
| Request ID | Sequential, stable, referenced in all correspondence about the request. |
| Date received | The date the data subject's request arrived at **its** channel. This date starts the Art 12(3) clock. |
| Channel received | One of the rows in §2. For `dpo@`, also record the relay date, so relay latency is visible against the chase rule. |
| Requester | The minimum identifier needed to respond. Do not collect more identifying data than answering requires. |
| Account / profile concerned | Which account, and which profile within it. |
| Right(s) invoked | Access, rectification, erasure, restriction, portability, objection, withdrawal of consent (Art 15–22, Art 7(3)). More than one may apply to a single request. |
| Authority basis + verification status | Self, guardian, former guardian, or authorised representative — and whether authority was verified, how, and by whom. **The rules governing this determination are not yet drafted (§7); until they are, record the decision and its reasoning in full rather than relying on a rule.** |
| Response deadline | Date received + one month. Computed and written at row-open, not at response time. |
| Extension | Whether an Art 12(3) extension was applied; the date the data subject was told; the reasons given. Blank means no extension — never means "notified late". |
| Action taken / outcome | What was done, including a decision not to act and its Art 12(4) reasoning. |
| Date responded | The date the answer reached the data subject. |
| Evidence pointer | Where the outgoing response and any supporting material are filed. |

No message bodies or attachments are pasted into the register itself; the register points at where they are filed.

### 4.4 Storage location

- A restricted Microsoft 365 SharePoint/OneDrive folder, **separate from the delivery-log folder** — sibling records, not the same file and not the same folder.
- A single file (CSV or equivalent list), one row per request, corrections appended rather than rows overwritten, so the handling history stays reconstructable.

### 4.5 Restricted access

- Access limited to the **minimum number of named individuals**, with the access list recorded. No broader team access, and no default tenant-admin visibility beyond what Microsoft 365 structurally requires — the same access principle the External DPO imposed on the delivery log and the forwarding configuration (mailbox memo §1–§2).
- **Proposed named set: the same individuals who hold the delivery log (Jørn and Zuzana Kopečná, per mailbox memo §2), plus whoever answers rights requests operationally.** `[Named access set — TODO; controller to confirm. Not established by any repository document; do not treat the proposal above as a decision.]`
- The register can contain substantive and potentially special-category content — precisely the content the delivery log excludes from itself. Access restriction here is doing more work than it is on the delivery log, not less.

### 4.6 Retention

`[Retention period — TODO; blocked on OPQ-24 "WI-1194 — obtain counsel-approved retention periods" (Operator Queue, Delegated), not forgotten.]`

The delivery log's 12-month retention (mailbox memo §2) was chosen for delivery *metadata* and **does not carry over** to this register: the register is Art 5(2) accountability evidence with different content and a different justification. Set its period with the category-specific retention schedule (register action 6), not by analogy.

## 5. Whether and when `dpo@zwizzly.com` becomes a published rights channel

**Now: it does not.** `dpo@zwizzly.com` is **not** a published rights channel and must not be presented as one. Publishing it is **out of scope for this document and for WI-2917**. The published rights channels are those marked *published* in §2 — in-app settings, `support@mentomate.com`, and the postal address — and the privacy policy routes data-subject requests to exactly those ([§9](privacy-policy.html): *"To exercise these rights, use the in-app settings or contact us at support@mentomate.com"*; [§11](privacy-policy.html) repeats the routing and adds the postal address). That routing is consistent with this workflow and needs no change.

The register's prerequisite P1 states the constraint directly: create the address, *"do NOT publish or register yet"*.

**When it could change.** Publication is not a single gate but a chain, and **all three links must close first**:

| # | Condition | Tracked as | Status (verified 2026-08-05) |
|---|---|---|---|
| 1 | The forwarding address is live, the forwarding target is provided, and the external test has been run with the External DPO participating | **OPQ-167** — *Provide the DPO forwarding address for dpo@zwizzly.com + participate in the delivery test (WI-2916)* | **Open** |
| 2 | The appointment takes effect: both appointment documents signed, effective date = `dpo@` activation + external test, then Datatilsynet notified | Action-register **P3** — *"unblocked; final step ruled 2026-07-31"*. **No Operator Queue item tracks this**; see the note below | Not effective |
| 3 | The publication act itself, with the DPO's publishable contact details added to privacy-policy §11 | **OPQ-106** — *Approve and publish the privacy policy and child-readable summary* | **Open** |

Until all three close, the DPO's contact details are not published anywhere, and `dpo@` is not offered to data subjects as a route. Even after they close, publishing the DPO's contact details under Art 13(1)(b)/37(7) does **not** convert the address into a channel the DPO answers — the relay duty in §3 and the controller's answering duty in §1 continue unchanged. A published DPO contact is a transparency obligation, not a change of who answers.

**Two accuracy notes, recorded rather than acted on:**

- **OPQ-102** — *Engage an outsourced DPO* — is **Closed**, ruled 2026-07-24: *"Stefan has been retained as the outsourced DPO; the appointment is complete."* That closure records the **engagement decision**. It does **not** record the appointment's *effective date*, which is condition 2 above and remains outstanding. **Four** documents under `docs/compliance/` still cite OPQ-102 as a live or pending gate; those references are stale as to OPQ-102's status. Enumerated from a repository-wide search for the identifier rather than from recollection, so this list is the search result and not a sample:

  - [`breach-response-plan.md`](breach-response-plan.md) — two `TODO` placeholders for the Breach Lead's name and address;
  - [`child-readable-privacy-summary-draft.md`](child-readable-privacy-summary-draft.md) — the pre-publication blocker list and the "choices and rights" section;
  - [`privacy-policy.html`](privacy-policy.html) — a `PRE-PUBLISH TODO` on the DPO contact line;
  - [`privacy-publication-manifest.md`](privacy-publication-manifest.md) — the DPO-contact claim row and the publication gate that still routes DPO-contact insertion through OPQ-102.

They are **not corrected here** — that is a deliberate scope decision, not an oversight, and it is the reason this list is stated in full: the publication pass must be able to see every stale gate it will hit, or it will keep chasing a closed OPQ instead of running the real check, which is the appointment's **effective date** (condition 2 above) and carries no Operator Queue row of its own.
- Condition 2 has **no Operator Queue ID**. It is tracked only as action-register prerequisite P3. That absence is recorded here deliberately: the gate exists, it is simply not in the Operator Queue.

## 6. Handling a request end to end

1. **Receive.** Recognise it as a rights request. No form, no wording, and no use of the word "GDPR" is required for a request to be valid.
2. **Date it.** Record the date it arrived at *its* channel. For `dpo@`, this is the data subject's send/receipt date, not the relay date.
3. **Open the register row** the same working day, with the deadline (received + one month) computed at open.
4. **Establish authority** where the requester is not plainly the data subject acting for themselves — recording the decision and its reasoning in the row. See the §7 caveat: the governing rules are not yet drafted.
5. **Act,** or decide not to act. Either way the answer is the controller's, and either way it is due within the month.
6. **Extend only by notifying.** If an Art 12(3) extension is needed, tell the data subject with reasons **inside the original month**, and record it.
7. **Respond,** and record the response date and where the outgoing response is filed.
8. **If it arrived at `dpo@`:** confirm the delivery log carries the standard metadata row and nothing further, and that request substance lives only in the register.

## 7. What this document does *not* close

Register action 11 is *"Rights + authority-verification workflows, tested"*. Its recorded gap is broader than this document: *"Documented workflows for all rights; guardian/former-guardian/representative authority rules; test cases; templates"*.

**Closed here:** who answers and by when (§1); channel routing including the `dpo@` relay duty and the 3-working-day chase (§2–§3); the rights-request register's minimal shape (§4); the published-channel question for `dpo@` (§5); the end-to-end handling sequence (§6).

**Still open under action 11, not addressed here:**

- **Authority-verification rules** — guardian, former guardian, and authorised-representative determination, including the non-owner-learner case in §2.1. This is the largest remaining piece and it is a substantive legal question, not a documentation gap.
- **Per-right procedural detail** for rectification, restriction, objection, and portability. Access and erasure have working in-app implementations; the others currently have no documented procedure beyond §6.
- **Test cases and evidence that the workflow has been exercised.** Action 11 requires the workflows to be *tested*; none of this has been run. The `dpo@` relay path in particular cannot be tested until OPQ-167 closes.
- **Response templates.**
- **Export/delete parity against the full schema inventory** — recorded as gap G-10 in [`evidence/2026-07-26-retention-schedule-draft.md`](evidence/2026-07-26-retention-schedule-draft.md), and explicitly tied there to this action.

Action 11 therefore remains **partial-exists**. This document must not be read as closing it, and its status in the action register should not be advanced to `sent-to-DPO` on the strength of this document alone.

## 8. Sources

| Claim | Source | Verified |
|---|---|---|
| Controller answers; DPO relays; separate rights-request register | External DPO's Q1 answer, 2026-07-31 — correspondence log, [action register](DPO%20exchanges/2026-07-26-action-register-tracker.md) | 2026-08-05 |
| 3-working-day relay-chase rule; delivery-log fields; no subject line | [Action register P1](DPO%20exchanges/2026-07-26-action-register-tracker.md); [`evidence/2026-07-31-dpo-mailbox-setup-memo.md`](evidence/2026-07-31-dpo-mailbox-setup-memo.md) §1–§2 | 2026-08-05 |
| `dpo@` forwarding-only; not published; not registered | [Action register P1](DPO%20exchanges/2026-07-26-action-register-tracker.md); mailbox memo §1; [`DPO exchanges/2026-07-31-services-agreement-clean.md`](DPO%20exchanges/2026-07-31-services-agreement-clean.md) | 2026-08-05 |
| Published rights channels = in-app settings + `support@mentomate.com` + postal | [`privacy-policy.html`](privacy-policy.html) §9, §11 | 2026-08-05 |
| Export/delete are owner-gated; non-owner learners have no in-app route | `apps/mobile/src/app/(app)/more/privacy.tsx` (`showOwnerPrivacyGates` guards both rows) | 2026-08-05 |
| Self-service *delete*: the schedule stamp is a column on the organization row that the erasure deletes; `deletion_audit` survives but carries no exercise date, no grace-period end, and **`deleted_by` NULL** — both production callers pass `deletedBy: null` | `apps/api/src/routes/account.ts`; `apps/api/src/services/identity-v2/deletion-v2.ts`; `apps/api/src/inngest/functions/account-deletion.ts` (both `executeDeletionV2` calls); `packages/database/src/schema/identity.ts` | 2026-08-05 |
| Self-service *export*: no durable application-layer record — route and service perform no write; the only application-layer trace is `requestLogger`, carrying method, path, status and latency and **no subject identifier** (production auth never sets `profileId` on the `user` object it reads). Platform-level logging and log retention were not examined and are not claimed | `apps/api/src/routes/account.ts`; `apps/api/src/services/identity-v2/export-v2.ts`; `apps/api/src/middleware/request-logger.ts`; `apps/api/src/middleware/auth.ts`; `apps/api/src/middleware/profile-scope.ts` | 2026-08-05 |
| Appointment effective date = `dpo@` activation + external test + signatures → notify Datatilsynet | [Action register P3](DPO%20exchanges/2026-07-26-action-register-tracker.md); DPO reply 2026-07-31 | 2026-08-05 |
| OPQ-102 Closed (2026-07-24); OPQ-167 Open; OPQ-106 Open; OPQ-24 Delegated | Cosmo Operator Queue, direct read | 2026-08-05 |
| Action 11 scope and recorded gap | [Action register, action 11](DPO%20exchanges/2026-07-26-action-register-tracker.md) | 2026-08-05 |
| Art 12(3) one month + two-month extension notified within the month; Art 12(4) refusal duty | GDPR Article 12 — statutory text, **not independently reviewed for this document** | — |

Anything above marked *unverified*, `[TODO …]`, or *proposed* is **not** established by this repository.

---

**Sign-off:** External DPO. ☐ Reviewed · Name: ____________ · Date: ________ · Controller adoption: ☐ · Review annually and on any change of channel, appointment status, or in-app rights surface.
