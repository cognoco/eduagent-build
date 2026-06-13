import { useCallback, useMemo, type ReactElement, type ReactNode } from 'react';
import { Text, type TextStyle } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useThemeColors } from '../../lib/theme';

// Themed markdown renderer for LLM-generated content (chat replies, saved
// notes). The single rule that keeps text visible: prose colour and the
// surrounding background must come from ONE theme system. Prose here is
// coloured exclusively via NativeWind className (`text-text-primary`), which
// resolves from the same root CSS-variable cascade as every `bg-*` background
// and updates in the same React commit — so they cannot desync into
// invisible text (near-white-on-near-white) during a theme transition.
// className also bypasses Android force-dark, which can override the markdown
// library's StyleSheet colours.
//
// Do NOT add an inline `style.color` to the prose rules below: a second,
// independently-updating colour source is exactly what caused the
// invisible-text regression. See docs/llm-issues.md.

// Safe URL schemes allowed for link navigation in LLM-authored markdown (F-027).
// Schemes outside this set (javascript:, data:, file:, etc.) are blocked to
// prevent arbitrary-URL navigation injection.
const SAFE_LINK_SCHEMES = ['https:', 'http:'];

/**
 * Returns true if the URL scheme is allowed; false if it should be blocked.
 * Used as the `onLinkPress` handler — returning false suppresses navigation.
 */
export function isSafeLinkUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return SAFE_LINK_SCHEMES.includes(protocol);
  } catch {
    // Unparseable URL — block it.
    return false;
  }
}

// Image handler allowlist: only HTTPS images are permitted (F-027).
// The library default also allows http:// and data:image/* origins;
// restricting to https:// blocks zero-click remote-image loads from
// plain-HTTP or data-URI sources.
const ALLOWED_IMAGE_HANDLERS: string[] = ['https://'];

function buildMarkdownStyles(
  textColor: string,
): Record<string, TextStyle | { backgroundColor?: string }> {
  // `textColor` only reaches markdown nodes that have NO custom rule
  // (headings, code, lists). The markdown library requires a colour string in
  // its style prop; without one it falls back to black, which Android
  // force-dark would then flip. Prose is handled by the className rules below
  // and ignores this colour entirely.
  const base: TextStyle = {
    fontSize: 15,
    lineHeight: 22,
    color: textColor,
  };
  return {
    body: base,
    text: base,
    textgroup: base,
    inline: base,
    // Paragraph renders as a View (via _VIEW_SAFE_paragraph, which strips text
    // props). Keep the library's default layout props so text wraps correctly.
    paragraph: {
      ...base,
      marginTop: 0,
      marginBottom: 4,
      flexWrap: 'wrap' as const,
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      justifyContent: 'flex-start' as const,
      width: '100%',
    },
    strong: { ...base, fontWeight: '700' },
    em: { ...base, fontStyle: 'italic' },
    s: { ...base, textDecorationLine: 'line-through' as const },
    bullet_list: { ...base, marginBottom: 4 },
    ordered_list: { ...base, marginBottom: 4 },
    list_item: { ...base, marginBottom: 2 },
    bullet_list_icon: { ...base, marginLeft: 10, marginRight: 10 },
    ordered_list_icon: { ...base, marginLeft: 10, marginRight: 10 },
    bullet_list_content: { flex: 1 },
    ordered_list_content: { flex: 1 },
    code_inline: {
      ...base,
      fontFamily: 'monospace',
      paddingHorizontal: 4,
      borderRadius: 4,
    },
    fence: {
      ...base,
      fontFamily: 'monospace',
      padding: 8,
      borderRadius: 8,
      marginBottom: 4,
    },
    code_block: {
      ...base,
      fontFamily: 'monospace',
      padding: 8,
      borderRadius: 8,
      marginBottom: 4,
    },
    heading1: { ...base, fontSize: 18, fontWeight: '700', marginBottom: 4 },
    heading2: { ...base, fontSize: 17, fontWeight: '700', marginBottom: 4 },
    heading3: { ...base, fontSize: 16, fontWeight: '600', marginBottom: 4 },
    link: { ...base, textDecorationLine: 'underline' as const },
    blockquote: {
      ...base,
      paddingLeft: 8,
      marginBottom: 4,
    },
    softbreak: base,
    hardbreak: { ...base, width: '100%', height: 1 },
    hr: { height: 1, marginVertical: 8 },
  };
}

export function ThemedMarkdown({
  children,
}: {
  children: string;
}): ReactElement {
  const colors = useThemeColors();
  const mdStyles = useMemo(
    () => buildMarkdownStyles(colors.textPrimary),
    [colors.textPrimary],
  );

  const handleLinkPress = useCallback((url: string): boolean => {
    return isSafeLinkUrl(url);
  }, []);

  return (
    <Markdown
      mergeStyle={false}
      style={mdStyles}
      onLinkPress={handleLinkPress}
      allowedImageHandlers={ALLOWED_IMAGE_HANDLERS}
      rules={{
        inline: (node: { key: string }, children: ReactNode) => (
          <Text
            key={node.key}
            className="text-text-primary text-body leading-relaxed"
          >
            {children}
          </Text>
        ),
        textgroup: (node: { key: string }, children: ReactNode) => (
          <Text
            key={node.key}
            className="text-text-primary text-body leading-relaxed"
          >
            {children}
          </Text>
        ),
      }}
    >
      {children}
    </Markdown>
  );
}
