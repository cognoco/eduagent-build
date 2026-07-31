# dpo@zwizzly.com — Mailbox & Delivery-Log Setup

| | |
|---|---|
| Date | 2026-07-31 |
| Owner | Zuzana Kopečná |
| Implementer | Jørn |
| Ref | WI-2916 (dpo@ mailbox setup, P1) — DPO Interim Advice action register, item P1 |

## Why

We are appointing Stephan Hartmann as external DPO. Before the appointment can take effect, `dpo@zwizzly.com` must exist and work exactly as he specified (his ruling, 2026-07-30) — plus a delivery log that records that mail arrived, without recording what was in it (his Q1 ruling, 2026-07-31). No content should ever be visible or stored inside our tenant.

## 1. Mailbox: forwarding-only

Set up `dpo@zwizzly.com` as a **forwarding address**, not a mailbox.

- Configure it as a direct, confidential forward to Stephan Hartmann's professional email address: **[FILL: Stephan's forwarding address — not present in any repo doc; get this from Zuzana directly, do not guess]**.
- Do **not** create a shared/standalone M365 mailbox behind it. Mail must not sit in, or be readable from, anything inside our tenant.
- Do **not** add the address to any distribution group.
- Do **not** add a BCC rule or a journaling/compliance rule of any kind — nothing that would retain a copy of message content on our side. The content must reach Stephan first and only.

**Access controls:**
- Restrict administrative access to the forwarding rule to the **minimum number of named admins** (expect: Jørn + Zuzana only, unless there's a reason for a third).
- Any change to the forwarding configuration must be **logged** (who changed it, when, what changed — Microsoft 365 admin audit log is sufficient if enabled on the tenant).
- Enable **delivery-failure monitoring**: bounces/NDRs on this address must alert to a monitored internal address (not silently dropped). Apply the existing 3-working-day relay-chase rule — if a bounce isn't resolved within 3 working days, escalate to Zuzana.

## 2. Delivery log: metadata only, no content

Separately from the forward itself, keep a delivery log so we can prove mail arrived and when — without storing anything from the message body or subject.

**Fields (exactly these, nothing more):**
- Timestamp
- Delivery status (delivered / bounced / deferred)
- Unique message-id
- Sender address — **only where necessary** (don't log it by default if the message-id + timestamp already prove delivery; add it only where there's a real reason to)

**Explicitly excluded:**
- **No subject line.** Subject lines can carry substantive or special-category content (e.g. a data subject describing a health condition in their subject line) — do not capture it anywhere, including in ticketing or alerting tools.
- No message body, no attachments, no forwarded copy.

**Where it lives:**
- A CSV (or simple list) in a restricted Microsoft 365 SharePoint/OneDrive folder.
- Access restricted to **Jørn + Zuzana only** — no broader team access, no default tenant-admin visibility beyond what M365 requires.

**Retention:**
- 12 months, with auto-trim of rows older than 12 months (set a retention/expiration policy on the folder or a scheduled trim — don't rely on manual deletion).
- 12 months is our documented choice. A 6–24 month range is defensible if a different figure is operationally easier — flag it to Zuzana before deviating, don't just pick one.

**Out of scope for this log:** if a data subject rights request arrives at `dpo@`, it does **not** get logged here beyond the standard metadata row. It goes into a separate rights-request register (being built under DPO action-register item 11 / WI-2917) — that's a different workflow, not something to build now.

## 3. External test

Once the forward and the log are both live:

- Run a test email from an **external address** (not company-owned) to `dpo@zwizzly.com`.
- Stephan will participate in this test on his end (confirm receipt of the forward).
- Capture evidence: a screenshot of the received forward on Stephan's side (he'll need to send this back), plus a screenshot of the corresponding log row on our side.
- File both screenshots as evidence under `docs/compliance/evidence/`.

## 4. What to send back to Zuzana when done

A short written confirmation covering:
- Names of the admins with access to the forwarding configuration.
- The forwarding target address.
- Confirmation that delivery-failure monitoring is active and where alerts go.
- Where the delivery log lives (exact folder path/URL) and who has access.

This confirmation becomes part of the DPO appointment evidence package — the appointment's effective date is gated on this mailbox being live plus both appointment documents being signed, so treat this as blocking.

## Acceptance checklist

- [ ] `dpo@zwizzly.com` forwards directly and confidentially to Stephan's address — no shared mailbox created
- [ ] No BCC rule, no journaling rule, no content retained in our tenant
- [ ] Not a member of any distribution group
- [ ] Admin access to the forwarding rule limited to named admins (Jørn + Zuzana, unless otherwise agreed)
- [ ] Changes to the forwarding rule are logged (audit log enabled)
- [ ] Delivery-failure monitoring enabled, alerts route to a monitored internal address, 3-working-day chase rule in place
- [ ] Delivery log created with exactly: timestamp, delivery status, message-id, sender (only where necessary) — **no subject line, no body**
- [ ] Log stored in a restricted SharePoint/OneDrive folder, access limited to Jørn + Zuzana
- [ ] 12-month retention with auto-trim configured
- [ ] External test completed with Stephan, evidence (screenshots) captured and filed
- [ ] Written confirmation sent back to Zuzana (admins, forwarding target, monitoring, log location)
