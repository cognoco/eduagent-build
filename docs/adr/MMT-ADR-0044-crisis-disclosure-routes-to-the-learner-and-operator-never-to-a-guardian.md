# MMT-ADR-0044 — Crisis disclosure routes to the learner and to operators; no code path notifies a guardian

**Status:** Proposed · reconstructed 2026-07-30 · **Scope:** Safeguarding disclosure handling on every tutoring path; crisis telemetry · **Deciders:** pending Architecture sign-off · **Builds on:** MMT-ADR-0016 (safety and judge architecture)

## Context

A learner may disclose distress, self-harm ideation, bullying, abuse, neglect, or exploitation in the middle of an ordinary tutoring conversation. The system must decide what happens next, and one candidate action — notify the guardian — is the default assumption for a product used by minors.

That default is unsafe here, for a reason specific to the disclosure class. A meaningful share of safeguarding disclosures by a child concern harm occurring inside the home. Automatic guardian notification routes those disclosures directly to the person the child may be disclosing about. It does so silently, immediately, and on the basis of a machine's judgement about ambiguous natural language.

The two errors are not symmetric, and the asymmetry is what decides this.

Failing to notify a safe guardian delays adult involvement. That cost is real but bounded, and it is partly mitigated: the learner-facing response actively encourages the child to bring a trusted adult in, and the child retains the choice of *which* adult. Notifying an unsafe guardian exposes a child to the person harming them, at the exact moment the child reached out. That outcome is **one-way** — a notification cannot be recalled, the child's disclosure cannot be un-shared, and the child learns that reaching out produced exposure. There is no recovery path and no compensating control.

Detection is also not reliable enough to carry an automatic real-world action. Distinguishing genuine safeguarding concern from ordinary frustration, dark humour, or a discussion of a book's plot is exactly the judgement a deterministic keyword classifier gets wrong in both directions at high rates. A classifier's false positive here is not a spurious log line; under a notification design it is a real notification about a real child, sent wrongly.

## Decision

1. **No code path notifies a guardian in response to a crisis disclosure.** This holds for every session type, every audience, every tier, and every account shape. There is no configuration, flag, or escalation level that enables guardian notification.

2. **The system takes no third-party action; it addresses the learner.** The reply empathises briefly and redirects the learner toward a parent, guardian, or trusted adult, and toward a helpline where immediate help is needed. This is a *suggestion made to the child, who chooses whether and whom to tell* — categorically different from the system routing the disclosure to an adult on the child's behalf. The distinction is the decision: the child keeps agency over who learns what they said.

3. **The only server-side action is operator-facing telemetry.** A crisis-redirect event emits a reliable server log, a structured operator alarm, and a queryable telemetry event. The dispatch is non-blocking with respect to the learner's turn — a telemetry failure must never degrade the reply the child receives.

4. **Crisis telemetry is metadata-only.** It carries a correlation event id and profile-scoped pointers. It must never carry the disclosure text or raw identifying data about the minor. The operator alarm exists so the highest-stakes path is never silent; it does not exist to let an operator read what a child said.

5. **Detection is prompt-authored judgement, not a deterministic gate.** No app-owned keyword classifier decides whether a turn is a crisis, consistent with MMT-ADR-0016's rejection of denylist-based safety. The correct response to a possible disclosure is de-escalatory resources, which is safe to offer on a false positive; a gate is not.

6. **The reply and the structured signal must agree.** When the reply treats what the learner said as a safeguarding concern and steers them toward an adult or helpline for that reason, the crisis signal is set. Recognising the risk in the prose while leaving the signal false is a defect, not a judgement call — the signal is what makes the path observable at all. The signal is observational: it never alters what the learner is told.

7. **A legal duty, if established, is designed with counsel rather than pre-built.** Should a jurisdiction impose a mandatory-reporting obligation, the channel that satisfies it is designed with legal advice at that time. Building a reporting or notification channel speculatively is prohibited, because an unused notification path is an unused *risk*: it can be enabled by configuration error, and its existence invites reuse for the guardian case this ADR forecloses.

## Consequences

- The guardian-notification question is closed at the architecture layer, not left to each safeguarding feature. A future proposal to notify a guardian on disclosure is a request to supersede this ADR with an equivalently reasoned successor and explicit human Architecture sign-off — not a product configuration.
- Adult involvement depends on the child acting on the redirect. This is accepted, and it is the cost deliberately chosen over the one-way exposure risk.
- Operator alarms are the sole signal that the crisis path fired, so their reliability is safety-relevant infrastructure rather than observability polish. Silence on this path must mean "no disclosure", never "telemetry dropped".
- Because telemetry is metadata-only, an operator cannot triage individual disclosures by content. That is intended: the alarm reports that the path fired and how often, not what a child said.
- Prompt-authored detection means detection quality moves with prompt changes, which places crisis-path behaviour inside the scope of prompt-change validation rather than outside it.
- The absence of any notification channel is itself load-bearing. Introducing one for an adjacent purpose would create the mechanism this decision relies on not existing.

## Alternatives considered

- **Notify the guardian on detected crisis disclosure.** Rejected on the merits. In the failure mode where the guardian is the source of harm, notification delivers the child's disclosure to that person, irreversibly and without the child's knowledge or consent. No safeguard reduces this: the system cannot determine which guardians are safe, and the error is unrecoverable in the direction that matters most.
- **Notify the guardian, gated on a confidence threshold or a human review step.** Rejected: a threshold does not change the direction of the irreversible error, it only changes its frequency, and any human review queue would require operators to read minors' disclosures — creating a second serious exposure to solve the first.
- **Build the notification channel now and leave it disabled pending legal advice.** Rejected: a dormant notification path is a configuration mistake away from firing, and its presence makes the guardian case a toggle rather than a decision. If a legal duty arises, the channel is designed to that duty with counsel.
- **Use a deterministic classifier to decide when the crisis path fires.** Rejected: high false-positive and false-negative rates in both directions, and inconsistent with the judgement-based safety posture. Offering resources on an uncertain signal is safe; acting on one is not.
- **Say nothing to the learner and only alarm operators.** Rejected: it leaves a child who reached out with no response at the moment they reached out, which is the worst outcome for the majority case where the guardian or another trusted adult is safe.

## Links

- `apps/api/src/services/exchanges.ts` — `emitCrisisRedirectEvent`, the telemetry-only server action.
- `apps/api/src/services/exchange-prompts.ts` — the SAFETY block authoring the learner-facing redirect and the mandatory signal-binding rule.
- `docs/registers/safety-guards/master.md` — the safety-guard register row recording this guard, its enforcement point, and its code sites.
- `docs/compliance/edpb_dpia_filled_2026_v1.md` — the data-protection impact assessment entry for abuse/crisis-disclosure handling.
- `docs/plans/2026-07-10-mvp-roadmap/MVP-DEFINITION.md` — where the ruling was recorded and a conflicting guardian-notification wording was struck as superseded; historical context, not authority for this ADR.
- `docs/adr/MMT-ADR-0016-safety-and-judge-architecture.md` — judgement-based safety and the rejection of app-owned denylists.
