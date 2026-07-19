import { readFileSync } from 'node:fs';

import { XMLParser, XMLValidator } from 'fast-xml-parser';

const GEOMETRY_CONTRACT = {
  // Mirrors V2_CHROME_MIN_TOP_INSET in apps/mobile/src/app/(app)/_layout.tsx.
  safeAreaMinimum: 24,
  // Mirrors ScopeChip's `contentContainerClassName="... p-1"` viewport inset.
  scopeContentInset: 4,
} as const;

const SUPPORT_HUB_HEADING = 'Support hub';
const SUPPORT_HUB_SUBTITLE =
  'Shared signals and next steps for the learners you support.';

interface XmlNode {
  bounds?: unknown;
  class?: unknown;
  'content-desc'?: unknown;
  node?: XmlNode | XmlNode[];
  'resource-id'?: unknown;
  text?: unknown;
  'visible-to-user'?: unknown;
}

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
  id: string;
  text: string;
  visibleToUser: boolean;
}

export interface OrionHeaderVerification {
  safeAreaMinimum: number;
  scopeOptionCount: number;
  snapshotCount: number;
}

function stringAttribute(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function resourceId(value: unknown): string {
  const raw = stringAttribute(value);
  const slash = raw.lastIndexOf('/');
  return slash >= 0 ? raw.slice(slash + 1) : raw;
}

function parseBounds(value: unknown, label: string): ParsedBounds {
  const raw = stringAttribute(value);
  if (!raw.startsWith('[') || !raw.endsWith(']')) {
    throw new Error(`${label} has no usable UIAutomator bounds`);
  }

  const pairs = raw.slice(1, -1).split('][');
  if (pairs.length !== 2) {
    throw new Error(`${label} has malformed UIAutomator bounds: ${raw}`);
  }

  const coordinates = pairs.flatMap((pair) =>
    pair.split(',').map((coordinate) => Number(coordinate)),
  );
  if (
    coordinates.length !== 4 ||
    coordinates.some((coordinate) => !Number.isInteger(coordinate))
  ) {
    throw new Error(`${label} has malformed UIAutomator bounds: ${raw}`);
  }

  const [left, top, right, bottom] = coordinates;
  if (
    left === undefined ||
    top === undefined ||
    right === undefined ||
    bottom === undefined
  ) {
    throw new Error(`${label} has malformed UIAutomator bounds: ${raw}`);
  }
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

function toArray(value: XmlNode | XmlNode[] | undefined): XmlNode[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function flattenNodes(
  rawNodes: XmlNode | XmlNode[] | undefined,
  ancestors: string[] = [],
): HierarchyNode[] {
  return toArray(rawNodes).flatMap((rawNode) => {
    const id = resourceId(rawNode['resource-id']);
    const label = id || stringAttribute(rawNode.class) || 'unidentified node';
    const node: HierarchyNode = {
      ancestors,
      bounds: parseBounds(rawNode.bounds, label),
      id,
      text: stringAttribute(rawNode.text),
      visibleToUser: stringAttribute(rawNode['visible-to-user']) !== 'false',
    };
    const childAncestors = id ? [...ancestors, id] : ancestors;
    return [node, ...flattenNodes(rawNode.node, childAncestors)];
  });
}

function exactlyOne(
  nodes: HierarchyNode[],
  predicate: (node: HierarchyNode) => boolean,
  label: string,
): HierarchyNode {
  const matches = nodes.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`expected exactly one ${label}; found ${matches.length}`);
  }
  const match = matches[0];
  if (!match) {
    throw new Error(`expected exactly one ${label}; found 0`);
  }
  return match;
}

function parseHierarchy(xml: string): HierarchyNode[] {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new Error(`invalid UIAutomator XML: ${validation.err.msg}`);
  }

  const parser = new XMLParser({
    attributeNamePrefix: '',
    ignoreAttributes: false,
    parseAttributeValue: false,
  });
  const parsed = parser.parse(xml) as {
    hierarchy?: { node?: XmlNode | XmlNode[]; rotation?: unknown };
  };
  if (!parsed.hierarchy) {
    throw new Error('UIAutomator XML has no hierarchy root');
  }

  const rotation = stringAttribute(parsed.hierarchy.rotation);
  if (rotation !== '0') {
    throw new Error(
      `expected portrait hierarchy rotation 0; found ${rotation || '<missing>'}`,
    );
  }

  const roots = toArray(parsed.hierarchy.node);
  if (roots.length !== 1) {
    throw new Error(
      `expected exactly one hierarchy root; found ${roots.length}`,
    );
  }
  const root = roots[0];
  if (!root) {
    throw new Error('expected exactly one hierarchy root; found 0');
  }
  const rootBounds = parseBounds(root.bounds, 'hierarchy root');
  if (
    rootBounds.left !== 0 ||
    rootBounds.top !== 0 ||
    rootBounds.right !== 360 ||
    rootBounds.bottom !== 760
  ) {
    throw new Error(
      `expected root viewport [0,0][360,760]; found [${rootBounds.left},${rootBounds.top}][${rootBounds.right},${rootBounds.bottom}]`,
    );
  }

  return flattenNodes(roots);
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
    (node) =>
      node.text === SUPPORT_HUB_HEADING &&
      !node.ancestors.some((id) => id.startsWith('scope-chip')),
    'English Support-hub page heading outside the scope chip',
  );
  const subtitle = exactlyOne(
    headerNodes,
    (node) => node.text === SUPPORT_HUB_SUBTITLE,
    'English Support-hub page subtitle',
  );
  const scopeOptionObservations = [
    ...fullyVisibleScopeOptions(headerNodes, scope),
    ...fullyVisibleScopeOptions(endScrolledNodes, endScrolledScope),
  ];
  const scopeOptionIds = new Set(
    scopeOptionObservations.map((option) => option.id),
  );
  const personOptionIds = [...scopeOptionIds].filter((id) =>
    id.startsWith('scope-chip-option-person-'),
  );
  if (
    !scopeOptionIds.has('scope-chip-option-supporter-hub') ||
    personOptionIds.length < 2
  ) {
    throw new Error(
      `expected fully visible observations for the Support hub and at least two person scope options; found ${scopeOptionIds.size}`,
    );
  }

  const errors: string[] = [];
  if (scope.bounds.right > avatar.bounds.left) {
    errors.push(
      `scope.right (${scope.bounds.right}) must be <= avatar.left (${avatar.bounds.left})`,
    );
  }

  const chromeBottom = Math.max(scope.bounds.bottom, avatar.bounds.bottom);
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
  if (scope.bounds.top < GEOMETRY_CONTRACT.safeAreaMinimum) {
    errors.push(
      `scope.top (${scope.bounds.top}) must be >= safe-area minimum (${GEOMETRY_CONTRACT.safeAreaMinimum})`,
    );
  }
  if (avatar.bounds.top < GEOMETRY_CONTRACT.safeAreaMinimum) {
    errors.push(
      `avatar.top (${avatar.bounds.top}) must be >= safe-area minimum (${GEOMETRY_CONTRACT.safeAreaMinimum})`,
    );
  }

  for (const option of scopeOptionObservations) {
    if (option.bounds.width < 44 || option.bounds.height < 44) {
      errors.push(
        `scope option ${option.id} must be at least 44x44 (got ${option.bounds.width}x${option.bounds.height})`,
      );
    }
  }
  if (avatar.bounds.width < 44 || avatar.bounds.height < 44) {
    errors.push(
      `avatar must be at least 44x44 (got ${avatar.bounds.width}x${avatar.bounds.height})`,
    );
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return {
    safeAreaMinimum: GEOMETRY_CONTRACT.safeAreaMinimum,
    scopeOptionCount: scopeOptionIds.size,
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
      `WI-2176_ORION_HEADER=SOUND viewport=360x760 rotation=0 safe_area_min=${result.safeAreaMinimum} scope_options=${result.scopeOptionCount} snapshots=${result.snapshotCount}`,
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
