import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// WI-2553 ratified the voice-floor exception ledger
// (docs/compliance/voice-floor-exception-ledger.md) from the operator ruling
// of 2026-08-01. This guard keeps that ledger honest:
//  - a ledgered surface that disappears or is renamed fails here, forcing a
//    ledger update in the same change-set;
//  - speech-input wiring appearing on a typed-only surface fails here, so an
//    exception cannot silently erode;
//  - the corrected VFX-3a premise (the web birthdate input and the
//    save-wizard birth-year inputs are genuine free-text TextInputs, NOT
//    "structurally a picker") is asserted explicitly so a future guard or
//    ledger edit cannot rebuild on the disproved rationale.
// Changing a disposition requires an operator ruling on WI-2553 (or a
// successor item), plus matching ledger + guard edits in one change-set.

const LEDGER_DOC = 'docs/compliance/voice-floor-exception-ledger.md';

const SPEECH_WIRING =
  /useSpeechRecognition|use-speech-recognition|VoiceRecordButton|expo-speech-recognition/;

type Disposition = 'typed-only' | 'voice-permitted';

interface LedgerFile {
  /** Ledger entry IDs whose surfaces live in this file. */
  entries: string[];
  /** Repo-relative path, exactly as the ledger doc cites it. */
  file: string;
  /** Anchor strings (testIDs / constants) the ledger cites in this file. */
  anchors: string[];
  disposition: Disposition;
  /**
   * 'file'    — no speech wiring anywhere in the file (all ledgered inputs in
   *             the file are typed-only and nothing else in the file may
   *             legitimately carry a mic today).
   * 'element' — mixed-disposition file: only the anchored typed-only elements
   *             are checked for speech wiring (VFX-3b surfaces in the same
   *             file may gain a mic under WI-3007).
   * 'none'    — voice-permitted: anchors must exist; no absence check.
   */
  micCheck: 'file' | 'element' | 'none';
}

const LEDGER: LedgerFile[] = [
  // VFX-1 — password / verification code — typed-only
  {
    entries: ['VFX-1', 'VFX-2'],
    file: 'apps/mobile/src/app/(auth)/sign-in.tsx',
    anchors: ['sign-in-verify-code', 'sign-in-email'],
    disposition: 'typed-only',
    micCheck: 'file',
  },
  {
    entries: ['VFX-1', 'VFX-2'],
    file: 'apps/mobile/src/app/(auth)/sign-up.tsx',
    anchors: ['sign-up-code', 'sign-up-password', 'sign-up-email'],
    disposition: 'typed-only',
    micCheck: 'file',
  },
  {
    entries: ['VFX-1', 'VFX-2'],
    file: 'apps/mobile/src/app/(auth)/forgot-password.tsx',
    anchors: ['reset-code', 'reset-new-password', 'forgot-password-email'],
    disposition: 'typed-only',
    micCheck: 'file',
  },
  {
    entries: ['VFX-1'],
    file: 'apps/mobile/src/components/common/PasswordInput.tsx',
    anchors: ['password-toggle'],
    disposition: 'typed-only',
    micCheck: 'file',
  },
  {
    entries: ['VFX-1'],
    file: 'apps/mobile/src/components/add-password.tsx',
    anchors: ['add-password-new', 'add-password-confirm'],
    disposition: 'typed-only',
    micCheck: 'file',
  },
  {
    entries: ['VFX-1'],
    file: 'apps/mobile/src/components/change-password.tsx',
    anchors: ['current-password', 'new-password', 'confirm-password'],
    disposition: 'typed-only',
    micCheck: 'file',
  },
  {
    entries: ['VFX-1', 'VFX-2'],
    file: 'apps/mobile/src/components/change-email.tsx',
    anchors: ['change-email-code', 'change-email-input'],
    disposition: 'typed-only',
    micCheck: 'file',
  },
  // VFX-2 — email / consent / legal-link — typed-only
  {
    entries: ['VFX-2'],
    file: 'apps/mobile/src/app/consent.tsx',
    anchors: ['consent-email'],
    disposition: 'typed-only',
    micCheck: 'file',
  },
  {
    entries: ['VFX-2'],
    file: 'apps/mobile/src/app/(app)/link/initiate.tsx',
    anchors: ['visibility-link-initiate-existing-teen-email'],
    disposition: 'typed-only',
    micCheck: 'file',
  },
  {
    entries: ['VFX-2'],
    file: 'apps/mobile/src/app/(app)/_components/ConsentPendingGate.tsx',
    anchors: ['consent-new-email-input'],
    disposition: 'typed-only',
    micCheck: 'file',
  },
  {
    entries: ['VFX-2'],
    file: 'apps/mobile/src/app/(app)/_components/AdultSelfConsentGate.tsx',
    anchors: ['adult-self-consent-accept'],
    disposition: 'typed-only',
    micCheck: 'file',
  },
  // VFX-3a — date of birth / birth year — typed-only, element-scoped
  // (create-profile.tsx and ProfileBasicsStep.tsx also carry VFX-3b
  // voice-permitted display-name surfaces, so no file-level mic ban).
  {
    entries: ['VFX-3a'],
    file: 'apps/mobile/src/app/create-profile.tsx',
    anchors: ['create-profile-birthdate-input', 'create-profile-birthdate'],
    disposition: 'typed-only',
    micCheck: 'element',
  },
  {
    entries: ['VFX-3a'],
    file: 'apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx',
    anchors: [
      'save-basics-birth-year',
      'save-basics-parent-birth-year',
      'save-basics-child-birth-year',
    ],
    disposition: 'typed-only',
    micCheck: 'element',
  },
  // VFX-3b — profile display name — voice permitted (WI-3007)
  {
    entries: ['VFX-3b'],
    file: 'apps/mobile/src/app/create-profile.tsx',
    anchors: ['create-profile-name'],
    disposition: 'voice-permitted',
    micCheck: 'none',
  },
  {
    entries: ['VFX-3b'],
    file: 'apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx',
    anchors: [
      'save-basics-display-name',
      'save-basics-parent-name',
      'save-basics-child-name',
    ],
    disposition: 'voice-permitted',
    micCheck: 'none',
  },
  {
    entries: ['VFX-3b'],
    file: 'apps/mobile/src/app/profiles.tsx',
    anchors: ['rename-input'],
    disposition: 'voice-permitted',
    micCheck: 'none',
  },
  // VFX-4 — custom language / pronouns — voice permitted (WI-3006)
  {
    entries: ['VFX-4'],
    file: 'apps/mobile/src/app/(app)/onboarding/pronouns.tsx',
    anchors: ['pronouns-custom-input'],
    disposition: 'voice-permitted',
    micCheck: 'none',
  },
  {
    entries: ['VFX-4'],
    file: 'apps/mobile/src/app/(app)/onboarding/language-setup.tsx',
    anchors: ['native-language-other-input'],
    disposition: 'voice-permitted',
    micCheck: 'none',
  },
  // VFX-5 — exact DELETE confirmation — typed-only
  {
    entries: ['VFX-5'],
    file: 'apps/mobile/src/app/delete-account.tsx',
    anchors: ['DELETE_CONFIRMATION_PHRASE', 'delete-account-confirm-input'],
    disposition: 'typed-only',
    micCheck: 'file',
  },
  // VFX-6 — dictation preview / remediation — typed-only for now (WI-3008)
  {
    entries: ['VFX-6'],
    file: 'apps/mobile/src/app/(app)/dictation/text-preview.tsx',
    anchors: ['text-preview-input'],
    disposition: 'typed-only',
    micCheck: 'file',
  },
  {
    entries: ['VFX-6'],
    file: 'apps/mobile/src/app/(app)/dictation/review.tsx',
    anchors: ['review-correction-input'],
    disposition: 'typed-only',
    micCheck: 'file',
  },
];

// Until WI-3007 lands its sanctioned display-name mics, the two
// mixed-disposition files carry no speech wiring AT ALL, so we enforce a
// file-scoped ban here as defense in depth over the element-scoped floor
// (an element check sees only the anchored input's opening tag, not a
// sibling mic button wired to it). WI-3007 removes a file from this list in
// the SAME PR that adds its sanctioned mics — at which point the
// element-scoped VFX-3a checks remain the durable guard.
const MIXED_FILES_CURRENTLY_FULLY_TYPED: string[] = [
  'apps/mobile/src/app/create-profile.tsx',
  'apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx',
];

const repoRoot = resolve(__dirname, '../../../..');

function read(relPath: string): string {
  return readFileSync(resolve(repoRoot, relPath), 'utf-8');
}

/**
 * True when `anchor` occurs as a complete token — not as a prefix or suffix
 * of a longer testID/identifier (a rename to `review-correction-input-renamed`
 * must count as the anchor disappearing).
 */
function hasAnchorToken(source: string, anchor: string): boolean {
  const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(source);
}

/**
 * Extract the JSX element that carries `anchor` in `source`: from the last
 * `<` that opens a tag before the anchor to the first `/>` or `>` that closes
 * the opening tag after it. Wide enough to cover every prop of the element,
 * narrow enough not to swallow VFX-3b siblings.
 */
function enclosingElement(source: string, anchor: string): string {
  // Match the anchor as a complete quoted token so an anchor that is a
  // prefix of another (create-profile-birthdate vs …-birthdate-input)
  // resolves to its own element, not its sibling's.
  const at = [`"${anchor}"`, `'${anchor}'`]
    .map((q) => source.indexOf(q))
    .find((i) => i !== -1);
  if (at === undefined) return '';
  const open = source.lastIndexOf('<', at);
  const close = source.indexOf('/>', at);
  const closeAlt = source.indexOf('>', at);
  const end = close !== -1 && close <= closeAlt + 1 ? close + 2 : closeAlt + 1;
  if (open === -1 || end <= open) return '';
  return source.slice(open, end);
}

describe('WI-2553 — voice-floor exception-ledger coverage guard', () => {
  it('ledger doc exists', () => {
    expect(existsSync(resolve(repoRoot, LEDGER_DOC))).toBe(true);
  });

  it('every guard entry appears in the ledger doc (guard→doc sync)', () => {
    const doc = read(LEDGER_DOC);
    const missing: string[] = [];
    for (const entry of LEDGER) {
      if (!doc.includes(entry.file)) {
        missing.push(`file not in ledger doc: ${entry.file}`);
      }
      for (const anchor of entry.anchors) {
        if (!hasAnchorToken(doc, anchor)) {
          missing.push(`anchor not in ledger doc: ${anchor} (${entry.file})`);
        }
      }
      for (const id of entry.entries) {
        if (!doc.includes(id)) {
          missing.push(`entry id not in ledger doc: ${id}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('every surface file and anchor cited in the ledger doc is guarded (doc→guard sync)', () => {
    // The ledger doc promises every Surfaces-table file and anchor is
    // guard-asserted. Without this reverse direction, a new disposition added
    // to the doc alone would pass CI with no enforcement behind it.
    // Formatting contract (stated in the doc's Coverage guard section): the
    // first cell of a Surfaces row is the backticked repo-relative path;
    // every backticked token in the second cell is an anchor.
    const doc = read(LEDGER_DOC);
    const problems: string[] = [];

    const guardFiles = new Set(LEDGER.map((e) => e.file));
    for (const match of doc.matchAll(/`(apps\/[^`]+\.tsx)`/g)) {
      const citedFile = match[1];
      if (citedFile !== undefined && !guardFiles.has(citedFile)) {
        problems.push(
          `doc cites surface file the guard does not know: ${citedFile}`,
        );
      }
    }

    // Section-scoped: a Surfaces row is validated against the guard entries
    // of the VFX section it sits under, so an anchor filed under the wrong
    // entry (not merely a wrong file) also fails.
    let currentEntry: string | undefined;
    for (const line of doc.split('\n')) {
      const heading = line.match(/^### (VFX-\d+[ab]?)\b/);
      if (heading) {
        currentEntry = heading[1];
        continue;
      }
      const row = line.match(/^\|\s*`(apps\/[^`]+\.tsx)`\s*\|(.+)\|\s*$/);
      const file = row?.[1];
      const anchorsCell = row?.[2];
      if (file === undefined || anchorsCell === undefined) continue;
      if (currentEntry === undefined) {
        problems.push(`doc Surfaces row outside any VFX section: ${file}`);
        continue;
      }
      const entryId = currentEntry;
      const guardedAnchors = new Set(
        LEDGER.filter(
          (e) => e.file === file && e.entries.includes(entryId),
        ).flatMap((e) => e.anchors),
      );
      if (guardedAnchors.size === 0) {
        problems.push(
          `doc cites file the guard does not list under ${entryId}: ${file}`,
        );
        continue;
      }
      for (const token of anchorsCell.matchAll(/`([^`]+)`/g)) {
        const anchor = token[1];
        if (anchor !== undefined && !guardedAnchors.has(anchor)) {
          problems.push(
            `doc cites anchor the guard does not list under ${entryId}: ${anchor} (${file})`,
          );
        }
      }
    }

    expect(problems).toEqual([]);
  });

  it('every ledgered surface exists and carries its anchors', () => {
    const missing: string[] = [];
    for (const entry of LEDGER) {
      const abs = resolve(repoRoot, entry.file);
      if (!existsSync(abs)) {
        missing.push(`missing file: ${entry.file}`);
        continue;
      }
      const source = read(entry.file);
      for (const anchor of entry.anchors) {
        if (!hasAnchorToken(source, anchor)) {
          missing.push(`missing anchor: ${anchor} in ${entry.file}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('typed-only files carry no speech-input wiring (file-scoped)', () => {
    const violations: string[] = [];
    for (const entry of LEDGER.filter((e) => e.micCheck === 'file')) {
      const source = read(entry.file);
      if (SPEECH_WIRING.test(source)) {
        violations.push(
          `${entry.file} (${entry.entries.join(', ')}) contains speech-input wiring but is typed-only`,
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it('mixed-disposition files stay fully speech-free until WI-3007 lands (interim file-scoped ban)', () => {
    // Defense in depth over the element-scoped floor below: an element check
    // sees only the anchored input's opening tag, not a sibling mic button
    // wired to it. Today neither mixed file has ANY sanctioned mic, so the
    // whole file must be speech-free. WI-3007 removes a file from
    // MIXED_FILES_CURRENTLY_FULLY_TYPED in the same PR that adds its
    // sanctioned display-name mics.
    const violations: string[] = [];
    for (const file of MIXED_FILES_CURRENTLY_FULLY_TYPED) {
      if (SPEECH_WIRING.test(read(file))) {
        violations.push(
          `${file} contains speech-input wiring; if this is WI-3007's sanctioned display-name mic, move the file out of MIXED_FILES_CURRENTLY_FULLY_TYPED in the same PR — anything else is a VFX-3a violation`,
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it('typed-only elements in mixed-disposition files carry no speech-input wiring (element-scoped)', () => {
    const violations: string[] = [];
    for (const entry of LEDGER.filter((e) => e.micCheck === 'element')) {
      const source = read(entry.file);
      for (const anchor of entry.anchors) {
        const element = enclosingElement(source, anchor);
        if (element === '') {
          violations.push(
            `could not locate element for ${anchor} in ${entry.file}`,
          );
        } else if (
          SPEECH_WIRING.test(element) ||
          /\bonVoice[A-Z]\w*/.test(element)
        ) {
          violations.push(
            `${anchor} in ${entry.file} carries speech-input wiring but is typed-only (VFX-3a)`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('VFX-3a corrected premise holds: web birthdate and save-wizard birth-year inputs are free-text TextInputs', () => {
    // The disproved "structurally a picker" rationale claimed no text field
    // exists. These assertions pin the truth the ruling corrected it with.
    const createProfile = read('apps/mobile/src/app/create-profile.tsx');
    const basics = read(
      'apps/mobile/src/app/(app)/_components/save-wizard/ProfileBasicsStep.tsx',
    );
    expect(
      enclosingElement(createProfile, 'create-profile-birthdate-input'),
    ).toContain('<TextInput');
    for (const anchor of [
      'save-basics-birth-year',
      'save-basics-parent-birth-year',
      'save-basics-child-birth-year',
    ]) {
      expect(enclosingElement(basics, anchor)).toContain('<TextInput');
    }
  });

  it('VFX-2 consent premise holds: AdultSelfConsentGate has no text input', () => {
    const gate = read(
      'apps/mobile/src/app/(app)/_components/AdultSelfConsentGate.tsx',
    );
    expect(gate.includes('<TextInput')).toBe(false);
  });

  it('ledger doc states the binding invariants', () => {
    const doc = read(LEDGER_DOC);
    expect(doc).toContain('Transcription-only');
    expect(doc).toContain('No raw-audio persistence');
    expect(doc).toContain('Art 5(1)(f)');
  });
});
