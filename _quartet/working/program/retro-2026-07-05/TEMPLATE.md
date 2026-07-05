# Findings — <host> / <role> / <lane or scope>

Session span: <start ISO> → <end ISO or "still live">
Agent: <orchestrator | shepherd | reviewer | other>, model/harness if known.
Keep every section telegraphic — bullets, timestamps, IDs. No prose essays.

## 1. Incident timeline

Every stall, death, restart, or lost message you experienced or caused.
One line each: `<UTC time> — <what> — <how detected> — <how recovered / not>`.

## 2. Comms losses

Messages/handoffs that were sent but never actioned, or expected but never
arrived (orchestrator↔shepherd, orchestrator↔PM, agent↔operator). Include
channel used (row comment / lane inbox / outbox / session chat) and why you
think it was lost.

## 3. Rulings & operator-action backlog

Every point where you halted for a decision or an operator action (API key,
deploy approval, device run, restart). For each: what was blocked, how long,
whether the ask was within someone's existing remit (be honest — could you
have ruled it yourself under standing directives?).

## 4. Token / rate-limit events

Windows you hit or suspect. Effect on you and on sessions under you. Anything
you retried in a loop or re-generated that burned budget without output.

## 5. Root-cause hypotheses (H1–H5 in README)

For each of H1–H5: supporting evidence, contradicting evidence, or "no data".
H4 especially: name any Quartet/Cosmo/ZDX behavior that CHANGED under you in
the last ~72h (skill version, protocol step, template, gate) and whether it
helped or hurt.

## 6. What would have saved you

Top 3 concrete mechanisms that would have prevented or auto-recovered your
worst incident (e.g. supervisor watchdog, heartbeat convention, resume file,
smaller lane count, precedent register). Rank them.

## 7. Keep / kill / fix

- KEEP: what worked well and must survive the reboot.
- KILL: what actively hurt.
- FIX: what's right in spirit but wrong in mechanics — with the one-line fix.
