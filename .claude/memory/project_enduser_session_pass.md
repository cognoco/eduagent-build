---
name: End-user LLM session pass
description: Use when validating live tutoring conversation quality without the emulator.
type: project
---

The repo has a durable direct API runner for five end-user LLM session types: freeform, learning, homework, review, and recitation. It seeds realistic users/topics, starts real sessions through the API session services, sends five learner turns per mode, and writes transcripts/results under `tmp/enduser-flows/results/`.

The runner is a quality gate, not only a transcript collector. Normal runs fail on learner-visible envelope leaks, malformed response envelopes, seed fixture name leakage, and text-only recitation feedback that claims to observe voice/delivery. Use `--allow-quality-failures` only for exploratory transcript collection.

**Why:** Added after the 2026-05-18 request to evaluate LLM answers and logical flow without relying on emulator/Maestro UI timing.

**How to apply:** Run `pnpm test:llm:enduser` for the full live pass. The canonical implementation is `scripts/enduser-session-pass.ts`; it accepts `--modes=freeform,learning,...`, `--run-id=<id>`, `--results-dir=<path>`, `--allow-quality-failures`, `--with-memory-embeddings`, and `--list-modes`. The default run disables semantic memory retrieval/embeddings so the gate stays focused on tutoring/session quality and avoids Voyage rate-limit noise; use `--with-memory-embeddings` when explicitly validating memory infrastructure. The change-class script lists this as a slow required validation for LLM prompt changes.
