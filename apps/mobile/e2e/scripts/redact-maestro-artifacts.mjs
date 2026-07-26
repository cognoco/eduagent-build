#!/usr/bin/env node

import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const REDACTED = '[REDACTED]';

function collectSensitiveStrings(value, sensitiveStrings = new Set()) {
  if (Array.isArray(value)) {
    for (const child of value) {
      collectSensitiveStrings(child, sensitiveStrings);
    }
    return sensitiveStrings;
  }

  if (value === null || typeof value !== 'object') {
    return sensitiveStrings;
  }

  for (const [key, child] of Object.entries(value)) {
    if (
      key === 'inputTextCommand' &&
      child !== null &&
      typeof child === 'object' &&
      !Array.isArray(child) &&
      typeof child.text === 'string' &&
      child.text.length > 0 &&
      child.text !== REDACTED
    ) {
      sensitiveStrings.add(child.text);
    }

    if (
      key === 'defineVariablesCommand' &&
      child !== null &&
      typeof child === 'object' &&
      !Array.isArray(child) &&
      child.env !== null &&
      typeof child.env === 'object' &&
      !Array.isArray(child.env)
    ) {
      for (const envValue of Object.values(child.env)) {
        if (
          typeof envValue === 'string' &&
          envValue.length > 0 &&
          envValue !== REDACTED
        ) {
          sensitiveStrings.add(envValue);
        }
      }
    }

    collectSensitiveStrings(child, sensitiveStrings);
  }

  return sensitiveStrings;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactSensitiveCopies(value, sensitivePattern) {
  if (Array.isArray(value)) {
    return value.map((child) => redactSensitiveCopies(child, sensitivePattern));
  }

  if (typeof value === 'string') {
    return sensitivePattern ? value.replace(sensitivePattern, REDACTED) : value;
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      sensitivePattern ? key.replace(sensitivePattern, REDACTED) : key,
      redactSensitiveCopies(child, sensitivePattern),
    ]),
  );
}

function redactCommandFields(value) {
  if (Array.isArray(value)) {
    return value.map(redactCommandFields);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => {
      if (
        key === 'inputTextCommand' &&
        child !== null &&
        typeof child === 'object' &&
        !Array.isArray(child)
      ) {
        return [
          key,
          {
            ...redactCommandFields(child),
            ...(typeof child.text === 'string' ? { text: REDACTED } : {}),
          },
        ];
      }

      if (
        key === 'defineVariablesCommand' &&
        child !== null &&
        typeof child === 'object' &&
        !Array.isArray(child)
      ) {
        const command = redactCommandFields(child);
        if (
          child.env !== null &&
          typeof child.env === 'object' &&
          !Array.isArray(child.env)
        ) {
          command.env = Object.fromEntries(
            Object.keys(child.env).map((variable) => [variable, REDACTED]),
          );
        }
        return [key, command];
      }

      return [key, redactCommandFields(child)];
    }),
  );
}

function containsSensitiveString(value, sensitiveStrings) {
  if (typeof value === 'string') {
    return sensitiveStrings.some((secret) => value.includes(secret));
  }
  if (Array.isArray(value)) {
    return value.some((child) =>
      containsSensitiveString(child, sensitiveStrings),
    );
  }
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return Object.entries(value).some(
    ([key, child]) =>
      sensitiveStrings.some((secret) => key.includes(secret)) ||
      containsSensitiveString(child, sensitiveStrings),
  );
}

function redactInputText(value, directorySensitiveStrings) {
  const sensitiveStrings = [...directorySensitiveStrings].sort(
    (left, right) => right.length - left.length,
  );
  const sensitivePattern =
    sensitiveStrings.length > 0
      ? new RegExp(sensitiveStrings.map(escapeRegExp).join('|'), 'g')
      : null;
  const redacted = redactCommandFields(
    redactSensitiveCopies(value, sensitivePattern),
  );
  if (containsSensitiveString(redacted, sensitiveStrings)) {
    throw new Error('sensitive Maestro value remained after redaction');
  }
  return redacted;
}

async function collectCommandFiles(directory) {
  const commandFiles = [];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      commandFiles.push(...(await collectCommandFiles(path)));
      continue;
    }

    if (entry.isFile() && /^commands-.*\.json$/.test(entry.name)) {
      commandFiles.push(path);
    }
  }

  return commandFiles;
}

async function redactDirectory(directory) {
  const commandFiles = await collectCommandFiles(directory);

  try {
    const recordings = await Promise.all(
      commandFiles.map(async (path) => ({
        path,
        parsed: JSON.parse(await readFile(path, 'utf8')),
      })),
    );
    const directorySensitiveStrings = new Set();
    for (const { parsed } of recordings) {
      collectSensitiveStrings(parsed, directorySensitiveStrings);
    }

    for (const { path, parsed } of recordings) {
      await writeFile(
        path,
        `${JSON.stringify(
          redactInputText(parsed, directorySensitiveStrings),
          null,
          2,
        )}\n`,
        'utf8',
      );
    }
  } catch (error) {
    await Promise.allSettled(
      commandFiles.map((path) => rm(path, { force: true })),
    );
    throw error;
  }
}

const artifactDirectory = process.argv[2];
if (!artifactDirectory) {
  throw new Error('Usage: redact-maestro-artifacts.mjs <artifact-directory>');
}

try {
  await redactDirectory(artifactDirectory);
} catch {
  console.error(
    '[maestro-artifacts] ERROR: command recordings were not safe to upload',
  );
  process.exitCode = 1;
}
