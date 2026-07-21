#!/usr/bin/env node

import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const REDACTED = '[REDACTED]';

function redactInputText(value) {
  if (Array.isArray(value)) {
    return value.map(redactInputText);
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
            ...redactInputText(child),
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
        const command = redactInputText(child);
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

      return [key, redactInputText(child)];
    }),
  );
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
    for (const path of commandFiles) {
      const parsed = JSON.parse(await readFile(path, 'utf8'));
      await writeFile(
        path,
        `${JSON.stringify(redactInputText(parsed), null, 2)}\n`,
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
