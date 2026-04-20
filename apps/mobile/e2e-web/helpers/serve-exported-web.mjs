import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
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

const exportProcess = spawnPnpm(['exec', 'expo', 'export', '--platform', 'web']);

exportProcess.on('exit', (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }

  void startServer();
});
