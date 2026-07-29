import { readFileSync } from 'node:fs';

const ORION_PROFILE = {
  density: 3,
  physicalHeight: 2280,
  physicalWidth: 1080,
  safeAreaTop: 24,
} as const;

const GEOMETRY_CONTRACT = {
  chromeGap: 8,
  chromeTopInset: 8,
  minimumTarget: 44,
  scopeContentInset: 4,
} as const;

const EXPECTED_OPTIONS = new Map([
  ['scope-chip-option-supporter-hub', 'Support hub'],
  ['scope-chip-option-me', 'Me'],
]);

interface ParsedBounds {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

interface HierarchyNode {
  ancestors: string[];
  bounds: ParsedBounds;
  clickable: boolean;
  contentDescription: string;
  enabled: boolean;
  id: string;
  selected: boolean;
  text: string;
  visibleToUser: boolean;
}

export interface OrionHeaderVerification {
  density: number;
  logicalViewport: string;
  optionIds: string[];
  safeAreaTop: number;
  snapshotCount: number;
}

function stringAttribute(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function booleanAttribute(value: unknown, defaultValue = false): boolean {
  const raw = stringAttribute(value);
  if (raw === '') return defaultValue;
  return raw === 'true';
}

function resourceId(value: unknown): string {
  const raw = stringAttribute(value);
  const slash = raw.lastIndexOf('/');
  return slash >= 0 ? raw.slice(slash + 1) : raw;
}

function parsePhysicalBounds(value: unknown, label: string): ParsedBounds {
  const raw = stringAttribute(value);
  const match = raw.match(/^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/);
  if (!match) {
    throw new Error(`${label} has malformed UIAutomator bounds: ${raw}`);
  }

  const [, leftRaw, topRaw, rightRaw, bottomRaw] = match;
  const left = Number(leftRaw);
  const top = Number(topRaw);
  const right = Number(rightRaw);
  const bottom = Number(bottomRaw);
  if (right < left || bottom < top) {
    throw new Error(`${label} has inverted UIAutomator bounds: ${raw}`);
  }
  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
  };
}

function toLogicalBounds(bounds: ParsedBounds): ParsedBounds {
  const logical = (value: number) => value / ORION_PROFILE.density;
  return {
    bottom: logical(bounds.bottom),
    height: logical(bounds.height),
    left: logical(bounds.left),
    right: logical(bounds.right),
    top: logical(bounds.top),
    width: logical(bounds.width),
  };
}

function exactlyOne(
  nodes: HierarchyNode[],
  predicate: (node: HierarchyNode) => boolean,
  label: string,
): HierarchyNode {
  const matches = nodes.filter(predicate);
  const [match] = matches;
  if (matches.length !== 1 || !match) {
    throw new Error(`expected exactly one ${label}; found ${matches.length}`);
  }
  return match;
}

function decodeXmlAttribute(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function parseAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([\w:-]+)="([^"]*)"/g;
  for (const match of tag.matchAll(attributePattern)) {
    const key = match[1];
    const value = match[2];
    if (key && value !== undefined) {
      attributes[key] = decodeXmlAttribute(value);
    }
  }
  return attributes;
}

function parseHierarchy(xml: string): HierarchyNode[] {
  const hierarchyTag = xml.match(/<hierarchy\b[^>]*>/)?.[0];
  if (!hierarchyTag) {
    throw new Error('UIAutomator XML has no hierarchy root');
  }
  const rotation = parseAttributes(hierarchyTag).rotation ?? '';
  if (rotation !== '0') {
    throw new Error(
      `expected portrait hierarchy rotation 0; found ${rotation || '<missing>'}`,
    );
  }

  const tokens = xml.match(/<\/?node\b[^>]*>/g) ?? [];
  const nodes: HierarchyNode[] = [];
  const openNodeIds: string[] = [];
  let topLevelNodeCount = 0;
  let rootPhysicalBounds: ParsedBounds | undefined;

  for (const token of tokens) {
    if (token.startsWith('</node')) {
      if (openNodeIds.length === 0) {
        throw new Error('invalid UIAutomator XML: unmatched closing node');
      }
      openNodeIds.pop();
      continue;
    }

    const attributes = parseAttributes(token);
    const id = resourceId(attributes['resource-id']);
    const label = id || attributes.class || 'unidentified node';
    const physicalBounds = parsePhysicalBounds(attributes.bounds, label);
    if (openNodeIds.length === 0) {
      topLevelNodeCount += 1;
      rootPhysicalBounds = physicalBounds;
    }
    nodes.push({
      ancestors: openNodeIds.filter(Boolean),
      bounds: toLogicalBounds(physicalBounds),
      clickable: booleanAttribute(attributes.clickable),
      contentDescription: stringAttribute(attributes['content-desc']),
      enabled: booleanAttribute(attributes.enabled, true),
      id,
      selected: booleanAttribute(attributes.selected),
      text: stringAttribute(attributes.text),
      visibleToUser: booleanAttribute(attributes['visible-to-user'], true),
    });

    if (!token.endsWith('/>')) {
      openNodeIds.push(id);
    }
  }

  if (openNodeIds.length !== 0) {
    throw new Error('invalid UIAutomator XML: unclosed node');
  }
  if (topLevelNodeCount !== 1 || !rootPhysicalBounds) {
    throw new Error(
      `expected exactly one hierarchy root; found ${topLevelNodeCount}`,
    );
  }
  if (
    rootPhysicalBounds.left !== 0 ||
    rootPhysicalBounds.top !== 0 ||
    rootPhysicalBounds.right !== ORION_PROFILE.physicalWidth ||
    rootPhysicalBounds.bottom !== ORION_PROFILE.physicalHeight
  ) {
    throw new Error(
      `expected physical root viewport [0,0][${ORION_PROFILE.physicalWidth},${ORION_PROFILE.physicalHeight}]; found [${rootPhysicalBounds.left},${rootPhysicalBounds.top}][${rootPhysicalBounds.right},${rootPhysicalBounds.bottom}]`,
    );
  }

  return nodes;
}

function fullyVisibleScopeOptions(
  nodes: HierarchyNode[],
  scope: HierarchyNode,
): HierarchyNode[] {
  return nodes.filter(
    (node) =>
      node.id.startsWith('scope-chip-option-') &&
      node.ancestors.includes('scope-chip') &&
      node.visibleToUser &&
      node.bounds.left >=
        scope.bounds.left + GEOMETRY_CONTRACT.scopeContentInset &&
      node.bounds.right <=
        scope.bounds.right - GEOMETRY_CONTRACT.scopeContentInset &&
      node.bounds.top >=
        scope.bounds.top + GEOMETRY_CONTRACT.scopeContentInset &&
      node.bounds.bottom <=
        scope.bounds.bottom - GEOMETRY_CONTRACT.scopeContentInset,
  );
}

function allScopeOptionIds(nodes: HierarchyNode[]): string[] {
  return nodes
    .filter(
      (node) =>
        node.id.startsWith('scope-chip-option-') &&
        node.ancestors.includes('scope-chip'),
    )
    .map((node) => node.id);
}

function accessibleLabel(node: HierarchyNode): string {
  return node.contentDescription || node.text;
}

export function verifyOrionHeaderEvidence(
  headerXml: string,
  endScrolledXml: string,
): OrionHeaderVerification {
  const headerNodes = parseHierarchy(headerXml);
  const endScrolledNodes = parseHierarchy(endScrolledXml);
  const scope = exactlyOne(
    headerNodes,
    (node) => node.id === 'scope-chip',
    'scope chip',
  );
  const endScrolledScope = exactlyOne(
    endScrolledNodes,
    (node) => node.id === 'scope-chip',
    'scope chip in end-scrolled snapshot',
  );
  const avatar = exactlyOne(
    headerNodes,
    (node) => node.id === 'account-avatar-button',
    'Account avatar',
  );
  const heading = exactlyOne(
    headerNodes,
    (node) => node.id === 'support-hub-mentor-heading',
    'Support-hub page heading',
  );
  const subtitle = exactlyOne(
    headerNodes,
    (node) => node.id === 'support-hub-mentor-subtitle',
    'Support-hub page subtitle',
  );
  const supportHub = exactlyOne(
    headerNodes,
    (node) => node.id === 'support-hub-mentor-tab',
    'Support-hub Mentor surface',
  );
  const observedOptions = [
    ...fullyVisibleScopeOptions(headerNodes, scope),
    ...fullyVisibleScopeOptions(endScrolledNodes, endScrolledScope),
  ];
  const uniqueOptions = new Map<string, HierarchyNode>();
  for (const option of observedOptions) {
    if (!uniqueOptions.has(option.id)) {
      uniqueOptions.set(option.id, option);
    }
  }
  const optionIds = [
    ...new Set([
      ...allScopeOptionIds(headerNodes),
      ...allScopeOptionIds(endScrolledNodes),
    ]),
  ].sort();
  const personOptionIds = optionIds.filter((id) =>
    id.startsWith('scope-chip-option-person-'),
  );
  const [personOptionId] = personOptionIds;
  const expectedOptionIds = personOptionId
    ? [...EXPECTED_OPTIONS.keys(), personOptionId].sort()
    : [];
  if (
    !personOptionId ||
    personOptionIds.length !== 1 ||
    optionIds.length !== 3 ||
    optionIds.some((id, index) => id !== expectedOptionIds[index])
  ) {
    throw new Error(
      `expected exactly Support hub, one person, and Me scope options; found ${optionIds.join(', ') || '<none>'}`,
    );
  }

  const errors: string[] = [];
  for (const id of expectedOptionIds) {
    if (!uniqueOptions.has(id)) {
      errors.push(`scope option ${id} must be fully visible in one snapshot`);
    }
  }
  const expectedChromeTop =
    ORION_PROFILE.safeAreaTop + GEOMETRY_CONTRACT.chromeTopInset;
  const chromeBottom = Math.max(scope.bounds.bottom, avatar.bounds.bottom);
  if (scope.bounds.right + GEOMETRY_CONTRACT.chromeGap > avatar.bounds.left) {
    errors.push(
      `scope.right + gap (${scope.bounds.right} + ${GEOMETRY_CONTRACT.chromeGap}) must be <= avatar.left (${avatar.bounds.left})`,
    );
  }
  if (scope.bounds.top < expectedChromeTop) {
    errors.push(
      `scope.top (${scope.bounds.top}) must be >= safe-area + inset (${expectedChromeTop})`,
    );
  }
  if (avatar.bounds.top < expectedChromeTop) {
    errors.push(
      `avatar.top (${avatar.bounds.top}) must be >= safe-area + inset (${expectedChromeTop})`,
    );
  }
  if (supportHub.bounds.top < chromeBottom) {
    errors.push(
      `Support-hub surface.top (${supportHub.bounds.top}) must be >= chrome.bottom (${chromeBottom})`,
    );
  }
  if (heading.bounds.top < chromeBottom) {
    errors.push(
      `heading.top (${heading.bounds.top}) must be >= chrome.bottom (${chromeBottom})`,
    );
  }
  if (subtitle.bounds.top < heading.bounds.bottom) {
    errors.push(
      `subtitle.top (${subtitle.bounds.top}) must be >= heading.bottom (${heading.bounds.bottom})`,
    );
  }

  for (const [id, option] of uniqueOptions) {
    if (
      option.bounds.width < GEOMETRY_CONTRACT.minimumTarget ||
      option.bounds.height < GEOMETRY_CONTRACT.minimumTarget
    ) {
      errors.push(
        `scope option ${id} must be at least 44x44 (got ${option.bounds.width}x${option.bounds.height})`,
      );
    }
    if (!option.clickable || !option.enabled) {
      errors.push(`scope option ${id} must be enabled and clickable`);
    }
  }
  if (
    avatar.bounds.width < GEOMETRY_CONTRACT.minimumTarget ||
    avatar.bounds.height < GEOMETRY_CONTRACT.minimumTarget
  ) {
    errors.push(
      `avatar must be at least 44x44 (got ${avatar.bounds.width}x${avatar.bounds.height})`,
    );
  }
  if (!avatar.clickable || !avatar.enabled) {
    errors.push('avatar must be enabled and clickable');
  }

  for (const [id, expectedLabel] of EXPECTED_OPTIONS) {
    const option = uniqueOptions.get(id);
    if (option && accessibleLabel(option) !== expectedLabel) {
      errors.push(
        `${id} must expose the full accessible label "${expectedLabel}" (got "${accessibleLabel(option)}")`,
      );
    }
  }
  const personOption = uniqueOptions.get(personOptionId);
  if (personOption && accessibleLabel(personOption) !== 'Test Supportee') {
    errors.push(
      `person scope must expose the full accessible label "Test Supportee" (got "${accessibleLabel(personOption)}")`,
    );
  }
  const headerHubOption = exactlyOne(
    headerNodes,
    (node) => node.id === 'scope-chip-option-supporter-hub',
    'Support-hub option in header snapshot',
  );
  if (!headerHubOption.selected) {
    errors.push('Support-hub option must be selected in the header snapshot');
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return {
    density: ORION_PROFILE.density,
    logicalViewport: '360x760',
    optionIds,
    safeAreaTop: ORION_PROFILE.safeAreaTop,
    snapshotCount: 2,
  };
}

function runCli(): void {
  const headerHierarchyPath = process.argv[2];
  const endScrolledHierarchyPath = process.argv[3];
  if (
    !headerHierarchyPath ||
    !endScrolledHierarchyPath ||
    process.argv.length !== 4
  ) {
    console.error(
      'Usage: pnpm exec tsx apps/mobile/scripts/verify-wi2176-orion-header.ts <support-hub-header.xml> <end-scrolled-options.xml>',
    );
    process.exitCode = 2;
    return;
  }

  try {
    const result = verifyOrionHeaderEvidence(
      readFileSync(headerHierarchyPath, 'utf8'),
      readFileSync(endScrolledHierarchyPath, 'utf8'),
    );
    console.log(
      `WI-2176_ORION_HEADER=SOUND logical_viewport=${result.logicalViewport} density=${result.density} safe_area_top=${result.safeAreaTop} scope_options=${result.optionIds.length} snapshots=${result.snapshotCount}`,
    );
  } catch (error) {
    console.error(
      `WI-2176_ORION_HEADER=FAILED ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  runCli();
}
