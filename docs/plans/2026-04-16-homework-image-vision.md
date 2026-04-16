# Homework Image Vision Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the LLM see homework images (diagrams, graphs, handwritten math) instead of just OCR text, fix the gallery picker bug, and show the captured image in chat.

**Architecture:** The image travels inline as base64 in the existing `ChatMessage.content: MessagePart[]` union — the same pattern the OCR service already uses for Gemini. The mobile client converts the local file to base64, sends it in the session message JSON body, and the API builds a multimodal `ChatMessage` for the LLM. No persistence, no blob storage, no schema migrations.

**Tech Stack:** expo-image-picker, expo-file-system (base64 read), Hono (API), Zod (schema validation), existing LLM router with Gemini/Anthropic/OpenAI providers.

**Spec:** `docs/superpowers/specs/2026-04-16-homework-image-vision-design.md`

**Parallelism:** Tasks 1-4 (API) and Tasks 5-6 (mobile) are independent and can run in parallel with two agents. Task 7 (gallery bug) is fully independent of all other tasks. Tasks 1 and 2 can also run in parallel with each other.

---

## File Map

### API — LLM Providers
| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/services/llm/providers/anthropic.ts` | Modify | Map `InlineDataPart` → Anthropic image content block |
| `apps/api/src/services/llm/providers/anthropic.test.ts` | Create | Tests for multimodal Anthropic message formatting |
| `apps/api/src/services/llm/providers/openai.ts` | Modify | Map `InlineDataPart` → OpenAI image_url content block |
| `apps/api/src/services/llm/providers/openai.test.ts` | Modify | Add vision message test cases |

### API — Exchange Service
| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/services/exchanges.ts` | Modify | Build multimodal `ChatMessage` when image data present |
| `apps/api/src/services/exchanges.test.ts` | Modify | Test multimodal message assembly |

### API — Session Exchange (pass-through)
| File | Action | Responsibility |
|------|--------|----------------|
| `apps/api/src/services/session/session-exchange.ts` | Modify | Forward image data from `input` to `processExchange`/`streamExchange` |

### Schema
| File | Action | Responsibility |
|------|--------|----------------|
| `packages/schemas/src/sessions.ts` | Modify | Add `imageBase64` + `imageMimeType` to `sessionMessageSchema` |

### Mobile — Session Flow
| File | Action | Responsibility |
|------|--------|----------------|
| `apps/mobile/src/hooks/use-sessions.ts` | Modify | Extend `streamMessage` options to include image data |
| `apps/mobile/src/app/(app)/session/use-session-streaming.ts` | Modify | Pass image data from ref through `continueWithMessage` → `streamMessage` |
| `apps/mobile/src/app/(app)/session/index.tsx` | Modify | Read `imageUri` param, convert to base64, attach to first message |

### Mobile — Chat Display
| File | Action | Responsibility |
|------|--------|----------------|
| `apps/mobile/src/components/session/ChatShell.tsx` | Modify | Add `imageUri` to `ChatMessage`, render image in `MessageBubble` |
| `apps/mobile/src/components/session/ChatShell.test.tsx` | Modify | Test image rendering + fallback |

### Mobile — Gallery Bug
| File | Action | Responsibility |
|------|--------|----------------|
| `apps/mobile/src/app/(app)/homework/camera.tsx` | Modify | Fix gallery picker selection bug |
| `apps/mobile/src/app/(app)/homework/camera.test.tsx` | Modify | Add/fix gallery picker test |

---

## Task 1: Anthropic Provider — Vision Support

**Files:**
- Modify: `apps/api/src/services/llm/providers/anthropic.ts:26-76`
- Create: `apps/api/src/services/llm/providers/anthropic.test.ts`

- [ ] **Step 1: Create the test file with a multimodal message test**

Create `apps/api/src/services/llm/providers/anthropic.test.ts`:

```typescript
import { createAnthropicProvider } from './anthropic';
import type { ChatMessage, ModelConfig } from '../types';

const mockFetch = jest.fn();
(global as unknown as { fetch: typeof fetch }).fetch = mockFetch;

const TEST_API_KEY = 'test-key-123';

const TEXT_ONLY_MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'Hello' },
];

const MULTIMODAL_MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'You are helpful.' },
  {
    role: 'user',
    content: [
      { type: 'inline_data', mimeType: 'image/jpeg', data: 'base64data==' },
      { type: 'text', text: 'What is in this image?' },
    ],
  },
];

const TEST_CONFIG: ModelConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-6',
  maxTokens: 4096,
};

function createOkResponse(content: string): Partial<Response> {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'text', text: content }],
    }),
    text: async () => '',
  };
}

describe('Anthropic Provider', () => {
  const provider = createAnthropicProvider(TEST_API_KEY);

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('chat()', () => {
    it('sends text-only messages as string content', async () => {
      mockFetch.mockResolvedValueOnce(createOkResponse('Hello'));

      await provider.chat(TEXT_ONLY_MESSAGES, TEST_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.system).toBe('You are helpful.');
      expect(body.messages).toEqual([
        { role: 'user', content: 'Hello' },
      ]);
    });

    it('maps InlineDataPart to Anthropic image content blocks', async () => {
      mockFetch.mockResolvedValueOnce(createOkResponse('I see a diagram'));

      await provider.chat(MULTIMODAL_MESSAGES, TEST_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.system).toBe('You are helpful.');
      expect(body.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: 'base64data==',
              },
            },
            { type: 'text', text: 'What is in this image?' },
          ],
        },
      ]);
    });
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd apps/api && pnpm exec jest providers/anthropic.test.ts --no-coverage`

Expected: FAIL — the second test fails because `toAnthropicFormat()` currently strips image parts via `getTextContent()`.

- [ ] **Step 3: Update the Anthropic provider types and formatter**

In `apps/api/src/services/llm/providers/anthropic.ts`, replace the `AnthropicMessage` interface (lines 26-29) and `toAnthropicFormat()` function (lines 54-76):

```typescript
// Replace lines 26-29 with:
type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string };
    };

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}
```

Add a new helper function before `toAnthropicFormat()`:

```typescript
function toAnthropicContent(
  content: string | MessagePart[]
): string | AnthropicContentBlock[] {
  if (typeof content === 'string') return content;
  const hasImages = content.some((p) => p.type === 'inline_data');
  if (!hasImages) return getTextContent(content);
  return content.map((part): AnthropicContentBlock => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: part.mimeType,
        data: part.data,
      },
    };
  });
}
```

Then in `toAnthropicFormat()`, change the `else` branch (line ~68) from:

```typescript
content: getTextContent(msg.content),
```

to:

```typescript
content: toAnthropicContent(msg.content),
```

Ensure `MessagePart` is imported from `../types` (add to the existing import if needed).

- [ ] **Step 4: Run the test — verify it passes**

Run: `cd apps/api && pnpm exec jest providers/anthropic.test.ts --no-coverage`

Expected: PASS — both text-only and multimodal tests pass.

- [ ] **Step 5: Run existing provider tests to check for regressions**

Run: `cd apps/api && pnpm exec jest providers/ --no-coverage`

Expected: All existing Gemini and OpenAI tests still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/llm/providers/anthropic.ts apps/api/src/services/llm/providers/anthropic.test.ts
git commit -m "feat(api): add vision support to Anthropic provider [IMG-VISION]"
```

---

## Task 2: OpenAI Provider — Vision Support

**Files:**
- Modify: `apps/api/src/services/llm/providers/openai.ts:26-54`
- Modify: `apps/api/src/services/llm/providers/openai.test.ts`

- [ ] **Step 1: Add multimodal message test to existing test file**

In `apps/api/src/services/llm/providers/openai.test.ts`, add after the existing `TEST_MESSAGES` constant (line 16):

```typescript
const MULTIMODAL_MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'You are helpful.' },
  {
    role: 'user',
    content: [
      { type: 'inline_data', mimeType: 'image/jpeg', data: 'base64data==' },
      { type: 'text', text: 'What is in this image?' },
    ],
  },
];
```

Add a new test inside the `describe('chat()')` block:

```typescript
    it('maps InlineDataPart to OpenAI image_url content blocks', async () => {
      mockFetch.mockResolvedValueOnce(createOkResponse('I see a diagram'));

      await provider.chat(MULTIMODAL_MESSAGES, TEST_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages).toEqual([
        { role: 'system', content: 'You are helpful.' },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'data:image/jpeg;base64,base64data==' },
            },
            { type: 'text', text: 'What is in this image?' },
          ],
        },
      ]);
    });
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd apps/api && pnpm exec jest providers/openai.test.ts --no-coverage`

Expected: FAIL — the new test fails because `toOpenAIMessages()` calls `getTextContent()` which strips images.

- [ ] **Step 3: Update the OpenAI provider types and formatter**

In `apps/api/src/services/llm/providers/openai.ts`, replace the `OpenAIMessage` interface (lines 26-29):

```typescript
// Replace lines 26-29 with:
type OpenAIContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenAIContentBlock[];
}
```

Add a helper before `toOpenAIMessages()`:

```typescript
function toOpenAIContent(
  content: string | MessagePart[]
): string | OpenAIContentBlock[] {
  if (typeof content === 'string') return content;
  const hasImages = content.some((p) => p.type === 'inline_data');
  if (!hasImages) return getTextContent(content);
  return content.map((part): OpenAIContentBlock => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    return {
      type: 'image_url',
      image_url: { url: `data:${part.mimeType};base64,${part.data}` },
    };
  });
}
```

Then update `toOpenAIMessages()` (lines 49-54):

```typescript
function toOpenAIMessages(messages: ChatMessage[]): OpenAIMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: toOpenAIContent(m.content),
  }));
}
```

Ensure `MessagePart` is imported from `../types` (add to the existing import if needed).

- [ ] **Step 4: Run the test — verify it passes**

Run: `cd apps/api && pnpm exec jest providers/openai.test.ts --no-coverage`

Expected: PASS — all tests including the new multimodal test.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/llm/providers/openai.ts apps/api/src/services/llm/providers/openai.test.ts
git commit -m "feat(api): add vision support to OpenAI provider [IMG-VISION]"
```

---

## Task 3: Session Message Schema — Image Fields

**Files:**
- Modify: `packages/schemas/src/sessions.ts:179-185`

- [ ] **Step 1: Write a failing test for the schema change**

Find the test file for sessions schema. If `packages/schemas/src/sessions.test.ts` exists, add to it. Otherwise, create it:

```typescript
import { sessionMessageSchema } from './sessions';

describe('sessionMessageSchema', () => {
  it('accepts a message with image fields', () => {
    const result = sessionMessageSchema.safeParse({
      message: 'What is this diagram?',
      imageBase64: 'iVBORw0KGgoAAAANS==',
      imageMimeType: 'image/jpeg',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a message without image fields', () => {
    const result = sessionMessageSchema.safeParse({
      message: 'Hello',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid imageMimeType', () => {
    const result = sessionMessageSchema.safeParse({
      message: 'Hello',
      imageBase64: 'iVBORw0KGgoAAAANS==',
      imageMimeType: 'application/pdf',
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd packages/schemas && pnpm exec jest sessions.test --no-coverage`

Expected: FAIL — the schema doesn't have image fields yet.

- [ ] **Step 3: Add image fields to sessionMessageSchema**

In `packages/schemas/src/sessions.ts`, replace the `sessionMessageSchema` definition (lines 179-185):

```typescript
export const sessionMessageSchema = z.object({
  message: z.string().min(1).max(10000),
  sessionType: sessionTypeSchema.optional(),
  /** FR228: Homework mode — "Help me solve it" or "Check my answer" */
  homeworkMode: homeworkModeSchema.optional(),
  /** Base64-encoded image to send alongside the message (homework photos) */
  imageBase64: z.string().max(2_000_000).optional(),
  /** MIME type of the attached image */
  imageMimeType: z
    .enum(['image/jpeg', 'image/png', 'image/webp'])
    .optional(),
});
```

**No `.refine()`.** The pair validation (both fields present or both absent) is handled in `session-exchange.ts` where the `ImageData` object is constructed (Task 4). This avoids the `ZodObject → ZodEffects` type change that breaks Hono's `zValidator` type inference in middleware chains (you get `unknown` instead of the parsed type in the handler). Keeping the schema as a plain `z.object()` preserves full type inference.

- [ ] **Step 4: Run the test — verify it passes**

Run: `cd packages/schemas && pnpm exec jest sessions.test --no-coverage`

Expected: PASS — all three tests pass.

- [ ] **Step 5: Run the API typecheck**

Run: `pnpm exec nx run api:typecheck`

Expected: PASS — no type changes downstream since the schema stays as `ZodObject`.

- [ ] **Step 6: Commit**

```bash
git add packages/schemas/src/sessions.ts packages/schemas/src/sessions.test.ts
git commit -m "feat(schemas): add imageBase64 + imageMimeType to sessionMessageSchema [IMG-VISION]"
```

---

## Task 4: Exchange Service — Multimodal ChatMessage Assembly

**Files:**
- Modify: `apps/api/src/services/exchanges.ts:529-542, 592-604`
- Modify: `apps/api/src/services/session/session-exchange.ts:736, 810`
- Modify: `apps/api/src/services/exchanges.test.ts`

- [ ] **Step 1: Write a failing test for multimodal message assembly**

In `apps/api/src/services/exchanges.test.ts`, add a new `describe` block after the existing tests:

```typescript
describe('processExchange — multimodal image', () => {
  let capturedMessages: ChatMessage[] = [];

  beforeEach(() => {
    capturedMessages = [];
    const capturingProvider: LLMProvider = {
      name: 'gemini',
      chat: async (messages) => {
        capturedMessages = messages;
        return 'I see a diagram of a cell.';
      },
      chatStream: async () => {
        throw new Error('not used');
      },
    };
    registerProvider(capturingProvider);
  });

  afterEach(() => {
    // Restore the standard mock so other test suites aren't affected
    registerProvider(createMockProvider('gemini'));
  });

  it('builds a MessagePart[] user message when imageData is provided', async () => {
    const result = await processExchange(
      { ...baseContext, exchangeHistory: [] },
      'What is this?',
      { base64: 'aW1hZ2VkYXRh', mimeType: 'image/jpeg' }
    );

    expect(result.response).toContain('diagram');

    // The last message (user) should have MessagePart[] content
    const userMsg = capturedMessages[capturedMessages.length - 1];
    expect(Array.isArray(userMsg.content)).toBe(true);

    const parts = userMsg.content as import('./llm').MessagePart[];
    expect(parts).toHaveLength(2);
    expect(parts[0]).toEqual({
      type: 'inline_data',
      mimeType: 'image/jpeg',
      data: 'aW1hZ2VkYXRh',
    });
    expect(parts[1]).toEqual({
      type: 'text',
      text: 'What is this?',
    });
  });

  it('builds a string user message when no imageData is provided', async () => {
    await processExchange(
      { ...baseContext, exchangeHistory: [] },
      'Help me with this problem'
    );

    const userMsg = capturedMessages[capturedMessages.length - 1];
    expect(typeof userMsg.content).toBe('string');
    expect(userMsg.content).toBe('Help me with this problem');
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd apps/api && pnpm exec jest exchanges.test.ts --no-coverage`

Expected: FAIL — `processExchange` doesn't accept a third `imageData` parameter.

- [ ] **Step 3: Add optional imageData parameter to processExchange and streamExchange**

In `apps/api/src/services/exchanges.ts`, first add the `ImageData` type and a helper near the top of the file (after imports):

```typescript
export interface ImageData {
  base64: string;
  mimeType: string;
}

function buildUserContent(
  userMessage: string,
  imageData?: ImageData
): string | MessagePart[] {
  if (!imageData) return userMessage;
  return [
    { type: 'inline_data' as const, mimeType: imageData.mimeType, data: imageData.base64 },
    { type: 'text' as const, text: userMessage },
  ];
}
```

Ensure `MessagePart` is imported from `./llm` (add to the existing import).

Then update `processExchange` signature (line 529-531):

```typescript
export async function processExchange(
  context: ExchangeContext,
  userMessage: string,
  imageData?: ImageData
): Promise<ExchangeResult> {
```

And change line 541 from:

```typescript
    { role: 'user' as const, content: userMessage },
```

to:

```typescript
    { role: 'user' as const, content: buildUserContent(userMessage, imageData) },
```

Apply the same change to `streamExchange` (line 592-595):

```typescript
export async function streamExchange(
  context: ExchangeContext,
  userMessage: string,
  imageData?: ImageData
): Promise<ExchangeStreamResult> {
```

And change line 604 from:

```typescript
    { role: 'user' as const, content: userMessage },
```

to:

```typescript
    { role: 'user' as const, content: buildUserContent(userMessage, imageData) },
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `cd apps/api && pnpm exec jest exchanges.test.ts --no-coverage`

Expected: PASS — both new tests and all existing tests pass.

- [ ] **Step 5: Forward image data from session-exchange.ts**

In `apps/api/src/services/session/session-exchange.ts`, import `ImageData`:

```typescript
import { processExchange, streamExchange, type ImageData } from '../exchanges';
```

Update the call at line 736 from:

```typescript
  const result = await processExchange(context, input.message);
```

to:

```typescript
  const imageData: ImageData | undefined =
    input.imageBase64 && input.imageMimeType
      ? { base64: input.imageBase64, mimeType: input.imageMimeType }
      : undefined;
  const result = await processExchange(context, input.message, imageData);
```

Update the streaming call at line 810 from:

```typescript
  const result = await streamExchange(context, input.message);
```

to:

```typescript
  const imageData: ImageData | undefined =
    input.imageBase64 && input.imageMimeType
      ? { base64: input.imageBase64, mimeType: input.imageMimeType }
      : undefined;
  const result = await streamExchange(context, input.message, imageData);
```

**Note:** DRY concern — the `imageData` extraction appears twice. Extract to a small helper if the surrounding code allows a clean shared scope. Otherwise, the duplication is acceptable (two lines, clear intent).

- [ ] **Step 6: Typecheck the API**

Run: `pnpm exec nx run api:typecheck`

Expected: PASS — the optional parameter doesn't break existing call sites.

- [ ] **Step 7: Run the full exchange test suite**

Run: `cd apps/api && pnpm exec jest exchanges --no-coverage`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/exchanges.ts apps/api/src/services/exchanges.test.ts apps/api/src/services/session/session-exchange.ts
git commit -m "feat(api): build multimodal ChatMessage when homework image present [IMG-VISION]"
```

---

## Task 5: Mobile — Base64 Image Encoding and API Integration

**Files:**
- Modify: `apps/mobile/src/hooks/use-sessions.ts:232-310`
- Modify: `apps/mobile/src/app/(app)/session/use-session-streaming.ts:40-124, 398-591`
- Modify: `apps/mobile/src/app/(app)/session/index.tsx:234-260`

- [ ] **Step 1: Extend useStreamMessage to accept image data in options**

In `apps/mobile/src/hooks/use-sessions.ts`, update the `stream` function signature (lines 233-247) and body construction (lines 298-304).

Update the `options` parameter type from:

```typescript
    options?: { homeworkMode?: 'help_me' | 'check_answer' }
```

to:

```typescript
    options?: {
      homeworkMode?: 'help_me' | 'check_answer';
      imageBase64?: string;
      imageMimeType?: string;
    }
```

This change applies in **two places**: the outer type signature (line 246) and the inner `useCallback` parameter (line 278).

Then update the body construction (lines 299-304) from:

```typescript
        const body: SessionMessageInput = {
          message,
          ...(options?.homeworkMode
            ? { homeworkMode: options.homeworkMode }
            : {}),
        };
```

to:

```typescript
        const body: SessionMessageInput = {
          message,
          ...(options?.homeworkMode
            ? { homeworkMode: options.homeworkMode }
            : {}),
          ...(options?.imageBase64 && options?.imageMimeType
            ? {
                imageBase64: options.imageBase64,
                imageMimeType: options.imageMimeType,
              }
            : {}),
        };
```

- [ ] **Step 2: Add image ref and forwarding in useSessionStreaming**

In `apps/mobile/src/app/(app)/session/use-session-streaming.ts`:

Add to `UseSessionStreamingOptions` interface (after line ~53):

```typescript
  /** Base64-encoded homework image to send with the first message (set once, cleared after send) */
  imageBase64Ref: React.MutableRefObject<string | null>;
  imageMimeTypeRef: React.MutableRefObject<string | null>;
```

Destructure these in `useSessionStreaming` (inside the `const { ... } = opts;` block):

```typescript
    imageBase64Ref,
    imageMimeTypeRef,
```

Update the `streamMessage` call inside `continueWithMessage` (lines 489-591). Change from:

```typescript
        await streamMessage(
          text,
          (accumulated) => { ... },
          async (result) => { ... },
          sid,
          effectiveMode === 'homework' && homeworkMode
            ? { homeworkMode }
            : undefined
        );
```

to:

```typescript
        const streamOptions: {
          homeworkMode?: 'help_me' | 'check_answer';
          imageBase64?: string;
          imageMimeType?: string;
        } = {};
        if (effectiveMode === 'homework' && homeworkMode) {
          streamOptions.homeworkMode = homeworkMode;
        }
        // Capture image data — do NOT clear refs yet (cleared after success)
        const hadImageData = !!(imageBase64Ref.current && imageMimeTypeRef.current);
        if (hadImageData) {
          streamOptions.imageBase64 = imageBase64Ref.current!;
          streamOptions.imageMimeType = imageMimeTypeRef.current!;
        }

        await streamMessage(
          text,
          (accumulated) => { ... },  // keep existing onChunk callback unchanged
          async (result) => {
            // Clear image refs AFTER successful send — if streamMessage threw,
            // the refs stay populated so the retry has the image data.
            if (hadImageData) {
              imageBase64Ref.current = null;
              imageMimeTypeRef.current = null;
            }
            // ... rest of existing onComplete callback unchanged
          },
          sid,
          Object.keys(streamOptions).length > 0 ? streamOptions : undefined
        );
```

**Important:** The image ref clearing is inside the `onComplete` callback, NOT before the `streamMessage` call. This ensures that if `streamMessage` throws (timeout, network error), the refs still hold the image data for the retry via `handleReconnect`. Only clear after the LLM has successfully responded. The rest of the `onChunk` and `onComplete` callbacks stay exactly as they are — just add the `if (hadImageData)` block at the top of `onComplete`.

Add `imageBase64Ref` and `imageMimeTypeRef` to the `useCallback` dependency array of `continueWithMessage` (line ~666).

- [ ] **Step 3: Session screen — read imageUri, convert to base64, wire refs**

In `apps/mobile/src/app/(app)/session/index.tsx`:

Add `imageUri` and `imageMimeType` to `useLocalSearchParams` (around line 234). Add to the destructure:

```typescript
  imageUri,
  imageMimeType: routeImageMimeType,
```

And to the type generic:

```typescript
  imageUri?: string;
  imageMimeType?: string;
```

**Where `imageMimeType` comes from:** `camera.tsx` already passes `imageUri` as a route param. Extend `navigateToSession` in `camera.tsx` to also pass the MIME type:
- For **camera capture**: always `'image/jpeg'` (the resize logic in `use-homework-ocr.ts` outputs JPEG).
- For **gallery pick**: use `selectedImage.mimeType` from the `ImagePicker.launchImageLibraryAsync` result — expo-image-picker returns the actual MIME type in the `assets[0].mimeType` field.

This avoids guessing from the file extension, which is unreliable on Android (Samsung devices produce `content://` URIs with no extension).

In `camera.tsx`, update `navigateToSession` (line ~261) to accept an `imageMimeType` parameter and pass it in `router.replace` params. Update `handleCapture` to pass `'image/jpeg'`, and `handlePickFromGallery` to pass `selectedImage.mimeType ?? 'image/jpeg'`. Also update `handleConfirmResult` and `handlePickSubject` to thread it through.

Add the image refs and a base64 conversion effect. Near other `useRef` declarations:

```typescript
import * as FileSystem from 'expo-file-system';

const imageBase64Ref = useRef<string | null>(null);
const imageMimeTypeRef = useRef<string | null>(null);
```

Add a `useEffect` to convert the image on mount:

```typescript
useEffect(() => {
  if (!imageUri) return;
  let cancelled = false;

  async function convertImage() {
    try {
      const base64 = await FileSystem.readAsStringAsync(imageUri!, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (!cancelled) {
        imageBase64Ref.current = base64;
        // Use MIME type from the source (camera.tsx passes it via route param).
        // Camera always outputs JPEG; gallery picker provides the actual type.
        // Default to JPEG as a safe fallback.
        imageMimeTypeRef.current = routeImageMimeType ?? 'image/jpeg';
      }
    } catch (err) {
      console.warn('[Session] Failed to read image as base64:', err);
      // Non-fatal — session proceeds with text only
    }
  }

  convertImage();
  return () => { cancelled = true; };
}, [imageUri, routeImageMimeType]);
```

Pass the refs to `useSessionStreaming`:

```typescript
const {
  continueWithMessage,
  // ... other destructured values
} = useSessionStreaming({
  // ... existing options
  imageBase64Ref,
  imageMimeTypeRef,
});
```

- [ ] **Step 4: Typecheck the mobile app**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: PASS. Fix any type errors (likely around the `UseSessionStreamingOptions` interface requiring the new refs).

- [ ] **Step 5: Run related tests**

Run: `cd apps/mobile && pnpm exec jest --findRelatedTests src/app/\\(app\\)/session/index.tsx src/app/\\(app\\)/session/use-session-streaming.ts src/hooks/use-sessions.ts --no-coverage`

Expected: PASS — existing tests still work since the new parameters are optional.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/hooks/use-sessions.ts apps/mobile/src/app/\(app\)/session/use-session-streaming.ts apps/mobile/src/app/\(app\)/session/index.tsx
git commit -m "feat(mobile): pass homework image as base64 to session API [IMG-VISION]"
```

---

## Task 6: Mobile — Image Display in Chat

**Files:**
- Modify: `apps/mobile/src/components/session/ChatShell.tsx:28-42, 480-489`
- Modify: `apps/mobile/src/components/session/ChatShell.test.tsx`

- [ ] **Step 1: Write a failing test for image rendering**

In `apps/mobile/src/components/session/ChatShell.test.tsx`, add:

```typescript
  it('renders image in MessageBubble when imageUri is present', () => {
    const messagesWithImage: ChatMessage[] = [
      {
        id: 'msg-img',
        role: 'user',
        content: 'What is this diagram?',
        imageUri: 'file:///cache/homework-123.jpg',
      },
    ];

    const { getByTestId } = render(
      <ChatShell
        title="Test"
        messages={messagesWithImage}
        onSend={jest.fn()}
        isStreaming={false}
      />
    );

    expect(getByTestId('message-image-msg-img')).toBeTruthy();
  });
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `cd apps/mobile && pnpm exec jest ChatShell.test --no-coverage`

Expected: FAIL — `ChatMessage` doesn't have `imageUri` and `MessageBubble` doesn't render images.

- [ ] **Step 3: Add imageUri to ChatMessage interface**

In `apps/mobile/src/components/session/ChatShell.tsx`, add to the `ChatMessage` interface (after line 40):

```typescript
  /** Local file URI of a homework image attached to this message */
  imageUri?: string;
```

- [ ] **Step 4: Render the image in MessageBubble**

Find the `MessageBubble` rendering inside the `messages.map(...)` block (around line 480-489). Add an `Image` import at the top of the file if not already present (it is — line 5).

Inside the `MessageBubble` component or the inline message rendering, add the image above the text content. Find where `content` is rendered and add before it:

```typescript
{msg.imageUri && (
  <Image
    testID={`message-image-${msg.id}`}
    source={{ uri: msg.imageUri }}
    className="w-full aspect-[4/3] rounded-lg mb-2"
    resizeMode="contain"
    accessibilityLabel="Homework image"
    onError={() => {
      // Image URI invalidated (cache reclaimed, cold start).
      // Replace with a placeholder — this is a known limitation
      // of the ephemeral approach (see spec section 4).
    }}
  />
)}
```

**Note on `onError` fallback:** The `onError` handler should trigger a state update that replaces the broken image with a fallback placeholder. The simplest approach: track failed image IDs in a `Set` state, and render a gray placeholder `View` with a camera icon when the ID is in the set. The `new Set(prev).add(msg.id)` creates a new Set on each error, which triggers a re-render of the message list — this is fine in practice since it only fires on cache invalidation (rare). Example:

Add state near the top of `ChatShell`:

```typescript
const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
```

Update the image rendering:

```typescript
{msg.imageUri && !failedImages.has(msg.id) && (
  <Image
    testID={`message-image-${msg.id}`}
    source={{ uri: msg.imageUri }}
    className="w-full aspect-[4/3] rounded-lg mb-2"
    resizeMode="contain"
    accessibilityLabel="Homework image"
    onError={() => {
      setFailedImages((prev) => new Set(prev).add(msg.id));
    }}
  />
)}
{msg.imageUri && failedImages.has(msg.id) && (
  <View
    testID={`message-image-fallback-${msg.id}`}
    className="w-full aspect-[4/3] rounded-lg mb-2 bg-surface items-center justify-center"
  >
    <Ionicons name="camera-outline" size={32} color={colors.muted} />
    <Text className="text-body-sm text-text-secondary mt-1">
      Image no longer available
    </Text>
  </View>
)}
```

- [ ] **Step 5: Wire imageUri to the first user message in the session screen**

In `apps/mobile/src/app/(app)/session/index.tsx`, find where the first user message is added to `messages` state (this happens when the auto-sent homework message is created). The first user message object should include `imageUri`:

```typescript
{
  id: createLocalMessageId('user'),
  role: 'user',
  content: problemText,
  imageUri: imageUri ?? undefined,  // attach the local image to the chat display
  isAutoSent: true,
}
```

Search for where `problemText` is used to create a user message and add `imageUri` there.

- [ ] **Step 6: Run the test — verify it passes**

Run: `cd apps/mobile && pnpm exec jest ChatShell.test --no-coverage`

Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `cd apps/mobile && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/components/session/ChatShell.tsx apps/mobile/src/components/session/ChatShell.test.tsx apps/mobile/src/app/\(app\)/session/index.tsx
git commit -m "feat(mobile): display homework image in chat message bubble [IMG-VISION]"
```

---

## Task 7: Gallery Picker Bug — Investigate and Fix

**Files:**
- Modify: `apps/mobile/src/app/(app)/homework/camera.tsx:191-244`
- Modify: `apps/mobile/src/app/(app)/homework/camera.test.tsx`

This task requires on-device debugging. The code looks correct but the gallery selection doesn't complete on Galaxy S10e.

- [ ] **Step 1: Reproduce on device**

Launch the app on the Galaxy S10e (or emulator). Navigate to the homework camera screen. Tap the gallery button (bottom-left). Observe:
- Does the system gallery/picker appear?
- Can you browse photos?
- What happens when you tap a photo? Does it return to the app? Does the preview phase show?
- Check the Metro bundler logs for any errors/warnings from expo-image-picker.

- [ ] **Step 2: Investigate likely culprits**

Check in order — **start with #1, it's the most likely**:
1. **`mediaTypes` format** (most likely): The expo-image-picker API changed between SDK versions. The code uses `mediaTypes: ['images']` (string array), but the installed version `~17.0.10` may expect `mediaTypes: ImagePicker.MediaTypeOptions.Images` (enum). If the SDK was recently upgraded, this is almost certainly the issue. Check the expo-image-picker changelog for your SDK version.
2. **Result handler**: Add temporary `console.log` in `handlePickFromGallery` to log the full `result` object from `launchImageLibraryAsync`. Does `result.canceled` come back `true` even when a photo is tapped?
3. **`allowsEditing: false`**: Try changing to `allowsEditing: true` temporarily — some Android versions have bugs where `false` causes the picker to return `canceled`.
4. **expo-image-picker version**: Check `expo-image-picker@~17.0.10` GitHub issues for Galaxy/Samsung-specific bugs.
5. **Android version**: Check the device's Android version against known compatibility issues.

- [ ] **Step 3: Apply the fix**

Fix depends on what Step 2 reveals. Update `handlePickFromGallery` in `camera.tsx` accordingly.

- [ ] **Step 4: Add or update the gallery picker test**

In `camera.test.tsx`, verify the mock at line 43 matches the fix. Ensure the test covers:
- Successful gallery pick returns an image → dispatches `PHOTO_TAKEN` with `source: 'gallery'`
- Cancelled pick → no state change
- Permission denied → shows Settings alert

- [ ] **Step 5: Verify on device**

Re-test on the Galaxy S10e:
- Gallery opens → select a photo → preview phase shows the selected image → OCR runs → result phase shows problem cards.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/app/\(app\)/homework/camera.tsx apps/mobile/src/app/\(app\)/homework/camera.test.tsx
git commit -m "fix(mobile): gallery picker selection not returning image [IMG-VISION]"
```

---

## Task 8: Final Validation

- [ ] **Step 1: Run full API test suite**

Run: `pnpm exec nx run api:test`

Expected: PASS — all 2,136+ tests.

- [ ] **Step 2: Run full mobile test suite**

Run: `cd apps/mobile && pnpm exec jest --no-coverage`

Expected: PASS — all 1,228+ tests.

- [ ] **Step 3: Typecheck both apps**

Run: `pnpm exec nx run api:typecheck && cd apps/mobile && pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 4: Lint**

Run: `pnpm exec nx run api:lint && pnpm exec nx lint mobile`

Expected: PASS.

- [ ] **Step 5: Manual smoke test**

On device or emulator:
1. Open homework camera → take photo of a **text worksheet** → OCR runs → problem cards shown → start session → LLM responds about the problems (normal text flow still works)
2. Open homework camera → take photo of a **diagram/graph** → OCR returns low/empty text → problem cards may be sparse → start session → LLM describes and explains the diagram (vision working!)
3. Open homework camera → tap gallery button → select photo → photo appears in preview → OCR + session flow works
4. In the chat, verify the homework image is visible as the first message
5. Background the app for a few minutes → return → chat still works (image may show placeholder if cache was reclaimed)
