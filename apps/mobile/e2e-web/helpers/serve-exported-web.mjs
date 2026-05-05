import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { access, stat, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, 'dist');
const port = Number(process.env.PLAYWRIGHT_WEB_PORT ?? '19006');
const host = '127.0.0.1';

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
};

function spawnPnpm(args) {
  return spawn(process.platform === 'win32' ? 'pnpm' : 'pnpm', args, {
    cwd: projectRoot,
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });
}

async function fileExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveAssetPath(urlPath) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let candidate = path.join(distDir, safePath);

  // [I-17] Path traversal containment — reject any resolved path that escapes distDir
  const resolvedCandidate = path.resolve(candidate);
  const resolvedDist = path.resolve(distDir);
  if (!resolvedCandidate.startsWith(resolvedDist + path.sep) && resolvedCandidate !== resolvedDist) {
    return null;
  }

  if (await fileExists(candidate)) {
    const candidateStats = await stat(candidate);
    if (candidateStats.isDirectory()) {
      candidate = path.join(candidate, 'index.html');
    }
    return candidate;
  }

  if (!path.extname(candidate)) {
    return path.join(distDir, 'index.html');
  }

  return null;
}

async function startServer() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${host}:${port}`);
    const assetPath = await resolveAssetPath(url.pathname);

    if (!assetPath) {
      response.statusCode = 404;
      response.end('Not found');
      return;
    }

    const extension = path.extname(assetPath).toLowerCase();
    response.setHeader(
      'Content-Type',
      mimeTypes[extension] ?? 'application/octet-stream'
    );
    createReadStream(assetPath).pipe(response);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(port, host, () => {
    console.log(`Static Expo web preview ready on http://${host}:${port}`);
  });
}

// ---------------------------------------------------------------------------
// Swap .env.local to override EXPO_PUBLIC_API_URL for E2E.
// Expo's @expo/env always reads .env.local and ignores process.env overrides
// for EXPO_PUBLIC_* vars, so we must edit the file directly.
// ---------------------------------------------------------------------------
const envFilesToOverride = ['.env.local', '.env.development.local'].map(
  (name) => ({
    path: path.join(projectRoot, name),
    backupPath: path.join(projectRoot, `${name}.e2e-bak`),
  })
);
const apiUrl = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:8787';
process.env.EXPO_PUBLIC_API_URL = apiUrl;
const generatedEnvFiles = new Set();

function overrideApiUrl(contents) {
  const replacement = `EXPO_PUBLIC_API_URL="${apiUrl}"`;
  if (/^EXPO_PUBLIC_API_URL=.*/m.test(contents)) {
    return contents.replace(/^EXPO_PUBLIC_API_URL=.*/m, replacement);
  }
  const suffix = contents.endsWith('\n') || contents.length === 0 ? '' : '\n';
  return `${contents}${suffix}${replacement}\n`;
}

async function overrideEnvFiles() {
  for (const envFile of envFilesToOverride) {
    if (await fileExists(envFile.path)) {
      const original = await readFile(envFile.path, 'utf-8');
      await rename(envFile.path, envFile.backupPath);
      await writeFile(envFile.path, overrideApiUrl(original), 'utf-8');
      continue;
    }
    generatedEnvFiles.add(envFile.path);
    await writeFile(envFile.path, `EXPO_PUBLIC_API_URL="${apiUrl}"\n`, 'utf-8');
  }
}

async function restoreEnvFiles() {
  for (const envFile of envFilesToOverride) {
    if (await fileExists(envFile.backupPath)) {
      await rename(envFile.backupPath, envFile.path);
      generatedEnvFiles.delete(envFile.path);
      continue;
    }
    if (generatedEnvFiles.has(envFile.path)) {
      await rm(envFile.path, { force: true });
    }
  }
}

await overrideEnvFiles();

const exportProcess = spawnPnpm([
  'exec', 'expo', 'export', '--platform', 'web', '--clear',
]);

exportProcess.on('exit', async (code) => {
  await restoreEnvFiles();

  if (code !== 0) {
    process.exit(code ?? 1);
  }

  void startServer();
});
