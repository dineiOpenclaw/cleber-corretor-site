const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 8081);
const HOST = process.env.HOST || '0.0.0.0';
const SITE_ORIGIN = process.env.CC_SITE_ORIGIN || 'https://imoveis.codeflowsoluctions.com';
const API_BASE = process.env.CC_API_BASE || 'https://cadastro.codeflowsoluctions.com';
const SITE_NAME = process.env.CC_SITE_NAME || 'Cléber Corretor';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function readStaticFile(filePath) {
  return fs.promises.readFile(filePath);
}

function contentType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function safeJoin(root, requestPath) {
  const normalized = path.posix.normalize(requestPath).replace(/^\/+/, '');
  const absolute = path.resolve(root, normalized);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return absolute;
}

function configScript() {
  return [
    `window.CC_SITE_ORIGIN = ${JSON.stringify(SITE_ORIGIN)};`,
    `window.CC_API_BASE = ${JSON.stringify(API_BASE)};`,
    `window.CC_SITE_NAME = ${JSON.stringify(SITE_NAME)};`,
    '',
  ].join('\n');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);

    if (pathname === '/config.js') {
      return send(res, 200, configScript(), {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
      });
    }

    const filePath = safeJoin(ROOT_DIR, pathname);
    if (!filePath) {
      return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
    }

    let stat;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    }

    if (!stat.isFile()) {
      return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    }

    const data = await readStaticFile(filePath);
    return send(res, 200, data, {
      'Content-Type': contentType(filePath),
      'Cache-Control': pathname.endsWith('.html') ? 'no-cache' : 'public, max-age=3600',
    });
  } catch (error) {
    console.error('[site-server] error:', error);
    return send(res, 500, 'Internal Server Error', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[site-server] ${SITE_NAME} listening on http://${HOST}:${PORT}`);
});
