# MentoMate — EU AI Act Article 50(2) Implementation Assessment

**Date:** 2026-07-31
**Status:** Draft v0.1 — for DPO review
**Author:** agent-drafted for management review
**Company:** ZWIZZLY AS, organisation number 811 696 072, Fiskekroken 3B, 0139 Oslo, Norway
**Owner:** Zuzana Kopečná, Chair of the Board, ZWIZZLY AS
**Parent record:** [`2026-07-30-eu-ai-act-classification-record.md`](2026-07-30-eu-ai-act-classification-record.md) §10.4
**Work item:** **WI-2915 — Article 50(2) scoping; priority P1. This document is that scoping.**
**Scope:** MentoMate application version **1.0.1**, family-only MVP, model set as recorded in the classification record §2.2

> **This document exists because the DPO refused the narrow scope we proposed.** Management asked
> (Q5, 2026-07-30) whether Article 50(2) could be scoped to exportable/shareable content only. His answer
> of 2026-07-31 was no: Article 50(1) and 50(2) are separate obligations, and the interactive chat stream
> stays inside the assessment rather than being excluded in advance. This document implements the six
> documentation points he required, one per section (§3–§8).
>
> **Not legal advice.** This is management's own assessment, prepared for the DPO's review. Under his Q3
> answer of 2026-07-31, review of Article 50 implementation is separately commissioned work, outside the
> retainer and outside the statutory DPO function.

---

## 1. The ruling this document implements

The DPO's answer to Q5, recorded in the correspondence log at
[`DPO exchanges/2026-07-26-action-register-tracker.md`](DPO%20exchanges/2026-07-26-action-register-tracker.md)
(entry `2026-07-31 ← Stephan`) and reproduced in the classification record §10.4:

- Article 50(1) and 50(2) are **separate obligations**. A visible AI-interaction disclosure does not by
  itself remove the machine-readable marking and detectability requirement for synthetic text.
- The assessment must cover **both** exportable/shareable content (including recap documents) **and**
  synthetic text displayed in the interactive chat. Identical technical measures need not apply to both.
- **Exportable content is an immediate and clearly applicable implementation item.**
- Before a final technical position, the Company must document six things: (i) all synthetic-output
  surfaces; (ii) whether ZWIZZLY qualifies as the relevant provider for each surface; (iii) what marking
  or provenance functionality the underlying model providers supply; (iv) the technical feasibility and
  current state of the art for chat-based text; (v) the proposed machine-readable mechanism for each
  applicable surface; and (vi) any specific exclusion or proportionality argument relied upon.
- The final position is then documented by reference to the Commission's Article 50 Guidelines, the
  applicable Code of Practice, and the system architecture.

### 1.1 Timing — why this is launch-blocking

Article 50 applies from **2 August 2026**. The transitional period to 2 December 2026 for the Article 50(2)
machine-readable-marking obligation is available **only to generative AI systems already placed on the
market before 2 August 2026**. MentoMate is pre-launch with zero users and will be placed on the market
after that date, so **no grace period applies and Article 50(2) binds in full from the moment of launch**
(classification record §10.4, §12). There is no window in which we can ship first and mark later.

### 1.2 Section map

| DPO's required point | Section |
|---|---|
| (i) All synthetic-output surfaces | §3 |
| (ii) Provider qualification per surface | §4 |
| (iii) Model-provider marking / provenance functionality | §5 |
| (iv) Technical feasibility and state of the art for chat text | §6 |
| (v) Proposed machine-readable mechanism per applicable surface | §7 |
| (vi) Exclusion / proportionality arguments relied upon | §8 |

§9 is the consolidated per-surface conclusion table. §10 lists every open and unverified item.

---

## 2. Method, and two definitions the assessment turns on

Every claim about product behaviour below was established by reading the current source at the cited
`file:line`. None is taken from a specification, a plan, an earlier compliance record, or memory. Where an
external fact — principally a vendor capability or the content of a legal instrument — is asserted from
secondary reporting rather than the primary text, it is marked **[VERIFY]**. Where a fact could not be
established at all it is marked **[OPEN]**.

**"Synthetic content" means content a model generated, not content a model touched.** MentoMate makes
roughly fifty distinct server-side LLM calls (enumerated by call site in §3.6). The large majority are
internal — classifiers, matchers, judges, extractors, graders — whose output is a structured decision
consumed by server code and never rendered as text to any person. Those are not synthetic-content
surfaces for Article 50(2) purposes, and listing them would bury the ones that are. §3 covers model
output that reaches a human as text.

**"Leaves the app boundary" changes the available technique, not the legal question.** Article 50(2) does
not turn on whether content is exported. The distinction is used here only because the feasible marking
techniques differ sharply between an artifact we generate (which may carry metadata) and a chat bubble
rendered inside our own UI (which cannot). The obligation is assessed for every surface; only the
mechanism differs.

---

## 3. Point (i) — Inventory of synthetic-output surfaces

### 3.1 Surfaces where model-generated text leaves the app boundary

| # | Surface | What model-generated content it carries | Recipient | How it leaves |
|---|---|---|---|---|
| **E1** | **GDPR data export** | The largest surface by a wide margin. The payload includes the **full session transcript**, with `ai_response` events carrying the mentor's raw generated text; **session summaries** (`aiFeedback`, `highlight`, `narrative`, `conversationPrompt`, `closingLine`, `learnerRecap`, `nextTopicReason`); **curriculum topics**; **topic notes** including mentor-drafted ones; **mentor notices**; **learning profiles**; **assessments** | Account owner (adult owner, or guardian for the account's profiles) | Web: `application/json` Blob downloaded as `mentomate-data-export.json`. Native: the whole JSON string through the OS share sheet |
| **E2** | **Mentor-memory export** | A plain-text document assembled from LLM-derived learner-profile fields: accommodation mode, learning style, interests, strengths, struggles, communication notes, hidden items | Guardian (about a child), or an adult owner about themselves | Web: `text/plain` Blob downloaded as `<name>-memory-summary.txt`. Native: OS share sheet |
| **E3** | **Progress-digest emails** (weekly, monthly) | **Curriculum topic titles only.** The surrounding prose is a static template; the LLM-written monthly highlights are *not* in the email | Guardian, by email (Resend) | Outbound email |
| **E4** | **Push notifications** | Two grades of model output inside otherwise-static template bodies: (a) **curriculum topic titles and subject names** interpolated as noun phrases; (b) in the struggle notifications, **the model's own free-text characterisation of what the child is struggling with** — the `topic` string the transcript-analysis LLM produces, interpolated verbatim into the body sent to the guardian | Learner or guardian, on device | Outbound push |
| **E5** | **Clipboard copy of the conversation prompt** | The LLM-generated parent conversation-starter for a session | Guardian, to anywhere they paste | `Clipboard.setStringAsync` |

**Evidence — E1.** Mobile `handleExport` at `apps/mobile/src/app/(app)/more/privacy.tsx:51-88`; JSON
serialisation at `:54`; web download at `:66-75`; `Share.share({message: jsonString})` at `:77-80`. Hook
`useExportData` calling `GET /account/export` at `apps/mobile/src/hooks/use-account.ts:104-114`; route at
`apps/api/src/routes/account.ts:291`. Payload shape `dataExportSchema` at
`packages/schemas/src/account.ts:771-821` — note `sessionEvents` at `:788`, `sessionSummaries` at `:789`,
`topicNotes` at `:818`, `mentorNotices` at `:819`, `learningProfiles` at `:810`. The session-event row
carries `eventType` including `'ai_response'` and `content: z.string()` at
`packages/schemas/src/account.ts:274-307`; the session-summary row carries every generated prose field at
`:320` onward. Assembly at `apps/api/src/services/export.ts:455-504`, with the payload's single existing
top-level metadata field `exportedAt` at `:503`.

**Evidence — E2.** Mobile `handleExport` at
`apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx:245-300`; web download at `:268-278`;
`Share.share({message: data.text})` at `:281-286`. API `GET /learner-profile/:profileId/export-text` at
`apps/api/src/routes/learner-profile.ts:95-110`, self-variant at `:82-94`. Document assembly in
`buildHumanReadableMemoryExport()` at `apps/api/src/services/learner-profile.ts:2369-2462`, returning
`sections.join('\n\n')` at `:2461`.

**Evidence — E3.** Formatters `formatWeeklyProgressEmail` at
`apps/api/src/services/notifications.ts:324-355` and `formatMonthlyProgressEmail` at `:362-390`;
watch-line construction at `:367-378`. The monthly body is the static string built at
`apps/api/src/inngest/functions/monthly-report-cron.ts:669` — the LLM highlights generated at `:468` are
stored, not mailed. The weekly `summaryLine` is a purely numeric template at
`apps/api/src/services/weekly-digest.ts:178-193`. The LLM-derived element is the topic names from
`listStruggleTopicNames` (`weekly-digest.ts:200`, `monthly-report-cron.ts:666`), which reads
`learning_profiles.struggles` — entries whose `topic` strings originate as the transcript-analysis
model's own free-text output (`apps/api/src/services/learner-profile.ts:401`, via the `routeAndCall` at
`:2339`), the same provenance as the E4 struggle notifications. Curriculum topic titles proper are
generated at `apps/api/src/services/curriculum.ts:137` (`flow: 'curriculum.generate'`).

**Evidence — E4.** Push bodies are static templates plus display names and counts —
`formatDailyReminderBody` at `apps/api/src/services/notifications.ts:258`, the consent notices at
`apps/api/src/inngest/functions/consent-revocation.ts:183/319/372/478`, the weekly push body
`childSummaries.join(' ')` at `apps/api/src/inngest/functions/weekly-progress-push.ts:731` (numeric, per
`weekly-digest.ts:178-193`). The exceptions that carry LLM-derived strings are
`formatReviewReminderBody(overdueCount, subjectNames)` at
`apps/api/src/inngest/functions/review-due-send.ts:142` (formatter at `notifications.ts:245`),
`formatRecallNudge(fadingCount, topTopicTitle, …)` at
`apps/api/src/inngest/functions/recall-nudge-send.ts:137-155`, and `notice.subjectName` in the title at
`apps/api/src/services/mentor-notices/nudge.ts:141`. The strongest E4 case is the struggle notifications:
`formatStruggleNotificationCopy(type, topic, childName)` at `apps/api/src/services/notifications.ts:495-519`
interpolates `topic` directly into the guardian-facing body (e.g. "It looks like ${name} is finding
${topic} challenging"). That `topic` is not a curriculum title — it is the free-text string the
transcript-analysis LLM emits, carried verbatim (only `.trim()`-ed) from the model's JSON output at
`apps/api/src/services/learner-profile.ts:401` (`topic: signal.topic.trim()`, produced by the
`routeAndCall` at `:2339`) through `sendStruggleNotification` (`notifications.ts:525`), dispatched from
`apps/api/src/inngest/functions/session-completed.ts:1833`. There is no re-templating or curation step
between the model's phrasing and the push body. The same LLM-derived struggle strings, persisted on
`learning_profiles.struggles`, are what `listStruggleTopicNames` reads for the E3 digest watch-lines.

**Evidence — E5.** `Clipboard.setStringAsync(session.conversationPrompt)` at
`apps/mobile/src/app/(app)/child/[profileId]/session/[sessionId].tsx:129-130`. `conversationPrompt` is
LLM-generated: `generateSessionInsights` at `apps/api/src/services/session-highlights.ts:243-268`
(`flow: 'session.highlights'`, prompt "Generate the parent recap JSON" at `:240`), persisted at
`apps/api/src/inngest/functions/session-completed.ts:1360/1456`, column at
`packages/database/src/schema/sessions.ts:257`.

### 3.2 Surfaces where model-generated text is displayed in-app only

| # | Surface | Content | Recipient | Evidence |
|---|---|---|---|---|
| **D1** | Interactive chat stream | Free-form mentor prose, streamed token-by-token | The learner themselves | Stream frames `{type:'chunk',content}` at `apps/api/src/services/session/session-stream-response.ts:234-235`; render surface `apps/mobile/src/components/session/ChatShell.tsx` |
| **D2** | Learner recap (end of session) | LLM-written recap prose plus a next-topic reason | The learner themselves | `generateLearnerRecap` at `apps/api/src/services/session-recap.ts:404-475` (`flow: 'session.recap'`) |
| **D3** | Monthly report highlights | LLM-written "warm monthly learning update for a parent" — highlights, next steps, an "equivalent" framing | Guardian, about a child | Generated `apps/api/src/services/monthly-report.ts:204-232`; stored `monthly-report-cron.ts:487`; read for render `apps/api/src/routes/progress.ts:185-211` |
| **D4** | Mentor-memory screen | The same learner-profile fields as E2, rendered in-app | Guardian, about a child; adult owner about themselves | `apps/mobile/src/app/(app)/child/[profileId]/mentor-memory.tsx` |
| **D5** | Drafted notes | Notes drafted by the mentor from a Challenge Round, stored alongside learner-authored notes | The learner themselves | Written with `artifactSource: 'challenge_drafted_note'` at `apps/api/src/services/session/session-exchange.ts:1562`; learner-quote artifacts at `:1532` |
| **D6** | Session summaries | `aiFeedback`, `highlight`, `narrative`, `conversationPrompt`, `closingLine`, `learnerRecap`, `nextTopicReason` | Learner and/or guardian by field | Columns at `packages/database/src/schema/sessions.ts:238-314` |
| **D7** | Curriculum content | LLM-generated subject / topic / book structure and titles | The learner themselves; titles also propagate to E3 and E4 | `apps/api/src/services/curriculum.ts:137`, `:212`; `apps/api/src/services/book-generation.ts:179` |

### 3.3 Negative findings

These were searched for across `apps/mobile/src` and `apps/api/src` and **do not exist** in version 1.0.1.
They are recorded because their absence is load-bearing for §7 — a PDF, for instance, would be squarely
markable by metadata and could not rely on the feasibility argument.

- **No PDF generation of any kind.** No `expo-print`, `printToFileAsync`, jsPDF, pdfkit or equivalent.
- **No filesystem writes of generated content.** `FileSystem.documentDirectory` appears only in a
  read-side image-URI allowlist at `apps/mobile/src/app/(app)/session/_hooks/_image-uri-allowlist.ts:60`.
- **No content-bearing `mailto:` flows.** The three `mailto:` links
  (`apps/mobile/src/app/(app)/more/help.tsx:18`, `apps/mobile/src/app/(app)/subscription.tsx:670`,
  `apps/mobile/src/app/(auth)/sign-in.tsx:607`) carry a fixed support address and subject only.

### 3.4 Surfaces excluded, with the reason

| Surface | Why excluded |
|---|---|
| **Invite message share** (`apps/mobile/src/components/home/ConnectSection.tsx`) | Static translated copy. No model output. Excluded on the same basis in classification record §10.4 |
| **Outbox clipboard copy** (`apps/mobile/src/components/durability/OutboxFailedBanner.tsx:70`) | Copies `entry.content` — the user's *own* failed outbound message. Human-authored |
| **Supporter encouragement chips** (`supporter_encouragement_chips.suggested_text`) | The column exists (`packages/database/src/schema/supporter-feed.ts:70-123`) and a policy guard exists (`apps/api/src/services/co-learning-prompt-policy.ts:57-86`), but **no route writes it** — a search of `apps/api/src/routes` returns no caller. Not user-reachable in 1.0.1. In scope the moment the supporter surface ships with LLM-suggested text (§8.3) |
| **Internal LLM calls** | Structured decisions consumed by server code; no text reaches a person. §3.6 |

### 3.5 Two characterisations the reviewer should test

**Subject names (E4).** Subjects originate from learner input, but LLM classification and resolution act
on them (`apps/api/src/services/subject-classify.ts:217/278`,
`apps/api/src/services/subject-resolve.ts:97`). **[OPEN — whether the *stored display string* that reaches
a notification is learner-typed or model-produced was not established. Treated as model-derived in this
assessment, which is the conservative reading.]** Topic titles, by contrast, are unambiguously
model-generated (`curriculum.ts:137`).

**Grouped surfaces.** `session-highlights`, `progress-summary`, `homework-summary` and `summaries` produce
prose that is displayed, and are treated as instances of D6 rather than as separate rows. If the reviewer
prefers them enumerated individually that is a presentational change, not a substantive one — the
mechanism conclusion is identical for all of them.

### 3.6 The internal-call boundary, stated explicitly

Listed so the reviewer can see §3.1–§3.2 is a deliberate subset rather than an oversight, and so any
future reviewer can re-derive it. Non-test call sites invoking `routeAndCall` / `routeAndStream`, all
under `apps/api/src/services/` or `apps/api/src/inngest/functions/`:

`post-session-suggestions.ts:184`, `challenge-round/grader.ts:171`, `dictation/generate.ts:213`,
`dictation/prepare-homework.ts:82`, `dictation/review.ts:220`, `learning-text-safety/judge.ts:298`,
`mentor-notices/recheck-judge.ts:256`, `policy-engine/judge-suitability.ts:61`,
`quiz/generate-round.ts:94`, `session/session-topic-matcher.ts:184`,
`session/topic-probe-extraction.ts:115`, `assessments.ts:301/365/696`, `book-generation.ts:179`,
`book-suggestion-generation.ts:114`, `curriculum.ts:137/212/2982`, `exchanges.ts:1966/2270`,
`filing.ts:346`, `graded-input-generation.ts:118`, `homework-summary.ts:310`, `language-detect.ts:68`,
`learner-input.ts:120`, `learner-profile.ts:2339`, `monthly-report.ts:232`, `ocr.ts:137/164`,
`parking-lot.ts:79`, `progress-summary.ts:238`, `recall-bridge.ts:99`, `retention-data.ts:391`,
`session-highlights.ts:255`, `session-llm-summary.ts:317`, `session-recap.ts:456`,
`subject-classify.ts:217/278`, `subject-resolve.ts:97`, `summaries.ts:160/272`,
`teach-back-grader.ts:119`, `vocabulary-extract.ts:67`.

Clear internal cases: `subject-classify`, `subject-resolve`, `language-detect`,
`topic-probe-extraction`, `session-topic-matcher` (classification); `challenge-round/grader`,
`policy-engine/judge-suitability`, `learning-text-safety/judge`, `mentor-notices/recheck-judge`,
`teach-back-grader` (evaluation); `retention-data:391` (spaced-repetition recall grading);
`vocabulary-extract`, `ocr` (extraction).

---

## 4. Point (ii) — Provider qualification per surface

### 4.1 The position, and the argument it forecloses

The classification record §2.3 sets out ZWIZZLY's role: **provider** of the MentoMate AI system, placed on
the market under our own name and trade mark; **deployer / downstream integrator only** in respect of the
third-party general-purpose models it calls. We neither develop nor market a general-purpose AI model.

Article 50(2) attaches to providers of AI systems, including general-purpose AI systems, generating
synthetic audio, image, video or text content. MentoMate is an AI system that generates synthetic text and
is placed on the EU market under our name. **ZWIZZLY is therefore the Article 50(2) provider for every
surface in §3, without exception.** There is no surface where the obligation could be said to sit only
with OpenAI, Anthropic, Mistral or Cerebras.

Stating this plainly forecloses an argument we might otherwise be tempted to make. Upstream model
providers carry their own Article 50(2) obligations for their own systems; that does not discharge ours
for ours. **[VERIFY — that upstream GPAI providers carry a parallel Article 50(2) obligation for
API-served text is asserted from secondary commentary rather than the consolidated text. Nothing here
depends on it: our obligation is independent either way.]**

### 4.2 Which upstream model serves which surface

Routing version 2 has been live in staging and production since 2026-07-11. The active set is
[`../registers/llm-models/master.md`](../registers/llm-models/master.md) → "Active set", reproduced in
classification record §2.2.

| Surface | Generating model | Provider · serving region |
|---|---|---|
| D1 chat stream — default, all tiers and ages | gpt-oss-120b `high` | Cerebras · US |
| D1 — EU-residency *or* Cerebras-unavailable branch, free tier | Mistral Small 4 | Mistral · EU |
| D1 — same branch, paid tiers | GPT-5 mini `low` | OpenAI · EU-residency deployment |
| D1 — deep-reasoning rungs, paid excluding Family tier | gpt-5.4 `medium` | OpenAI · EU-residency deployment |
| D1 — deep-reasoning rungs, Family tier | gpt-oss-120b `high` | Cerebras · US |
| D1 — deep-reasoning fallback | Sonnet 4.6 | Anthropic |
| **E1, E2, E3, E4, E5, D2, D3, D4, D5, D6, D7** — the async deep jobs (recaps, curriculum, assessment evaluation, session insights, learner-profile derivation) | gpt-oss-120b `high` | Cerebras · US |
| Judges and graders (no user-visible text; §3.6) | Sonnet 4.6, non-reasoning | Anthropic |

Google Gemini and Vertex are excluded from the routing set entirely (`FALLBACK_FORBIDDEN`), so no
MentoMate traffic reaches them. The exclusion is driven by Google's under-18 terms and is unrelated to
transparency — but it has a direct consequence for §5 and §6: **the one vendor with a shipped, documented
text-watermarking scheme is the one vendor we cannot use.**

**The single most consequential routing fact for this assessment:** every exportable surface (E1–E5) and
every guardian-visible generated surface is produced by **gpt-oss-120b served by Cerebras** — an
open-weight model on an inference host. An open-weight model carries no provider-side marking, and a host
serving someone else's weights is not positioned to add one. Whatever marking those surfaces receive, we
build.

---

## 5. Point (iii) — What the model providers actually offer for text

### 5.1 Position by provider

| Provider | Model(s) we use | Text marking / provenance offered on the API today |
|---|---|---|
| **Cerebras** | gpt-oss-120b | **None, and none available in principle.** Cerebras is an inference host serving an open-weight model it did not train. There is no provider-side watermark to inherit and no vendor-controlled generation-time signal to request |
| **OpenAI** | GPT-5 mini, gpt-5.4 | **No customer-accessible text watermark or provenance signal on the completions API** [VERIFY]. OpenAI applies C2PA Content Credentials to *image* output; management is aware of no text equivalent, and no such field is consumed anywhere in our code |
| **Anthropic** | Sonnet 4.6 | **None offered** [VERIFY]. Used only for the deep-reasoning fallback and for judges, so coverage would be partial even if one existed |
| **Mistral** | Mistral Small 4 | **None offered** [VERIFY] |
| *Google — excluded* | *—* | *SynthID-Text exists and is the state of the art for statistical text watermarking. Google is excluded from our routing set on unrelated compliance grounds, so it is unavailable to us. Recorded because it is the comparator §6 must address* |

### 5.2 What follows

**No provider in our active set offers any text-marking or provenance functionality we could adopt.** This
is not a procurement gap closable by choosing differently within the vetted set: the primary model is
open-weight on an inference host, and the two commercial vendors offer nothing for text. Any
machine-readable marking on any MentoMate surface must be constructed by ZWIZZLY at the application layer.

The three **[VERIFY]** entries should be closed by direct vendor enquiry before this document is final.
Management is aware of no such capability and none is consumed anywhere in the codebase — but "we are not
aware of it" is weaker than the DPO is entitled to, and the upgrade is cheap: Article 28 evidence requests
to Anthropic, Mistral and Cerebras are already outstanding (action-register actions 8–9, responses due
~2026-08-09), and an Article 50(2) marking question can ride on the same thread.

### 5.3 What we do have — provenance exists at generation time and is thrown away

Although no provider supplies a marking primitive, the routing layer **knows the provider and model for
every generated output at the moment of generation**: `RouteResult.provider` and `RouteResult.model` at
`apps/api/src/services/llm/types.ts:185-192`, and the streaming equivalent `StreamResult` at `:205-211`.

**That information is not persisted onto any content row.** Neither `session_events`
(`packages/database/src/schema/sessions.ts:182-236`) nor `session_summaries` (`:238-314`) carries a model,
provider, or generated-by column. The only model-named columns anywhere in the schema are the
`allowed_models` policy registry (`packages/database/src/schema/identity.ts:858-889`) and
`memory_dedup_decisions.model_version` (`packages/database/src/schema/memory-dedup-decisions.ts:25`);
neither is per-output provenance.

Two existing structures partially fill the gap, and both are worth the reviewer's attention because they
show the pattern is already native to the product rather than invented for compliance:

- **Notes carry an artifact-source discriminator.** `artifactSource` distinguishes
  `challenge_solid_quote` (the learner's own words, quoted), `challenge_drafted_note` (drafted by the
  mentor) and `learner_authored_note` (written by the learner) — defined at
  `packages/schemas/src/notes.ts:18-23`, persisted at `packages/database/src/schema/notes.ts:27`, with a
  parallel `noteOrigin` of `self` | `mentor` at `packages/schemas/src/notes.ts:7`.
- **The transcript already separates machine from human turns.** `session_events.eventType`
  distinguishes `ai_response` from `user_message` (`packages/database/src/schema/sessions.ts:200`), and
  that discriminator is carried into the GDPR export payload at
  `packages/schemas/src/account.ts:280-301`. Within E1, a recipient can therefore already tell
  machine-generated from human-authored records structurally. It is not signed, not standardised, and not
  interoperable with any external detector — but it is a real, existing, machine-readable distinction and
  it is the natural anchor for anything built on top.

There is also one existing top-level metadata slot on the export payload — `exportedAt`
(`packages/schemas/src/account.ts:820`, written at `apps/api/src/services/export.ts:503`) — which
demonstrates the payload already has a place for document-level assertions.

---

## 6. Point (iv) — Technical feasibility and state of the art for chat-based text

This is the section on which the chat stream's treatment turns, and the one most likely to be contested,
so the argument is set out in full rather than asserted.

### 6.1 What Article 50(2) demands of a technique

The second sentence of Article 50(2) qualifies the obligation: providers must ensure their technical
solutions are **effective, interoperable, robust and reliable** *as far as this is technically feasible*,
taking into account the specificities and limitations of various types of content, the costs of
implementation, and the generally acknowledged state of the art.

Those four criteria are conjunctive. A technique that is effective but not robust does not satisfy the
provision; nor does one that is robust but not interoperable. That matters, because each candidate
technique for plain text fails at least one of them.

### 6.2 The candidate techniques, assessed against interactive plain text

**Embedded file metadata — inapplicable.** Metadata provenance requires a container format with a metadata
channel: EXIF/XMP in an image, an ID3 frame, a PDF document-information dictionary. A chat message is a
UTF-8 string rendered into a view. There is no container and no channel. The Commission's Code of Practice
is reported to draw exactly this line, requiring metadata where the content format supports it — images,
audio, video, PDFs — and acknowledging that it does not apply to free-form text, which cannot carry it.
**[VERIFY — from secondary reporting of the final Code; confirm against the text.]**

**C2PA Content Credentials — inapplicable to the chat bubble, applicable to a file.** C2PA is a
manifest-and-signature scheme binding provenance assertions to an asset. Version 2.3, released January
2026, extended manifest support to plain-text documents among other formats **[VERIFY]**. That is a real
and recent change and it matters for §7: an exported `.txt` or `.json` artifact is no longer outside
C2PA's reach. It does not help the chat stream, because there is no asset — the content is a transient
token stream rendered into a scrolling view, never materialised as a file, never handed to any consumer
that could read a manifest.

**Statistical / generation-time watermarking — not available to us, and weak on this content even if it
were.** The state of the art is SynthID-Text: a logit processor that biases token selection through a
pseudorandom function, encoding a detectable statistical signature without perceptible change to output.
Two independent problems arise.

*Availability.* Statistical watermarking is applied **inside the generation loop, at logit level**. It is
a capability of whoever runs inference. We do not run inference — we call APIs. No provider in our active
set exposes such a capability (§5.1), and the one vendor whose scheme is production-grade is excluded from
our routing set. There is no configuration of vetted models under which we could switch this on.

*Efficacy even if available.* Detection aggregates token-level statistical evidence, so confidence scales
with length and short outputs supply too few observations for reliable detection. Mentoring chat turns are
short by design — the accommodation modes we ship actively instruct the model toward brevity ("Keep
explanations concise — 2-3 sentences max before checking understanding",
`apps/api/src/services/learner-profile.ts:2469-2477`). The technique is further degraded by paraphrase,
copy-paste editing and translation, and is least effective on constrained factual output, which is much of
what a mentoring product generates. **[VERIFY — the SynthID-Text limitations are drawn from published
research and vendor documentation; the characterisation is management's.]**

**Visible in-band text markers — not machine-readable in the required sense.** Appending "generated by an
AI mentor" to every chat turn is trivially implementable, and it is what §7 proposes for files. In the
chat stream it would be a *visible* disclosure, which Article 50(1) already discharges by a better means —
a persistent header rather than repeated per-message clutter. It would not be machine-readable marking: it
survives no copy-paste, carries no signature, is interoperable with no detector, and is defeated by
deleting one line. Presenting it as Article 50(2) compliance would be presenting a labelling measure as a
marking measure.

**Zero-width Unicode encoding — rejected, and the reasons should be on the record.** Interleaving
zero-width or homoglyph characters can carry a payload through plain text, and it is the technique a
reviewer might ask why we did not use. It is not interoperable: no standard detector reads it. It is not
robust: normalisation, re-encoding, or any copy through a sanitising surface destroys it. It is actively
harmful to this product's users — invisible characters injected into text read aloud by a screen reader,
or into text a learner pastes into homework, corrupt content for exactly the accessibility-dependent
learners the accommodation modes exist to serve. And it is adversarially indistinguishable from a known
prompt-injection and filter-evasion technique, which cuts against the input-sanitisation posture the
product already maintains.

### 6.3 Where that leaves the chat stream

For interactive plain-text chat there is, on the current state of the art, **no technique simultaneously
available to a downstream API integrator, effective, interoperable, robust and reliable.** Metadata has no
channel. C2PA has no asset. Statistical watermarking is a capability of the inference operator, which we
are not, and would be unreliable on short turns even if we were. Visible markers are not machine-readable.
Unicode steganography is neither interoperable nor robust, and harms users.

**This is not a resourcing argument and should not be read as one.** Every point above holds equally for a
company with unlimited engineering budget calling the same APIs. The constraint is architectural — we do
not control the decoder — and, on the short-form-text question, physical.

The Code of Practice is reported to reach a compatible conclusion from the opposite direction: that no
single marking technique currently satisfies all four Article 50(2) criteria, so providers should combine
metadata, watermarking and provenance mechanisms in layers; and that watermarking obligations carry an
exemption for very short text, reported as under 200 tokens **[VERIFY — both propositions are from
secondary reporting of the final Code and must be confirmed against its text]**. If that exemption is
correctly reported and applies per output rather than per system, a substantial share of MentoMate's chat
turns would fall inside it on length alone, independently of the feasibility argument. **We do not rely on
it as the primary argument, because we have not read the provision.**

---

## 7. Point (v) — Proposed mechanism per surface

### 7.1 E1 — GDPR data export: the surface with the strongest case for full marking

E1 is the largest synthetic-content artifact the product produces, and — unlike a chat bubble — it is
structured, self-describing, and generated entirely by us. JSON has a metadata channel; the payload
already has a top-level assertion slot (`exportedAt`); and the per-record `eventType` discriminator
already separates `ai_response` from `user_message`. This is the surface where a layered measure in the
Code of Practice's sense is genuinely achievable.

Proposed, in three layers:

1. **A document-level provenance object** alongside `exportedAt` in `dataExportSchema`
   (`packages/schemas/src/account.ts:771-821`, assembled at `apps/api/src/services/export.ts:503`):
   the generating system and application version, the export timestamp, an explicit statement that the
   payload contains AI-generated content, and an enumeration of which keys carry it. One schema addition
   and one assembly edit.
2. **A per-record AI-generated flag** on the record types that carry model output, promoting the existing
   implicit discriminators (`eventType === 'ai_response'`, `artifactSource`) to an explicit, uniform,
   documented field. This is what makes the export *detectable* record-by-record rather than only at the
   document level.
3. **A C2PA manifest over the exported artifact**, using the plain-text/document support added in C2PA 2.3
   **[VERIFY]**. This is the only layer that is genuinely *interoperable* — signed, tamper-evident, and
   readable by a general-purpose verifier rather than only by us. It requires a signing identity and a
   manifest-generation step in the export path, and is the substantial piece of work.

### 7.2 E2 — mentor-memory export: the same shape, a simpler artifact

Single assembly point (`buildHumanReadableMemoryExport()` at
`apps/api/src/services/learner-profile.ts:2369-2462`, returning `sections.join('\n\n')` at `:2461`) and
two delivery paths. Proposed: a structured, machine-parseable provenance header or footer appended at
`:2461` — naming the generating system, application version, generation timestamp, and the AI-generated
status — plus the same C2PA layer as E1 layer 3. The provenance block is simultaneously human-readable,
which serves Article 50(1) on a surface that today carries no disclosure at all.

**[OPEN — whether C2PA 2.3 plain-text support is embedded or sidecar-only determines whether the C2PA
layer is achievable on the web download path. A sidecar the browser download does not carry gives the
recipient no practical provenance. This must be resolved against the specification before the work is
scoped.]** On the native share path the OS share sheet passes a *string*, not a file, so the C2PA layer
may be unreachable there regardless and the in-band provenance block carries the surface alone. The same
caveat applies to E1's native path.

### 7.3 E3, E4 — digest emails and push notifications: narrow, and arguably removable

The LLM-generated content leaving by these channels is narrow but not uniform. Most of it is **curriculum
topic titles and subject names** — short noun phrases embedded in otherwise wholly static templates — and
the monthly email does not contain the LLM-written highlights at all. The exception is the **struggle
content**: the push bodies (`formatStruggleNotificationCopy`) and the digest watch-lines both interpolate
the transcript-analysis model's own free-text characterisation of what the child is struggling with,
verbatim (§3.1, Evidence — E4). That is genuine model-authored prose about a child delivered to a
guardian's lock screen, not a reused title, and it is the element for which the removal-or-rewording
option below carries the most weight.

Proposed: a standing footer on both digest emails stating that topic names shown are generated by the AI
mentor, plus — if adopted — a structured provenance header, email being a format with a metadata channel.
Push notifications have no metadata channel and no room for a footer; the honest position there is that
the marking obligation, if it bites on a three-word topic title inside a template, is discharged by the
in-app disclosure rather than by marking the notification.

**The stronger position on both may be removal rather than marking.** If the watch-line's value does not
depend on the exact generated title, and the recall nudge's value does not depend on naming the specific
topic, the LLM-derived element can be dropped from the outbound body and these surfaces leave the
inventory. That is a product decision, not a compliance one, and it is raised here because it is cheaper
and cleaner than the alternative.

### 7.4 E5 — clipboard copy of the conversation prompt

A guardian copies an AI-generated conversation starter to the clipboard and pastes it anywhere. There is
no artifact and no metadata channel — the clipboard carries a bare string. The only available measure is
to prepend or append an in-band attribution to the copied string, which is a visible label, not
machine-readable marking (§6.2).

Proposed: append a short attribution to the copied text, and record the surface as one where marking is
not feasible for the same reasons as D1. Note that this surface today carries **no** indication at all
that the prompt was AI-generated, so the attribution is worth adding on Article 50(1) grounds
independently of the marking question.

### 7.5 D1 — chat stream: no marking; the Article 50(1) disclosure carries the surface

Per §6, no available technique satisfies Article 50(2)'s four criteria for interactive plain-text chat.
The proposal is therefore **no machine-readable marking on the chat stream**, with §8.1 as the recorded
basis and the following as the mitigation actually in place:

- The persistent, non-dismissible AI disclosure rendered in the chat header for the whole session —
  `apps/mobile/src/components/session/ChatShell.tsx:906-924`, `testID="chat-ai-disclosure"` at `:911`,
  exposed to screen-reader users via `accessibilityLabel` at `:909`, copy at
  `apps/mobile/src/i18n/locales/en.json:893` ("You're talking to an AI mentor"), localised across all
  seven shipped UI locales.
- Disclosure at consent (`apps/mobile/src/i18n/locales/en.json:3066`), in the Terms — section
  "5. AI-Generated Content" (`en.json:2067-2068`) — and in the privacy policy (`en.json:2026`).

Two things this does **not** claim. It does not claim Article 50(1) discharges Article 50(2); the DPO has
ruled they are separate and this document accepts that. It claims only that where marking is infeasible,
the transparency interest is not left unserved. And it does not claim permanence: §8.3 records the
conditions that reopen it.

One measure is worth building even though it is not itself marking: **persisting generation provenance
server-side** for chat turns as well as exports (§7.1 layer 1 depends on it). It costs a column and a
write; it makes later retro-marking or a provenance response to a data subject possible; and it is the
difference between "we could not mark" and "we could not mark and we kept no record either".

### 7.6 D2–D7 — in-app displayed content

These are plain text rendered inside our own UI. The mechanism analysis is D1's: no container, no asset,
no decoder control. Three warrant a distinct note:

- **D3 monthly highlights** and **D4 mentor-memory screen** are guardian-facing content *about a child*,
  generated by AI, and neither carries any AI disclosure today. Whatever the Article 50(2) conclusion, a
  visible "generated by the AI mentor" label is warranted on Article 50(1) grounds and is cheap. It should
  not wait for the marking question to resolve.
- **D5 drafted notes** already carry a machine-readable discriminator in the data model (§5.3). Surfacing
  it as a visible marker in the notes UI is small work with a real transparency payoff: a learner
  currently cannot tell a note they wrote from one the mentor drafted.

### 7.7 Resulting engineering work, described (no work items created)

| # | Work | Surfaces | Size |
|---|---|---|---|
| W1 | Persist `RouteResult.provider` / `.model` against generated content rows | All | Medium — schema migration plus write-path changes at each generating call site |
| W2 | Document-level provenance object plus per-record AI-generated flags in the GDPR export payload | E1 | Small–medium — schema addition, one assembly edit, per-record flag plumbing |
| W3 | Structured provenance block appended to the mentor-memory export body | E2 | Small — one assembly point |
| W4 | C2PA manifest generation and signing identity for the exported artifacts | E1, E2 | **Large** — new dependency, key management, and the open feasibility question in §7.2 |
| W5 | Provenance footer/header on the digest emails — or removal/server-side re-templating of the LLM-derived elements (topic titles; verbatim struggle phrases) in outbound email and push bodies | E3, E4 | Small |
| W6 | In-band attribution appended to the copied conversation prompt | E5 | Small |
| W7 | Visible AI-generated labels on the guardian-facing generated surfaces | D3, D4 | Small |
| W8 | Surface the existing `artifactSource` discriminator as a visible marker in the notes UI | D5 | Small |
| W9 | Close the §10.1 open items and re-run this assessment against the result | — | Small |

W1, W2, W3, W5, W6, W7, W8 and W9 are launch-scoped without difficulty. **W4 carries the schedule risk**,
and it is the item that most directly answers the DPO's "immediate and clearly applicable implementation
item". If W4 cannot land before launch, the fallback is W1+W2+W3 as an interim position with W4 tracked to
a date — but that is a position the DPO should be asked to accept explicitly, not one we adopt by default
(§10.3, question 3).

---

## 8. Point (vi) — Exclusion and proportionality arguments relied upon

Each argument is stated so the reviewer can test it. All are subject to the same reservation, which the
DPO's ruling requires and which is repeated rather than assumed: **[OPEN — final position to be checked
against the Commission's Article 50 Guidelines and the applicable Code of Practice per the DPO's ruling of
2026-07-31.]**

### 8.1 D1 chat stream, D2–D7 in-app text, E4 push, E5 clipboard — technical feasibility and state of the art

**Relied on:** the Article 50(2) second-sentence qualifiers — technical feasibility, the specificities and
limitations of the content type, and the generally acknowledged state of the art.

**The argument.** The marking obligation is qualified by feasibility, and for interactive or unstructured
plain text no technique available to a downstream API integrator satisfies the four criteria (§6.2). The
constraint is architectural: we do not operate the decoder, so the only technique that could work on plain
text — generation-time statistical watermarking — is not ours to apply, and no provider in our vetted set
exposes it (§5.1). The one production-grade scheme belongs to a vendor excluded from our routing set on
unrelated compliance grounds. For E4 and E5 the same holds for a second, simpler reason: a push
notification and a clipboard string have no metadata channel at all.

**Cost is a subordinate argument and is deliberately not led with.** We are a pre-launch company and the
cost of a bespoke marking scheme is material to us, but a cost argument is weak where the measure is
possible and strong only where it is not. We rely on feasibility first. Cost is relevant to the *choice
between* feasible layers at E1 and E2, not to the chat stream's exclusion.

**What would defeat this argument:** a provider in our active set shipping an API-level text-marking
capability; a change in the state of the art making short-form text marking reliable; or a determination
in the Guidelines or the Code that a measure we have characterised as not-machine-readable — a visible
marker, say — is accepted as sufficient. Each is live, which is why §8.3 exists.

**Supporting, not load-bearing:** the Code of Practice is reported to acknowledge that no single technique
meets all four criteria, and to exempt very short text (reported: under 200 tokens) from watermarking
**[VERIFY]**. If confirmed, both support this position. Neither is relied on, because neither has been
read in the original.

### 8.2 Surfaces excluded from the inventory entirely

**Static translated copy** — the invite message — engages Article 50(2) not at all: no model generated it.
This is a scope point, not a proportionality argument. The same applies to the outbox clipboard copy,
which carries the user's own text.

**Internal LLM calls** (§3.6) produce structured decisions consumed by server code, not content presented
to a person. Article 50(2) governs *content* generated by the system; a classification label or boolean
that never surfaces as text is not synthetic content within the provision's purpose. **[OPEN — this
boundary is management's reading. If the Guidelines take a broader view of "generates synthetic text",
these would need re-examination, though most produce no natural-language output at all.]**

**Supporter encouragement chips** are excluded on the factual basis that no code path writes them in
version 1.0.1 (§3.4). The exclusion expires the moment the supporter surface ships.

### 8.3 Conditions that reopen the position

§8.1 is a point-in-time assessment of the state of the art, and the DPO should be able to see what would
change it. Any of the following requires this assessment to be re-run:

1. Any provider in the active routing set exposing a text-marking or provenance capability on its API.
2. A material change to the model set — already a reassessment trigger under classification record §7,
   trigger 6 — that brings in a provider offering one.
3. Publication of the Commission's Article 50 Guidelines, or a reading of the Code of Practice, treating a
   measure available to us as sufficient.
4. ZWIZZLY signing the Code of Practice, which would bind us to its measures directly.
5. **Any new surface that materialises generated text as a file or document** — a PDF report, a printable
   recap, a downloadable transcript. None exists today (§3.3), and any such surface inherits E1's
   treatment, not D1's, because a document has a metadata channel and the feasibility argument does not
   reach it.
6. The supporter surface shipping with LLM-generated suggested text.

---

## 9. Per-surface conclusion

| # | Surface | Leaves app? | Marking proposed | Basis |
|---|---|---|---|---|
| **E1** | GDPR data export (JSON) | Yes — file download / share sheet | **Yes, full** — document provenance + per-record flags (W2), C2PA manifest (W4), persisted provenance (W1) | Structured artifact with a metadata channel; largest synthetic-content payload; the DPO's immediate implementation item |
| **E2** | Mentor-memory export (`.txt`) | Yes — file download / share sheet | **Yes** — provenance block (W3), C2PA manifest (W4), persisted provenance (W1) | Generated document; single assembly point; C2PA plain-text support exists [VERIFY] |
| **E3** | Weekly / monthly digest emails | Yes — email | **Yes, narrow** — provenance footer (W5), or remove the generated element from the body | LLM-derived elements are topic titles and model-authored struggle phrases (same provenance as E4); email carries a metadata channel |
| **E4** | Push notifications | Yes — push | **No** — no metadata channel; §8.1 | Carries topic/subject names AND, in struggle notifications, the model's verbatim free-text phrasing; removal or server-side re-templating is the cleaner option (W5) |
| **E5** | Clipboard copy of conversation prompt | Yes — clipboard | **No marking**; in-band attribution proposed (W6) | Bare string, no channel; §8.1 |
| **D1** | Interactive chat stream | No | **No** — not feasible per state of the art | §6; mitigated by the Art 50(1) disclosure at `ChatShell.tsx:906-924`; provenance persisted (W1) |
| **D2** | Learner recap | No | **No** — same basis as D1 | §6 |
| **D3** | Monthly report highlights | No | **No marking**; visible AI label proposed (W7) | §6; guardian-facing and currently undisclosed |
| **D4** | Mentor-memory screen | No | **No marking**; visible AI label proposed (W7) | §6; same content as E2 but not exported |
| **D5** | Drafted notes | No | **No marking**; surface the existing `artifactSource` discriminator (W8) | §6; provenance already in the data model |
| **D6** | Session summaries | No | **No** — same basis as D1 | §6 |
| **D7** | Curriculum content | No in-app (titles leave via E3, E4) | **No** in-app; addressed where it leaves | §6 |
| — | Invite message share | Yes | **N/A** | Not model-generated |
| — | Outbox clipboard copy | Yes | **N/A** | User's own text |
| — | Supporter encouragement chips | No | **N/A** in v1.0.1 | No code path writes them; expires when the surface ships |
| — | Internal LLM calls (§3.6) | No | **N/A** | Structured decisions, not presented content |
| — | PDF / filesystem / `mailto:` content paths | — | **N/A** | Do not exist (§3.3) |

---

## 10. Open and unverified items

### 10.1 [OPEN] — facts not established, blocking a final position

| # | Item | Why it matters |
|---|---|---|
| O1 | Whether C2PA 2.3 plain-text/document support is embedded or sidecar-only | Determines whether W4 is achievable on the web download path, and whether it is reachable at all on the native share path (§7.2) |
| O2 | Whether the subject-name string reaching a push notification is learner-typed or model-produced (§3.5) | Determines whether E4 carries model output at all, or only topic titles |
| O3 | Whether the "internal decisions are not synthetic content" boundary (§8.2) holds under the Guidelines | Would expand the inventory materially |
| O4 | Whether W4 can land before launch, and if not whether an interim W1+W2+W3 position is acceptable | Schedule risk on the one item the DPO called immediate |
| O5 | Final position on every exclusion, against the Commission's Article 50 Guidelines and the Code of Practice | Required by the ruling; the Guidelines are not yet published [VERIFY] |

### 10.2 [VERIFY] — asserted from secondary sources, needing primary confirmation

| # | Item |
|---|---|
| V1 | That OpenAI offers no customer-accessible text watermarking or provenance signal on the completions API |
| V2 | That Anthropic offers none |
| V3 | That Mistral offers none |
| V4 | That the Code of Practice requires metadata only where the format supports it, and treats free-form text as unable to carry it |
| V5 | That the Code exempts very short text — reported as under 200 tokens — from watermarking, and whether that threshold is per output or per system |
| V6 | That the Code states no single technique satisfies all four Article 50(2) criteria and recommends layering metadata, watermarking and provenance mechanisms |
| V7 | That C2PA 2.3 (January 2026) added plain-text-document manifest support, and on what terms |
| V8 | That the Commission's Article 50 Guidelines are not yet published as at the drafting date |
| V9 | That upstream GPAI providers carry a parallel Article 50(2) obligation for API-served text (not load-bearing — §4.1) |
| V10 | The SynthID-Text limitation profile relied on in §6.2 (short-text weakness, paraphrase and translation fragility, reduced efficacy on constrained factual output) |

V1–V3 can ride on the Article 28 evidence requests already outstanding with Anthropic, Mistral and
Cerebras (action-register actions 8–9, responses due ~2026-08-09). V4–V8 require reading the primary
instruments: the Code of Practice on Transparency of AI-generated Content (final text published
10 June 2026) and the C2PA 2.3 specification.

### 10.3 Questions for the DPO

1. Does he accept the §8.1 feasibility argument as the basis for not marking the interactive chat stream
   and the in-app displayed surfaces, subject to the §8.3 reopening conditions?
2. Does he accept the §8.2 boundary excluding internal classifier and judge outputs?
3. Is an interim position on the exportable artifacts acceptable — W1+W2+W3 at launch, with the C2PA
   manifest (W4) tracked to a date — if C2PA generation cannot land before 2 August 2026? And does he
   regard W4 as strictly required, or as the stronger of two adequate options?
4. For E3/E4, does he regard **removing or re-templating** the LLM-derived elements in outbound email and
   push — the topic titles, and in particular the verbatim model-authored struggle phrasing (§7.3) — as a
   cleaner discharge than marking them? That is our own preference and it is cheaper, but it changes
   product behaviour, so we would rather have his view than assume it.
5. Should ZWIZZLY sign the Code of Practice on Transparency of AI-generated Content? Signature would
   confer the presumption-of-compliance benefit and bind us to the Code's measures; it also has to be
   assessed against what those measures cost a company of our size.

---

## 11. Change log

| Version | Date | Change | Author |
|---|---|---|---|
| v0.1 | 2026-07-31 | Initial assessment. Implements the DPO's six documentation points from his Q5 answer of 2026-07-31 (classification record §10.4). Surface inventory established by source inspection of application version 1.0.1. | agent-drafted for management review |

---

## 12. Related records

| Record | Relationship |
|---|---|
| [`2026-07-30-eu-ai-act-classification-record.md`](2026-07-30-eu-ai-act-classification-record.md) | Parent record. §10.4 states the ruling this document implements; §2.2 the model set; §7 the reassessment triggers; §12 the timing |
| [`DPO exchanges/2026-07-26-action-register-tracker.md`](DPO%20exchanges/2026-07-26-action-register-tracker.md) | Correspondence log. The 2026-07-31 entry carries the Q5 ruling; actions 8–9 carry the vendor evidence requests that can close V1–V3 |
| [`2026-07-30-ai-act-art4-ai-literacy-note.md`](2026-07-30-ai-act-art4-ai-literacy-note.md) | Sibling Article 4 obligation under classification record §10 |
| [`2026-07-30-ai-act-art5-prohibited-practices-check.md`](2026-07-30-ai-act-art5-prohibited-practices-check.md) | Sibling Article 5 obligation under classification record §10 |
| [`../registers/llm-models/master.md`](../registers/llm-models/master.md) | The active model set and provider exclusions underlying §4.2 |
