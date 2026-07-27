# Relay — Private Life Administration Copilot

> **Exploratory product brief — 18 July 2026.** Working title only. This is not MentoMate canon, roadmap, or an approved build commitment.

## Product in one sentence

Relay turns letters, emails, documents, screenshots, and spoken concerns into source-backed actions, deadlines, and controlled requests for help—without requiring people to share their entire account or surrender decisions to AI.

## The problem

Personal administration is fragmented across inboxes, paper, portals, calendars, messaging threads, and memory. A school form, tenancy notice, utility renewal, travel requirement, or government letter may create several steps and a deadline. The burden usually falls on one person who must understand it, remember what comes next, and coordinate everyone else.

Existing tools solve fragments. Task managers require the user to structure the work first. Document stores preserve files but not obligations. General AI assistants may explain a document, but lose the ongoing case, cannot safely involve another person, and provide weak evidence. Shared accounts and forwarded messages expose too much and blur responsibility.

The result is missed deadlines, repeated work, anxiety, and unsafe informal access. The underlying need is not “better chat.” It is a trustworthy system that converts incoming administration into an understandable, accountable process.

## Initial customer and wedge

The first customer is an adult managing a busy household, alone or with a trusted supporter. The strongest initial situations are document-heavy and non-clinical:

- school and childcare administration;
- housing, utilities, insurance administration, and moving;
- travel documents and renewals;
- subscriptions, warranties, and household services;
- ordinary government correspondence and form preparation.

The buyer is the household organizer. Other users include partners, adult children helping parents, relatives helping newcomers, and assistants invited into narrowly defined matters. Relay starts consumer-first, with one household subscription and controlled supporter access.

## Core promise

Relay answers five questions for every item:

1. What is this?
2. What does it require?
3. When must something happen?
4. Who is responsible for the next step?
5. Where did that conclusion come from?

The user can always inspect the source, edit the interpretation, reject a proposed action, complete it personally, or share only the relevant matter with a named supporter.

## Core experience

A user photographs a letter, uploads a file, forwards a message, or speaks a concern. Relay proposes a plain-language action card with the deadline, required materials, responsible person, confidence, and highlighted evidence.

Nothing becomes an obligation silently. The user confirms or edits the proposal. Confirmed actions enter a **Now / Waiting / Done** flow. Relay schedules reminders and proposes the next step. It can draft replies or checklists, but sending, submitting, paying, or sharing requires explicit human action.

When help is needed, the user invites a trusted person to that matter only. The interface states whose space is active and what access the supporter has. The owner can revoke access, review activity, export the matter, or delete it.

## Product principles

- **Evidence before confidence.** Every extracted obligation or deadline points to the source passage that supports it.
- **Human confirmation at consequence boundaries.** AI may explain, extract, organize, and draft; people approve commitments and external actions.
- **Share the matter, not the account.** Support is permissioned, scoped, visible, and revocable.
- **Plain language, reversible actions.** Users can understand what happened and undo internal changes.
- **Quiet persistence.** Relay remembers deadlines and waiting states without creating a surveillance feed or constant notification pressure.
- **No false authority.** Relay distinguishes administrative assistance from legal, financial, or professional advice.

---

## Minimum viable product

The first release contains five capabilities:

### 1. Secure intake

Capture photos, files, forwarded email, pasted text, and voice. Preserve the original and its intake history.

### 2. Source-backed interpretation

Explain the item and propose actions, deadlines, required materials, and owners. Show evidence beside consequential extractions; flag uncertainty rather than guessing.

### 3. Personal administration queue

Organize confirmed actions into Now, Waiting, and Done, with reminders, expected-response dates, and activity history. Make the next action obvious without becoming a project-management suite.

### 4. Trusted-circle collaboration

Invite someone to a specific matter, request an action, discuss it, and revoke access. Supporters never impersonate the owner.

### 5. Assisted response

Generate editable, source-grounded checklists, summaries, and response drafts. External submission, payment, signature, and disclosure remain outside the initial product.

## Explicit non-goals for the first release

- Generic open-ended AI companionship or a universal chatbot.
- Health records, diagnosis, treatment coordination, or inferred health data.
- Legal or financial recommendations and autonomous eligibility decisions.
- Automatic sending, form submission, purchasing, payments, or account login on the user’s behalf.
- Whole-inbox ingestion or indefinite storage by default.
- Business workflow customization, team administration, or a horizontal platform offering.

## Differentiation

Relay combines durable context, trustworthy AI output, and relationship-aware permissions. A task manager starts after interpretation; a document assistant usually ends after an answer. Relay maintains the thread from source to resolution while allowing help without broad account access.

The product should compete on relief and trust, not on the apparent intelligence of a chat response. The defensible asset is a structured history of source-backed matters, actions, permissions, and outcomes that becomes more useful over time without becoming opaque.

## Business model

Use a household subscription with a meaningful free trial or limited free tier. The paid plan includes additional active matters, document processing, longer history, advanced reminders, and several trusted supporters. Supporters should not need their own paid plan to help an invited household; charging every collaborator would suppress the product’s central network behavior.

Longer term, a separate professional-support tier could serve relocation advisers, independent assistants, or community organizations, but it should not shape the first consumer product.

## Why the inherited foundation matters

The reusable technical spine already covers native capture, authentication, supporter relationships, scoped access, consent and revocation, durable workflows, notifications, subscriptions, structured AI responses, model routing, auditability, export, and deletion.

The correct reuse strategy is to preserve those neutral capabilities while removing the learning-domain screens, terminology, and data model. Relay should begin as one opinionated vertical product, not as a generic platform refactor. Infrastructure is valuable only where it shortens the path to the source-to-action-to-support loop.

## Validation and success measures

Before a broad build, test clickable flows and concierge processing of synthetic or deliberately redacted documents. Validate three assumptions:

1. Users trust source-linked extraction enough to confirm actions.
2. They return to manage waiting states rather than treating Relay as a one-use document explainer.
3. Scoped supporter access solves a real coordination problem that forwarding a message does not.

Measure time from intake to confirmed action, return rate for waiting matters, supporter-assisted completion, AI correction rate, missed deadlines, and deletion or revocation reliability. A successful pilot demonstrates repeated completion and reduced coordination effort—not merely uploads or chat engagement.

## Primary risks

The largest product risk is insufficient repeat frequency: users may value explanation but not need a persistent system. The largest trust risk is a confidently wrong deadline or obligation. The largest scope risk is drifting into regulated advice or accumulating sensitive documents without a clear retention purpose. The MVP must therefore prove recurring workflow value, keep evidence visible, require confirmation, minimize retained data, and maintain explicit boundaries around excluded domains.

## Product thesis

Important personal administration should not depend on one overwhelmed person remembering everything. Getting help should not require giving someone access to everything. Relay succeeds if it makes the next step clear, preserves why that step exists, and lets the right person help with exactly the right amount of access.
