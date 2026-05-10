const http = require('http');
const https = require('https');
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

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    client
      .get(url, (upstreamRes) => {
        const chunks = [];
        upstreamRes.on('data', (chunk) => chunks.push(chunk));
        upstreamRes.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          if ((upstreamRes.statusCode || 500) >= 400) {
            return reject(new Error(`upstream status ${upstreamRes.statusCode || 500}`));
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });
}

function toAbsoluteUrl(raw, baseUrl) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

function sharePreviewHtml({ title, description, image, pageUrl, shareUrl }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${escHtml(SITE_NAME)}">
  <meta property="og:title" content="${escHtml(title)}">
  <meta property="og:description" content="${escHtml(description)}">
  <meta property="og:image" content="${escHtml(image)}">
  <meta property="og:image:secure_url" content="${escHtml(image)}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${escHtml(shareUrl || pageUrl)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escHtml(title)}">
  <meta name="twitter:description" content="${escHtml(description)}">
  <meta name="twitter:image" content="${escHtml(image)}">
</head>
<body>
  <p>Abrir imóvel: <a href="${escHtml(pageUrl)}">Clique aqui</a>.</p>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  try {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const requestProto = forwardedProto || 'http';
    const requestHost = req.headers.host || 'localhost';
    const requestOrigin = `${requestProto}://${requestHost}`;

    const url = new URL(req.url || '/', requestOrigin);
    const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);

    if (pathname === '/config.js') {
      return send(res, 200, configScript(), {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
      });
    }

    if (pathname === '/share/imovel') {
      const codigo = String(url.searchParams.get('codigo') || '').trim();
      if (!codigo) {
        return send(res, 302, '', { Location: '/index.html' });
      }

      const safeCodigo = encodeURIComponent(codigo);
      const pageUrl = `${requestOrigin}/imovel.html?codigo=${safeCodigo}`;
      const shareUrl = `${requestOrigin}${url.pathname}${url.search}`;
      const fallbackImage = `${requestOrigin}/assets/banner-home.webp`;

      try {
        const upstream = new URL(`${API_BASE}/api/public/imoveis/${encodeURIComponent(codigo)}`);
        const payload = await fetchJson(upstream);
        const item = payload && payload.item ? payload.item : payload;

        const title = item?.titulo || `Imóvel ${codigo}`;
        const city = item?.cidade || '';
        const district = item?.bairro || '';
        const price = item?.valor ? `R$ ${Number(item.valor).toLocaleString('pt-BR')}` : '';
        const description = [city, district, price].filter(Boolean).join(' • ') || 'Veja detalhes deste imóvel';

        const apiOrigin = (() => {
          try { return new URL(API_BASE).origin; } catch { return requestOrigin; }
        })();
        const fotoPrincipal = Array.isArray(item?.fotos) && item.fotos.length
          ? (item.fotos.find((f) => Number(f?.ordem) === 1)?.url || item.fotos[0]?.url)
          : '';
        const image = toAbsoluteUrl(item?.imagem || fotoPrincipal || '', apiOrigin) || fallbackImage;

        return send(res, 200, sharePreviewHtml({ title, description, image, pageUrl, shareUrl }), {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, max-age=0',
        });
      } catch (error) {
        const title = `Imóvel ${codigo}`;
        const description = 'Veja detalhes deste imóvel';
        return send(res, 200, sharePreviewHtml({ title, description, image: fallbackImage, pageUrl, shareUrl }), {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, max-age=0',
        });
      }
    }

    if (pathname.startsWith('/api/')) {
      const upstream = new URL(`${API_BASE}${pathname}${url.search || ''}`);
      const client = upstream.protocol === 'https:' ? https : http;

      return client.get(upstream, (upstreamRes) => {
        const chunks = [];
        upstreamRes.on('data', (chunk) => chunks.push(chunk));
        upstreamRes.on('end', () => {
          const body = Buffer.concat(chunks);
          res.writeHead(upstreamRes.statusCode || 502, {
            'Content-Type': upstreamRes.headers['content-type'] || 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
          });
          res.end(body);
        });
      }).on('error', (error) => {
        return send(res, 502, JSON.stringify({ error: 'upstream_unavailable', detail: error.message }), {
          'Content-Type': 'application/json; charset=utf-8',
        });
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
