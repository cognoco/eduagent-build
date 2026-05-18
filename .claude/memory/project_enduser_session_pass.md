---
name: End-user LLM session pass
description: Use when validating live tutoring conversation quality without the emulator.
type: project
---

The repo has a durable direct API runner for five end-user LLM session types: freeform, learning, homework, review, and recitation. It seeds realistic users/topics, starts real sessions through the API session services, sends five learner turns per mode, and writes transcripts/results under `tmp/enduser-flows/results/`.

The runner is a conventional quality gate, not only a transcript collector. Normal runs fail on learner-visible envelope leaks, malformed response envelopes, seed fixture name leakage, private source-audit failures, unsupported source-bound factual expansions, weak first learning openers, recitation setup answers that give the model answer before the learner recites, generic praise/style drift, and text-only recitation feedback that claims to observe voice/delivery. Use `--allow-quality-failures` only for exploratory transcript collection.

**Why:** Added after the 2026-05-18 request to evaluate LLM answers and logical flow without relying on emulator/Maestro UI timing.

**How to apply:** Run `pnpm test:llm:enduser` for the full live pass. The canonical implementation is `scripts/enduser-session-pass.ts`; it accepts `--modes=freeform,learning,...`, `--run-id=<id>`, `--results-dir=<path>`, `--allow-quality-failures`, `--with-memory-embeddings`, `--with-clerk-users`, `--list-modes`, and `--list-learner-profiles`. The default run uses DB-only fake seed users and disables semantic memory retrieval/embeddings so the gate stays focused on tutoring/session quality and avoids Clerk/Voyage noise; use `--with-clerk-users` or `--with-memory-embeddings` only when explicitly validating those paths. The change-class script lists this as a slow required validation for LLM prompt changes.

Learner coverage is part of the gate. The five-mode pass rotates age/support profiles: age 11 typical support, age 13 short-burst support, age 15 typical support, age 12 predictable/structure-first support, and age 17 concise support. The test labels support needs/accommodations, not diagnoses; avoid "ADHD vs autism vs normal" as fixture names. If diagnosis-informed behavior is needed, model it as consented support preferences such as short-burst pacing, predictable structure, concise language, or audio-first interaction.
