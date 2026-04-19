import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from './types';

// ---------------------------------------------------------------------------
// Snapshot writer — produces one markdown file per (flow × profile).
// File layout: apps/api/eval-llm/snapshots/{flow.id}/{profile.id}.md
//
// The format is optimised for diff review: fenced blocks for prompt bodies,
// consistent section order, truncation notes for long outputs.
// ---------------------------------------------------------------------------

export interface SnapshotInputs {
  flow: FlowDefinition;
  profile: EvalProfile;
  builderInput: unknown;
  messages: PromptMessages;
  liveResponse?: string; // only present when --live was passed and runLive exists
  liveProvider?: string;
  liveModel?: string;
  liveError?: string; // error message if live call failed
  /** Response failed expectedResponseSchema validation — message describes how. */
  schemaViolation?: string;
}

const SNAPSHOTS_DIR = path.resolve(__dirname, '..', 'snapshots');

export async function ensureSnapshotDir(flowId: string): Promise<string> {
  const dir = path.join(SNAPSHOTS_DIR, flowId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeSnapshot(inputs: SnapshotInputs): Promise<string> {
  const dir = await ensureSnapshotDir(inputs.flow.id);
  const filePath = path.join(dir, `${inputs.profile.id}.md`);
  const body = renderSnapshot(inputs);
  await fs.writeFile(filePath, body, 'utf8');
  return filePath;
}

function renderSnapshot(inputs: SnapshotInputs): string {
  const {
    flow,
    profile,
    builderInput,
    messages,
    liveResponse,
    liveProvider,
    liveModel,
    liveError,
  } = inputs;

  const sections: string[] = [];

  sections.push(`# ${flow.name} × ${profile.id}`);
  sections.push(``);
  sections.push(`> **Flow source:** \`${flow.sourceFile}\``);
  sections.push(`> **Profile:** ${profile.description}`);
  sections.push(``);

  sections.push(`## Profile summary`);
  sections.push(``);
  sections.push(renderProfileTable(profile));
  sections.push(``);

  sections.push(`## Builder input`);
  sections.push(``);
  sections.push('```json');
  sections.push(JSON.stringify(builderInput, stringifyReplacer, 2));
  sections.push('```');
  sections.push(``);

  sections.push(`## Generated prompt — system`);
  sections.push(``);
  sections.push('```');
  sections.push(messages.system);
  sections.push('```');
  sections.push(``);

  if (messages.user) {
    sections.push(`## Generated prompt — user`);
    sections.push(``);
    sections.push('```');
    sections.push(messages.user);
    sections.push('```');
    sections.push(``);
  }

  if (messages.notes && messages.notes.length > 0) {
    sections.push(`## Builder notes`);
    sections.push(``);
    for (const note of messages.notes) {
      sections.push(`- ${note}`);
    }
    sections.push(``);
  }

  const schemaViolation = inputs.schemaViolation;
  if (schemaViolation) {
    sections.push(`## ⚠️ Schema violation`);
    sections.push(``);
    sections.push(
      `The live LLM response did not conform to the flow's \`expectedResponseSchema\`:`
    );
    sections.push(``);
    sections.push('```');
    sections.push(schemaViolation);
    sections.push('```');
    sections.push(``);
  }

  if (liveError) {
    sections.push(`## Live LLM response`);
    sections.push(``);
    sections.push(`> **Error:** \`${liveError}\``);
    sections.push(``);
  } else if (liveResponse !== undefined) {
    sections.push(`## Live LLM response`);
    sections.push(``);
    if (liveProvider || liveModel) {
      sections.push(
        `> **Provider:** \`${liveProvider ?? 'unknown'}\` — **Model:** \`${
          liveModel ?? 'unknown'
        }\``
      );
      sections.push(``);
    }
    sections.push('```');
    sections.push(truncate(liveResponse, 8000));
    sections.push('```');
    sections.push(``);
  }

  return sections.join('\n');
}

function renderProfileTable(profile: EvalProfile): string {
  const rows: Array<[string, string]> = [
    ['Age', `${profile.ageYears} years (birth year ${profile.birthYear})`],
    ['Native language', profile.nativeLanguage],
    ['Conversation language', profile.conversationLanguage],
    ['Location', profile.location],
    ['Pronouns', profile.pronouns ?? '— (not provided)'],
    [
      'Interests',
      profile.interests
        .map((i) => `${i.label} (${i.context.replace('_', ' ')})`)
        .join(', ') || '—',
    ],
    ['Library topics', profile.libraryTopics.join(', ') || '—'],
    ['CEFR', profile.cefrLevel ?? '—'],
    ['Target language', profile.targetLanguage ?? '—'],
    [
      'Struggles',
      profile.struggles
        .map((s) => `${s.topic}${s.subject ? ` (${s.subject})` : ''}`)
        .join('; ') || '—',
    ],
    [
      'Strengths',
      profile.strengths
        .map((s) => `${s.topic}${s.subject ? ` (${s.subject})` : ''}`)
        .join('; ') || '—',
    ],
    ['Learning mode', profile.learningMode],
    ['Preferred explanations', profile.preferredExplanations.join(', ')],
    ['Pace', profile.pacePreference],
    ['Analogy domain', profile.analogyDomain ?? '—'],
  ];

  const lines = ['| Field | Value |', '|---|---|'];
  for (const [k, v] of rows) {
    lines.push(`| ${k} | ${escapePipes(v)} |`);
  }
  return lines.join('\n');
}

function escapePipes(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const head = value.slice(0, Math.floor(maxChars * 0.7));
  const tail = value.slice(-Math.floor(maxChars * 0.2));
  return `${head}\n\n[... truncated ${
    value.length - head.length - tail.length
  } chars ...]\n\n${tail}`;
}

// Replacer for JSON.stringify — abbreviates very long strings so the builder
// input block stays readable when someone passes a bank of 50 vocabulary
// entries as input.
function stringifyReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'string' && value.length > 400) {
    return `${value.slice(0, 380)}… [+${value.length - 380} chars]`;
  }
  return value;
}
