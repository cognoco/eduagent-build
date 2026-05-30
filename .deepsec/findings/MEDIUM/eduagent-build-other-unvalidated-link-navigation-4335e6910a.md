# [MEDIUM] LLM-generated markdown links opened via Linking.openURL with no scheme allowlist (phishing / deep-link abuse)

**File:** [`apps/mobile/src/components/common/ThemedMarkdown.tsx`](https://github.com/cognoco/eduagent-build//blob/main/apps/mobile/src/components/common/ThemedMarkdown.tsx#L106-L128) (lines 106, 107, 110, 128)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-unvalidated-link-navigation`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

ThemedMarkdown renders LLM-generated content (chat bubbles in MessageBubble.tsx:261, saved notes in progress/saved.tsx:88) using react-native-markdown-display@7.0.2. It overrides only the `inline` and `textgroup` rules and passes NO `onLinkPress` handler (lines 106-128). The library's default `link`/`blocklink` rules therefore call `openUrl(node.attributes.href)` which, with no custom callback, invokes `Linking.openURL(href)` directly with no scheme validation (verified in node_modules: react-native-markdown-display/src/lib/util/openUrl.js and src/lib/renderRules.js:247-260).

Threat model context: the codebase's LLM prompts ingest user transcripts, memory facts, homework-image text, and profile metadata, so assistant output is a prompt-injection surface; user content itself is rendered via plain <Text> (confirmed in MessageBubble.test.tsx), so the markdown-link vector is specifically reachable through injected LLM output. This is a children's/guardian tutoring app, raising the practical impact of rendering attacker-influenced tappable links to minors.

IMPORTANT mitigation (why this is NOT XSS/RCE): markdown-it@10.0.0's default `validateLink` blocks `javascript:`, `vbscript:`, `file:`, and non-image `data:` URIs at parse time (lib/index.js:32-39), and the library does not override it (default `MarkdownIt({typographer:true})` instance). On react-native-web, Linking.openURL also routes http(s) through `window.open(url, '_blank', 'noopener')`, which modern browsers neutralize for javascript: URIs. So the dangerous code-execution schemes are filtered before reaching Linking.openURL.

Residual exploitable risk: `http(s)://`, `mailto:`, `tel:`, and arbitrary custom/deep-link schemes (e.g. `myapp://`, `intent://`, `market://`) PASS validateLink and are opened unconditionally on tap. A prompt-injected assistant reply such as `[Verify your account](https://evil.example/phish)` or a link to a sensitive in-app deep link renders as a normal tappable link with no origin/allowlist check, enabling phishing and deep-link-triggered actions gated only on a user tap.

## Recommendation

Pass an `onLinkPress` handler to <Markdown> that enforces an explicit scheme allowlist (e.g. permit only `https:`, `http:`, and `mailto:`), returning false to suppress navigation for anything else, and route allowed opens through a helper that re-validates the URL. For external https links, prefer opening in an in-app browser/confirmation given the child-user audience. Optionally also pass a hardened `markdownit` instance and keep the default validateLink. Add a regression test asserting that a markdown link with a non-allowlisted scheme does not call Linking.openURL.

## Revalidation

**Verdict:** true-positive

Confirmed against current source. ThemedMarkdown (lines 106-131) renders <Markdown mergeStyle={false} style={mdStyles} rules={{inline, textgroup}}> and passes NO onLinkPress prop; it overrides only the inline and textgroup rules, leaving the library's default `link`/`blocklink` rules intact (the `link` entry at line 83 is style-only, not a rule override). The react-native-markdown-display@7.0.2 default link rule (renderRules.js:247-260) calls openUrl(node.attributes.href, onLinkPress); with onLinkPress undefined, openUrl.js falls to the unconditional `Linking.openURL(url)` branch with no scheme check. markdown-it@10.0.0's default validateLink blocks javascript:/vbscript:/file:/non-image-data: at parse time (so the XSS/RCE escalation the finding rules out is genuinely mitigated), but http(s)://, mailto:, tel:, and arbitrary custom/deep-link schemes pass validateLink and are opened on tap. Both render surfaces carry attacker-influenceable LLM output: MessageBubble.tsx renders assistant reply text and progress/saved.tsx renders LLM-generated saved-note content through ThemedMarkdown, and the codebase's threat model explicitly treats LLM output as a prompt-injection surface (transcripts, memory facts, homework-image text, profile metadata are ingested). A prompt-injected reply like [Verify your account](https://evil.example/phish) therefore renders as a normal tappable link to minors with no origin allowlist or confirmation. Git history (ff4a6efa6, 0b8922180) only touched invisible-text rendering and type imports — no link handling was added. MEDIUM is appropriate: real phishing/deep-link vector gated on injection + a user tap, not code execution.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-28)
