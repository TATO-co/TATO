import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const outputDir = path.join(projectRoot, 'dist-web-smoke');
const port = Number(process.env.PLAYWRIGHT_WEB_PORT ?? 4173);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function hydrateEnvFile(filename) {
  const filePath = path.join(projectRoot, filename);
  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || key in process.env) {
      continue;
    }

    const value = trimmed.slice(separatorIndex + 1).trim();
    process.env[key] = value.replace(/^['"]|['"]$/g, '');
  }
}

function runExport() {
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  execFileSync(
    npxCommand,
    ['expo', 'export', '--platform', 'web', '--output-dir', outputDir],
    {
      cwd: projectRoot,
      stdio: 'inherit',
    },
  );
}

function withinOutputDir(candidatePath) {
  const relative = path.relative(outputDir, candidatePath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function getFallbackFile() {
  const notFoundPath = path.join(outputDir, '+not-found.html');
  if (existsSync(notFoundPath)) {
    return notFoundPath;
  }

  return path.join(outputDir, 'index.html');
}

function tryResolveFile(requestPath) {
  const normalizedPath = requestPath.replace(/^\/+/, '');
  const candidates = [];

  if (!normalizedPath) {
    candidates.push(path.join(outputDir, 'index.html'));
  } else {
    candidates.push(path.join(outputDir, normalizedPath));

    if (!path.extname(normalizedPath)) {
      candidates.push(path.join(outputDir, `${normalizedPath}.html`));
      candidates.push(path.join(outputDir, normalizedPath, 'index.html'));
    }
  }

  for (const candidate of candidates) {
    if (!withinOutputDir(candidate) || !existsSync(candidate)) {
      continue;
    }

    const stats = statSync(candidate);
    if (stats.isFile()) {
      return candidate;
    }
  }

  return getFallbackFile();
}

hydrateEnvFile('.env.local');
hydrateEnvFile('.env');
runExport();

const server = createServer((request, response) => {
  const host = request.headers.host ?? `127.0.0.1:${port}`;
  const url = new URL(request.url ?? '/', `http://${host}`);
  const resolvedPath = tryResolveFile(decodeURIComponent(url.pathname));
  const extension = path.extname(resolvedPath);
  const contentType = mimeTypes[extension] ?? 'application/octet-stream';

  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  const stream = createReadStream(resolvedPath);
  stream.on('error', () => {
    if (!response.headersSent) {
      response.writeHead(404, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      });
    }

    response.end('Not found');
  });
  stream.pipe(response);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

server.listen(port, '127.0.0.1', () => {
  // Keep this line concise because Playwright uses the configured URL probe.
  console.log(`Static web smoke server ready at http://127.0.0.1:${port}`);
});
