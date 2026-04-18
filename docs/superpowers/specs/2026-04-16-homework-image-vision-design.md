# Homework Image Vision Support

**Date:** 2026-04-16
**Status:** Approved
**Scope:** Homework sessions only (mobile)

## Problem

Three related issues with how the homework camera flow handles images:

1. **Gallery picker bug:** The gallery opens but image selection doesn't complete on Galaxy S10e. The code (`camera.tsx:191-244`) calls `ImagePicker.launchImageLibraryAsync` correctly, but the result doesn't make it back to the app. Requires on-device debugging — likely a result handler, `allowsEditing` interaction, or expo-image-picker version issue on this Android version.

2. **LLM never sees the image:** The current flow is photo → OCR → text only → LLM. The image is discarded after OCR. When a user photographs something that isn't primarily text (diagrams, graphs, handwritten math, photos of objects), the LLM receives garbage or empty OCR output and cannot help.

3. **No photo history:** Images are 100% transient — they exist only in device cache during the capture → OCR flow. There is no way to browse previously shared photos. **This is explicitly deferred** to a future spec.

## Design

### 1. Gallery Picker Bug Fix

**Scope:** Investigate and fix on-device. The gallery opens but image selection doesn't complete on Galaxy S10e. Likely culprits: result handler dropping the selection, `allowsEditing: false` interaction with this Android/OS version, or a known expo-image-picker issue. Requires reproduction and debugging, not a speculative code change.

**Deliverable:** A working gallery pick flow that returns a selected image to the preview phase, same as camera capture does today.

### 2. Image Passes Through to the LLM

**Current flow:** photo → OCR → text only → LLM. The image is discarded.

**New flow:**

1. Photo captured/picked → resized (existing 1600px logic in `use-homework-ocr.ts`)
2. OCR runs as before — extracted text still shown in problem cards for user editing
3. When session starts, the first user message includes **both** the image (base64 `InlineDataPart`) and the OCR/edited text (`TextPart`)
4. The LLM receives `content: [{ type: 'inline_data', mimeType: 'image/jpeg', data: '<base64>' }, { type: 'text', text: '<problem text>' }]`
5. The LLM understands diagrams, graphs, handwritten math — not just OCR-extractable text

**What changes:**

- **Session screen** (`apps/mobile/src/app/(app)/session/index.tsx`): Read `imageUri` from route params (currently silently dropped). Convert the local file to base64 on the mobile client using `expo-file-system` `readAsStringAsync(uri, { encoding: 'base64' })`. Send the base64 string as a JSON field in the session message body (not multipart — unlike the OCR upload path). A 1600px JPEG at 0.9 quality is typically 200-400KB, which is ~270-540KB as base64 in JSON — well within Cloudflare Workers' 100MB request body limit on paid plans (no custom body limit is configured in the Hono app).
- **Session message schema** (`packages/schemas/src/sessions.ts`): Extend `sessionMessageSchema` to accept optional `imageBase64: string` and `imageMimeType: string` alongside the text `message`.
- **Session exchange service** (`apps/api/src/services/session/session-exchange.ts`): When `imageBase64` is present, build the `ChatMessage` with `content: MessagePart[]` (inline data + text) instead of `content: string`.
- **No changes to the LLM router** — `ChatMessage` already supports `content: string | MessagePart[]` and `InlineDataPart` is defined in `apps/api/src/services/llm/types.ts`.

**What doesn't change:**

- OCR still runs — users still see and edit problem cards
- Problem text still goes into `session_events.content` as a string (for search, replay, transcripts)
- No image persistence — base64 lives only in the LLM request, then it's gone

**Known v1 limitation:** Only the first message in a homework session carries an image. If a user photographs the wrong page and wants to send a second photo mid-session, they cannot — they must start a new session. This is a deliberate simplification for v1. The upgrade path is to allow image attachments on any user message, which requires extending the chat input UI with an attachment button and the message schema to support images on any exchange, not just the session-start message.

### 3. LLM Provider Fixes

The router's `ChatMessage` type (`apps/api/src/services/llm/types.ts`) already supports multimodal content via `content: string | MessagePart[]` with `InlineDataPart`. Two of three providers strip it:

**Gemini** (`providers/gemini.ts`) — Already works. `toGeminiParts()` maps `InlineDataPart` → `{ inline_data: { mime_type, data } }` natively.

**Anthropic** (`providers/anthropic.ts`): `toAnthropicFormat()` calls `getTextContent()` which discards image parts. Fix: map `InlineDataPart` → Anthropic's `{ type: 'image', source: { type: 'base64', media_type, data } }` content block format.

**OpenAI** (`providers/openai.ts`): `toOpenAIMessages()` calls `getTextContent()` which discards image parts. Fix: map `InlineDataPart` → OpenAI's `{ type: 'image_url', image_url: { url: 'data:<mime>;base64,<data>' } }` content block format.

**Vision routing decision:** The router does NOT gain vision-awareness. All currently configured providers support vision in their configured models (verified as of 2026-04-16). If a future provider is added without vision support, the fix is to add vision mapping to that provider — not to build routing logic that avoids it. The text part is always present as a degraded-but-functional fallback.

### 4. Image Display in Chat

The chat should show the captured/picked image as part of the first message so the user sees what they sent.

**Change:** `ChatMessage` interface in `ChatShell.tsx` gets an optional `imageUri?: string`. The first user message in a homework-from-photo session populates it with the local file URI. `MessageBubble` renders an `<Image>` above the text content when `imageUri` is present.

**Known cosmetic limitation:** The `imageUri` is a device-local cache path. If Android reclaims the cache (app backgrounded for extended time, device under storage pressure) or the app cold-starts mid-session, the URI becomes invalid. The `<Image>` component must handle this gracefully: use `onError` to render a fallback placeholder (gray box with a camera icon) instead of showing a blank gap or crashing. This is an inherent limitation of the ephemeral approach — not a bug. It resolves naturally when persistence is built (R2 URLs replace local URIs).

### 5. No Persistence (Explicit Scope Exclusion)

What is NOT in this spec:

- No R2/S3 blob storage
- No `image_url` column in `session_events` or `learning_sessions`
- No `imageBase64` in JSONB metadata
- No photo history/gallery screen
- No image replay when revisiting past sessions

When persistence is needed, it will be a separate spec with R2, reference keys, and a gallery UI.

## Failure Modes

| State | Trigger | User sees | Recovery |
|-------|---------|-----------|----------|
| Gallery opens but selection fails | expo-image-picker bug / Android version | Gallery closes, no image | Bug fix (section 1) |
| OCR returns empty but image is fine | Photo of diagram/non-text content | Empty problem cards; LLM still receives image | User types description in problem card; LLM has image regardless |
| Base64 conversion fails on device | Corrupt file, out-of-memory on old device | "Could not process image" alert | Retake photo |
| Cold-start invalidates local image URI | Android cache reclamation | Broken image thumbnail in first chat message | Cosmetic only; session text + LLM context unaffected |
| Wrong photo sent, wants to send another | User realizes mid-session | No way to attach second image | Start new session (v1 limitation) |
| LLM API call fails with image payload | Timeout, 500, rate limit | Standard error handling (retry toast, then error state) | Existing retry logic (`router.ts`: up to 4 attempts with exponential backoff, then provider fallback) resends the full message array including the `InlineDataPart`. The base64 image is re-sent on each retry — no special handling needed since the ~540KB max payload is small relative to LLM provider limits. |

## Key Architecture Context

- **LLM Router types** (`apps/api/src/services/llm/types.ts`): `ChatMessage.content` is `string | MessagePart[]`. `MessagePart` is `TextPart | InlineDataPart`. `InlineDataPart` has `{ type: 'inline_data', mimeType: string, data: string }` (base64).
- **OCR pipeline** (`apps/mobile/src/hooks/use-homework-ocr.ts`): Already resizes to 1600px wide, JPEG 0.9 quality, converts to base64 for server-side OCR fallback via `POST /v1/ocr`. This exact resize + base64 pattern is reused for the vision flow.
- **Camera reducer** (`apps/mobile/src/app/(app)/homework/camera-reducer.ts`): State machine with phases: `permission → viewfinder → preview → processing → result → error`. `PHOTO_TAKEN` action stores `imageUri` and `source: 'camera' | 'gallery'`.
- **Session navigation** (`camera.tsx:309-326`): Already passes `imageUri` as a route param. Session screen (`index.tsx`) currently drops it — `useLocalSearchParams` doesn't destructure `imageUri`.
