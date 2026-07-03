DOC: docs/specs/2026-04-07-epic-17-voice-first-design.md (2026-04-07, 43K — oldest spec in corpus)
CLAIMS (architecture-level):
- A1: Voice becomes the PRIMARY modality (not optional) — server-side streaming STT/TTS, voice personas, voice-optimized LLM prompting, hands-free continuous conversation. Builds on Epic 8's on-device-only voice (client toggle, `expo-speech`/`expo-speech-recognition`).
- A2: Two new streaming server routes (`/v1/voice/transcribe`, `/v1/voice/speak`) backed by a third-party STT/TTS provider (Whisper/Deepgram, ElevenLabs/Google/OpenAI TTS) — net-new backend surface, net-new vendor cost line.
- A3: New data model — `profiles.voicePersona`, `family_links.handsFreeTimeLimitMin`, a new `voice_usage` table for tier-based minute tracking (Free=on-device only, Plus=60min/mo, Family/Pro=unlimited).
- A4: Voice-aware LLM prompting — a new `buildSystemPrompt()` section activated on `inputMode='voice'` (brevity, conversational fillers, question-heavy, segmentation).
- A5: Voice-native pedagogy features — pronunciation comparison (four_strands Output strand), voice-based SM-2 recall testing, hands-free mode with parent-set time limits.

TECH VALIDITY (assumptions broken by 3 UI generations since 2026-04-07):
- Spec assumes the flat V0 5-tab shell and pre-persona-removal profile model current at authoring time (Epic 12 "persona removal" is listed as a dependency, itself since superseded again — see `AGENTS.md` "Profile Shapes" three-state V0/V1/V2 matrix). The spec's `SessionInputModeToggle` / `ChatShell` integration points (§14.2) predate the mentor-is-the-app V2 shell redesign (`docs/specs/2026-06-09-mentor-shell-redesign.md`) — current session UI lives under a different navigation contract than assumed.
- §12.1 `ALTER TABLE profiles ADD COLUMN voice_persona` and §12.2 `family_links.hands_free_time_limit_min` are pre-migration-discipline-era raw DDL sketches, not committed migrations — no drift risk since neither shipped (see IMPLEMENTED below), but any execution must go through current migration/ADR discipline (`AGENTS.md` "Schema And Deploy Safety").
- §11 Tier-Based Voice Minutes table cites tiers "Free/Plus/Family/Pro" — pricing model has since moved to dual-cap (`.claude/memory/pricing_dual_cap.md`: Free 10/day+100/mo, Plus 700/mo) and RevenueCat Plus-only north star; the four-tier voice-minute allowance needs re-derivation, not reuse verbatim.
- §15 System Prompt Changes assumes `inputMode` gates a single additive prompt section; current `exchange-prompts.ts` composite-block architecture (see row 19 sheet) is materially more complex than the spec's simple gate — any voice section would need to integrate with the current LLM-routing-rung / envelope architecture (`MMT-ADR-0014`), unaddressed by the spec.

IMPLEMENTED (architecture-level, per claim):
- A1 (Epic 8 baseline): complete, unchanged since spec date. `apps/mobile/src/hooks/use-speech-recognition.ts`, `use-text-to-speech.ts`, `apps/mobile/src/components/session/VoiceRecordButton.tsx`, `VoicePlaybackBar.tsx`, `VoiceToggle.tsx`, `SessionInputModeToggle.tsx`, `apps/mobile/src/lib/language-locales.ts` — all present, all client-side/on-device only. `SessionInputModeToggle` is wired into `ChatShell.tsx` and covered by tests.
- A1 (Epic 17 upgrade to primary/server-side): none. No `useStreamingSTT`, `useStreamingTTS`, `useHandsFreeMode`, `useVoicePreferences`, `useAudioLevel` hooks and no `AudioWaveform`/`HandsFreeOverlay`/`PronunciationFeedback`/`VoicePersonaPicker`/`TranscriptOverlay` components exist anywhere in `apps/mobile/src` (zero grep hits).
- A2: none. Zero hits for `voice/transcribe`, `voice/speak`, `voice/usage` in `apps/api/src`. No streaming STT/TTS provider integration exists.
- A3: none. Zero hits for `voicePersona`/`voice_persona` across `packages/schemas` and `apps/api/drizzle`. No `voice_usage` table.
- A4: none. No voice-conditional section in `buildSystemPrompt()` / `exchange-prompts.ts`.
- A5: none. No pronunciation-comparison, voice-recall, or hands-free code anywhere in the repo.

CANDIDATE WIs:
- WI-1459 (re-scope umbrella): adopt, as-is. The candidate's own framing — "re-scope and refresh the spec before any execution" — is exactly right: this doc is ~95% unbuilt, 3 months old relative to a shell that has undergone two further redesigns (V1 nav, V2 mentor-is-the-app), and its data model / tiering assumptions are stale. Do not execute FR243-FR261 against this document as written. A re-spec pass should re-anchor against the current V2 shell + dual-cap pricing + `MMT-ADR-0014` routing before any story is greenlit.
- WI-1447 (voice locale-fallback bug, cs/ja/pl/en mappings): NOT this row's candidate — sourced from `docs/specs/2026-06-03-owner-impact-audit-top-10.md` item #8 (row 2's doc), confirmed via TSV Found-In field. Merge-into-row-2's disposition sheet; only noted here per the relation flagged in the assignment. It is a bug against the EXISTING Epic 8 `language-locales.ts` mapping, independent of whether Epic 17 ever ships.

VERDICT: obsolete (as an executable spec) — architecturally superseded by three shell generations and a pricing-model change; the underlying PRODUCT NEED (voice-first, "kids don't type") remains valid and is a standing ruling (`.claude/memory/feedback_voice_is_critical.md`), but this document cannot be executed as written.

MVP RECOMMENDATION: out. Burden of proof is on inclusion, and none of Phase A/B/C clears it against the V2-on-Google-Play/RevenueCat-Plus-only/proven-V1-fallback north star: it adds a new paid vendor dependency (STT/TTS), a new tier-gated cost surface, and ~9 stories of net-new mobile+API work, none of which existing V1 users depend on (Epic 8's on-device voice already satisfies "voice available, never required" for V1). Recommend: park as a explicitly-scheduled post-MVP epic, re-spec against current architecture before any execution, do not let it silently block V2 launch scope.

CONFIDENCE: high — code-verified zero implementation of every Epic 17-specific claim (A2-A5); Epic 8 baseline (A1) independently confirmed present and wired. Medium on "which pieces of a re-spec should reuse this doc's design principles vs. start clean" — that's a product call, not a code fact.
1. Does voice-first still target ages 11-13 specifically, or does the current age-bracket model (`computeAgeBracketFromDate`) suggest a different age cut for the "suggest voice by default" UX?
2. Is server-side STT/TTS (new vendor cost) still the intended direction, or has on-device (Epic 8, free) proven sufficient and the re-spec should scope down to UX polish only (waveform, VAD, better fallback messaging)?
3. Should the re-scope pass happen before or after V2 launch — i.e., is this Post-MVP-immediately-after or Post-MVP-someday?
