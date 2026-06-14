import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, type TextStyle } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { ThemedMarkdown } from './ThemedMarkdown';

type MarkdownRule = (node: { key: string }, children: ReactNode) => ReactNode;

type CapturedMarkdownProps = {
  children: string;
  mergeStyle?: boolean;
  rules?: Record<string, MarkdownRule>;
  style?: Record<string, unknown>;
  onLinkPress?: (url: string) => boolean;
  allowedImageHandlers?: string[];
  defaultImageHandler?: string | null;
};

const mockMarkdownRender = jest.fn();

jest.mock(
  'react-native-markdown-display' /* gc1-allow: third-party native renderer, cannot run in jsdom */,
  () => {
    const React = require('react');
    const { Text } = require('react-native');

    return (props: CapturedMarkdownProps) => {
      mockMarkdownRender(props);
      return React.createElement(
        Text,
        { testID: 'markdown-output' },
        props.children,
      );
    };
  },
);

function latestMarkdownProps(): CapturedMarkdownProps {
  expect(mockMarkdownRender).toHaveBeenCalled();
  return mockMarkdownRender.mock.calls.at(-1)?.[0] as CapturedMarkdownProps;
}

function flattenRuleStyle(
  element: ReactElement<{ style?: TextStyle | TextStyle[] }>,
): TextStyle | undefined {
  return StyleSheet.flatten(element.props.style) as TextStyle | undefined;
}

describe('ThemedMarkdown', () => {
  beforeEach(() => {
    mockMarkdownRender.mockClear();
  });

  it('renders children as markdown text', () => {
    render(<ThemedMarkdown>Hello **friend**</ThemedMarkdown>);

    screen.getByText('Hello **friend**');
  });

  it('passes mergeStyle=false so custom rules own prose styling', () => {
    render(<ThemedMarkdown>Hello</ThemedMarkdown>);

    expect(latestMarkdownProps().mergeStyle).toBe(false);
  });

  it('does not put a bare style.color on inline or textgroup rule output', () => {
    render(<ThemedMarkdown>Hello</ThemedMarkdown>);

    const props = latestMarkdownProps();
    const inlineElement = props.rules?.inline?.(
      { key: 'inline-key' },
      'inline text',
    ) as ReactElement<{ className?: string; style?: TextStyle | TextStyle[] }>;
    const textgroupElement = props.rules?.textgroup?.(
      { key: 'textgroup-key' },
      'grouped text',
    ) as ReactElement<{ className?: string; style?: TextStyle | TextStyle[] }>;

    expect(inlineElement.props.className).toContain('text-text-primary');
    expect(textgroupElement.props.className).toContain('text-text-primary');
    expect(flattenRuleStyle(inlineElement)?.color).toBeUndefined();
    expect(flattenRuleStyle(textgroupElement)?.color).toBeUndefined();
  });

  describe('link-scheme guard (F-027)', () => {
    it('blocks javascript: scheme links', () => {
      render(<ThemedMarkdown>Hello</ThemedMarkdown>);
      const { onLinkPress } = latestMarkdownProps();
      // onLinkPress returning false means the library suppresses navigation
      // eslint-disable-next-line no-script-url -- intentional bad fixture for attack-blocking coverage
      expect(onLinkPress?.('javascript:alert(1)')).toBe(false);
    });

    it('blocks data: scheme links', () => {
      render(<ThemedMarkdown>Hello</ThemedMarkdown>);
      const { onLinkPress } = latestMarkdownProps();
      expect(onLinkPress?.('data:text/html,<script>alert(1)</script>')).toBe(
        false,
      );
    });

    it('blocks file: scheme links', () => {
      render(<ThemedMarkdown>Hello</ThemedMarkdown>);
      const { onLinkPress } = latestMarkdownProps();
      expect(onLinkPress?.('file:///etc/passwd')).toBe(false);
    });

    it('allows https: links', () => {
      render(<ThemedMarkdown>Hello</ThemedMarkdown>);
      const { onLinkPress } = latestMarkdownProps();
      expect(onLinkPress?.('https://example.com')).toBe(true);
    });

    it('allows http: links', () => {
      render(<ThemedMarkdown>Hello</ThemedMarkdown>);
      const { onLinkPress } = latestMarkdownProps();
      expect(onLinkPress?.('http://example.com')).toBe(true);
    });

    // [S9] Explicit tests for schemes that are silently blocked but require
    // documented intent — mailto: is used elsewhere in the app via static
    // Linking.openURL; mentomate: is the app's own deep-link scheme. Both
    // must be blocked in LLM-authored markdown to prevent harvesting / forced
    // in-app navigation from a malicious LLM reply.
    it('blocks mailto: scheme links (email harvesting / unintended contact policy)', () => {
      render(<ThemedMarkdown>Hello</ThemedMarkdown>);
      const { onLinkPress } = latestMarkdownProps();
      expect(onLinkPress?.('mailto:victim@example.com')).toBe(false);
    });

    it('blocks mentomate: deep-link scheme (prevents LLM-driven in-app navigation)', () => {
      render(<ThemedMarkdown>Hello</ThemedMarkdown>);
      const { onLinkPress } = latestMarkdownProps();
      expect(onLinkPress?.('mentomate://some/deep/path')).toBe(false);
    });
  });

  describe('remote images disabled (F-027)', () => {
    // The library's image render rule renders null when
    // `show === false && defaultImageHandler === null`. An empty
    // allowedImageHandlers makes `show` false for every src (including https,
    // http, and data: images), and a null defaultImageHandler triggers the
    // null return — so no remote image (tracking pixel / IP leak) ever loads.
    it('passes an empty allowedImageHandlers so no image src matches', () => {
      render(<ThemedMarkdown>Hello</ThemedMarkdown>);
      const { allowedImageHandlers } = latestMarkdownProps();
      expect(allowedImageHandlers).toEqual([]);
    });

    it('passes a null defaultImageHandler so disallowed images render nothing', () => {
      render(<ThemedMarkdown>Hello</ThemedMarkdown>);
      const { defaultImageHandler } = latestMarkdownProps();
      expect(defaultImageHandler).toBeNull();
    });

    it('exercises the library image rule with these props and renders nothing', () => {
      render(<ThemedMarkdown>Hello</ThemedMarkdown>);
      const { allowedImageHandlers, defaultImageHandler } =
        latestMarkdownProps();

      // Reproduce the library's image-rule decision (renderRules.image):
      // an https remote image is blocked because no handler matches and the
      // default handler is null.
      const src = 'https://evil.example/tracker.png';
      const show =
        (allowedImageHandlers ?? []).filter((value) =>
          src.toLowerCase().startsWith(value.toLowerCase()),
        ).length > 0;
      const rendersNothing = show === false && defaultImageHandler === null;

      expect(show).toBe(false);
      expect(rendersNothing).toBe(true);
    });
  });
});
