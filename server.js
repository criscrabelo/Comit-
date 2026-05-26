/**
 * Plataforma de Comitês — Jurídico
 * Servidor Node.js com API REST para banco de dados compartilhado
 * Suporta: arquivo local (db.json) ou GitHub Gist (GITHUB_GIST_ID + GITHUB_TOKEN)
 */
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const ROOT       = __dirname;
const DB_PATH    = process.env.DB_PATH    || path.join(ROOT, 'db.json');
const PORT       = process.env.PORT       || 3131;
const GIST_ID    = process.env.GITHUB_GIST_ID  || '';
const GH_TOKEN   = process.env.GITHUB_TOKEN     || '';
const USE_GIST   = !!(GIST_ID && GH_TOKEN);

// ── GitHub Gist helpers ───────────────────────────────────────────
function gistGet() {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.github.com',
      path: `/gists/${GIST_ID}`,
      headers: { 'Authorization': `token ${GH_TOKEN}`, 'User-Agent': 'plataforma-comites' }
    };
    https.get(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const gist = JSON.parse(data);
          resolve(gist.files?.['db.json']?.content || '{}');
        } catch(e) { resolve('{}'); }
      });
    }).on('error', reject);
  });
}

function gistPut(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ files: { 'db.json': { content: body } } });
    const opts = {
      hostname: 'api.github.com',
      path: `/gists/${GIST_ID}`,
      method: 'PATCH',
      headers: {
        'Authorization': `token ${GH_TOKEN}`,
        'User-Agent': 'plataforma-comites',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };
    const req = https.request(opts, res => {
      res.on('data', () => {});
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Debounced Gist write: responde ao cliente imediatamente, escreve em 1s
let _gistTimer = null;
let _gistPending = null;
function gistPutDebounced(body) {
  _gistPending = body;
  clearTimeout(_gistTimer);
  _gistTimer = setTimeout(() => {
    gistPut(_gistPending).catch(e => console.error('[Gist] write error:', e.message));
  }, 1000);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

http.createServer((req, res) => {

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, CORS);
    res.end();
    return;
  }

  // ── API: Ler banco ───────────────────────────────────────────
  if (req.url === '/api/db' && req.method === 'GET') {
    if (USE_GIST) {
      gistGet().then(data => {
        res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
        res.end(data);
      }).catch(() => {
        res.writeHead(500, CORS); res.end('Erro ao ler Gist');
      });
    } else {
      const data = fs.existsSync(DB_PATH)
        ? fs.readFileSync(DB_PATH, 'utf8') : '{}';
      res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
      res.end(data);
    }
    return;
  }

  // ── API: Gravar banco ────────────────────────────────────────
  if (req.url === '/api/db' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        JSON.parse(body); // valida JSON antes de gravar
        if (USE_GIST) {
          gistPutDebounced(body);          // grava no Gist em background (1s debounce)
          res.writeHead(200, { 'Content-Type': 'text/plain', ...CORS });
          res.end('ok');
        } else {
          fs.writeFileSync(DB_PATH, body, 'utf8');
          res.writeHead(200, { 'Content-Type': 'text/plain', ...CORS });
          res.end('ok');
        }
      } catch (e) {
        res.writeHead(400, CORS);
        res.end('JSON inválido');
      }
    });
    return;
  }

  // ── Arquivos estáticos ───────────────────────────────────────
  const urlPath  = (req.url === '/' ? '/index.html' : req.url).split('?')[0];
  const filePath = path.resolve(path.join(ROOT, urlPath));

  // Segurança: impede acesso fora do ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, CORS);
    res.end('Proibido');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, CORS);
      res.end('Não encontrado');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'text/plain',
      ...CORS,
    });
    res.end(data);
  });

}).listen(PORT, '0.0.0.0', () => {
  const ip = (() => {
    const nets = require('os').networkInterfaces();
    for (const name of Object.keys(nets))
      for (const n of nets[name])
        if (n.family === 'IPv4' && !n.internal) return n.address;
    return 'localhost';
  })();

  console.log('');
  console.log('  ========================================');
  console.log('   Plataforma de Comitês — Jurídico');
  console.log('  ========================================');
  console.log(`  Local  : http://localhost:${PORT}`);
  console.log(`  Rede   : http://${ip}:${PORT}`);
  if (process.env.RAILWAY_PUBLIC_DOMAIN)
    console.log(`  Online : https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
  console.log('');
  if (USE_GIST)
    console.log('  Banco de dados: GitHub Gist ' + GIST_ID);
  else
    console.log('  Banco de dados: ' + DB_PATH);
  console.log('');
});
