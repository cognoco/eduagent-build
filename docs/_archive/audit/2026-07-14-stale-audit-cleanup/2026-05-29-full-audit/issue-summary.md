This changes the frame entirely, and I think you've named the real problem. Let me give you my honest, senior read — including where I'd push back.

## First, reframe what this is

This is not a "last mile" and not a refactor — it's **re-pouring the identity/tenancy foundation while the rest of the app stands on it.** Account/user/org/role/profile is the bedrock that auth, consent, billing, scoping, and the entire authorization surface sit on. I'd retire the "last mile" language deliberately, because that framing is how this gets under-resourced and then half-done. Calling it what it is — a foundation re-platform — sets the right expectations for effort, risk, and sequencing.

The good news, which I'll keep coming back to: **you're pre-launch with no live users.** That is the single biggest thing in your favour and it should shape every decision below.

## The biggest risk isn't technical — it's that the target is still moving

You said the PM's vision "drifted," and the brain-dump was "10 minutes." Those two facts together are the thing I'd worry about most. If we re-pour the foundation to match the *current* vision and the vision drifts *again*, you rebuild the most expensive part of the system twice. The vision drifting once is evidence it can drift again.

**So my number-one recommendation: the first deliverable is a ratified target product definition + domain model — on paper, signed off — not code.** The brain-dump becomes a real spec that the PM commits to. That spec has to resolve the genuinely-open questions before anyone touches a table:

- Is a **User** 1:1 or 1:N with an Account? Can a User belong to multiple Organizations at launch, or is that the deferred bit?
- Is a **Profile** 1:1 with a User, or can one User have several?
- How does **consent/COPPA** re-express when a minor can have *their own login*? (This is the legally load-bearing one — see below.)
- How does **billing/subscription** re-map from account to organization?
- What does **invite/onboarding** actually look like for each role?

Until those are locked, everything downstream is building on sand. This is the gate.

## Pre-launch is your superpower — don't migrate, *cut*

With live users, this change would force the cautious playbook: expand/contract, dual-write, backfill, zero-downtime cutover, backwards-compat shims — months of work that exists *only* to avoid disrupting real data. **You have none of that constraint.** My strong recommendation: treat the existing identity tables as **disposable**. Define the target schema, build it clean, and either throw the old tables away or run a single one-shot transform of whatever seed/dev data is worth keeping. No flags, no dual model, no compatibility layer. Doing this surgery now versus six months post-launch is the difference between "a hard but bounded project" and "the thing that can sink the company." Use the window ruthlessly.

## What happens to the audit (where we started)

The audit doesn't die — it gets **re-triaged against the rewrite**:

- **Do the non-identity MUSTs now**, on the current code: the Logfire secret (ticking clock), the billing money-loss bugs, the dictation data-loss, the markdown sink. These are orthogonal to identity and close real risk regardless of the rewrite.
- **Fold the identity-coupled MUSTs (CL-B proxy-write, CL-C consent authority) *into* the rewrite.** Fixing them now on the current model is wasted — the new model should be **correct-by-construction** on exactly those invariants. The rewrite subsumes them. (This also vindicates keeping CL-C minimal earlier — but now even that minimal work is probably not worth doing standalone.)
- **Park the SHOULD/CONSIDER tail** until the dust settles.

So the rewrite *reprioritizes* the audit rather than competing with it.

## How I'd approach the rewiring (phased)

1. **Lock the target** — ratified domain model + product definition + ADR(s). Gate. (Human/PM decision; I can facilitate and write it, can't decide it.)
2. **Choose the cut strategy** — almost certainly clean replacement given pre-launch; decide what data, if any, survives.
3. **Rebuild the foundation + what it directly touches** — new schema, the authorization layer (roles replace the `isOwner`/`family_links`/co-parent scatter), invites/membership, **consent re-expressed**, **billing re-mapped**. Fold CL-B/CL-C here.
4. **Reconcile the rest of the app** — every `profileId` scoping site, the nav contract, the mobile surfaces — onto the new model.
5. **Re-baseline the docs and resume the audit tail** — PRD, ARCHITECTURE.md, CONTEXT.md brought back to truth.

## The landmines I'd flag now

- **Consent/COPPA is the sharp edge.** It's legally load-bearing and currently *assumes* the family-account model (parent consents by email for a managed minor). The moment a minor can have their own login, "who consents for whom, and how is a minor's own account gated" changes materially. This sub-area deserves dedicated design and probably a legal sanity-check — not "we'll wire it up as we go."
- **"While we're in here" is the project killer.** A foundation rewrite tempts a hundred adjacent improvements. Discipline: it changes identity/tenancy/roles and the *minimum* to make the app run on it — nothing else. In particular, hold your own line on **deferring the User/Profile split** even though it'll be tempting once you're elbow-deep.
- **The drift itself is a process failure, not just a data-model one.** The docs stopped describing the product and nobody caught it until now. The rewrite is the forcing function to re-establish a documented source of truth — but I'd also ask *why* it drifted silently, because the same gap will re-drift the new model unless something changes (doc ownership, a review cadence).
- **Don't freeze all momentum for months.** Pre-launch teams run on progress. Decide consciously what keeps moving (product surface work that's identity-agnostic) versus a deliberate, time-boxed freeze on the foundation.

## Concrete next step

I'd **formally stop the CL-C grill** — it's now clearly the wrong altitude — and pivot to the foundation work. The cleanest first concrete artifact, before any vision-lock session, is a **drift map**: I read the PRD and original ARCHITECTURE.md, compare them against (a) the current code/schema and (b) your brain-dump, and produce a precise "here's where *intent*, *docs*, and *code* disagree" document. That does three things at once: it quantifies how far the drift actually goes, it gives the PM something concrete to react to (much better than a blank-page vision session), and it becomes the input to the target-model spec.

Then the sequence is: **drift map → product-vision lock (PM-owned; `/office-hours`-style) → target domain model + ADR (`/grill-with-docs` at the *right* altitude this time) → cut-and-rebuild plan.**

My recommendation: let me produce the drift map first. It's bounded, it's high-value regardless of which way you jump, and we shouldn't design the target until we can see precisely how far we've moved from the last written-down truth. Want me to start there — and should I fold the audit re-triage (non-identity-now vs. fold-into-rewrite) into that same document, since it's the same analysis?
