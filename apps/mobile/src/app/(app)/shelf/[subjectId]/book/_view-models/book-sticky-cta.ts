export function getBookStickyCtaLabel(args: {
  isBookComplete: boolean;
  continueTopicTitle?: string | null;
  upNextTopicTitle?: string | null;
  newestStartedTopicTitle?: string | null;
}): string | null {
  if (args.isBookComplete) {
    return null;
  }

  if (args.continueTopicTitle != null) {
    const title = truncateStickyTopicTitle(args.continueTopicTitle);
    return title ? `▶ Continue: ${title}` : '▶ Continue learning';
  }

  if (args.upNextTopicTitle != null) {
    return `▶ Start: ${truncateStickyTopicTitle(args.upNextTopicTitle)}`;
  }

  if (args.newestStartedTopicTitle != null) {
    return `▶ Resume: ${truncateStickyTopicTitle(args.newestStartedTopicTitle)}`;
  }

  return null;
}

function truncateStickyTopicTitle(title: string): string {
  return title.length > 25 ? `${title.slice(0, 24)}...` : title;
}
