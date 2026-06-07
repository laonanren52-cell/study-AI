import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const port = 5188;

const MIME = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'application/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.mjs': 'application/javascript;charset=utf-8',
  '.json': 'application/json;charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  /* CORS: 必须设置，因为 Vite 构建的 HTML 有 crossorigin 属性 */
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url?.startsWith('/web-search')) {
    const requestUrl = new URL(req.url, `http://127.0.0.1:${port}`);
    const query = requestUrl.searchParams.get('q') || '';
    if (!query.trim()) {
      res.writeHead(400, { 'Content-Type': 'text/plain;charset=utf-8' });
      res.end('Missing q');
      return;
    }
    fetch('https://lite.duckduckgo.com/lite/?q=' + encodeURIComponent(query), {
      headers: { 'User-Agent': 'Mozilla/5.0 ZhixueLoop/1.0' },
    })
      .then(async (searchRes) => {
        const text = await searchRes.text();
        res.writeHead(searchRes.ok ? 200 : searchRes.status, {
          'Content-Type': 'text/html;charset=utf-8',
          'Cache-Control': 'no-cache',
        });
        res.end(text);
      })
      .catch((error) => {
        res.writeHead(502, { 'Content-Type': 'text/plain;charset=utf-8' });
        res.end('WEB_SEARCH_FAILED: ' + (error?.message || 'unknown'));
      });
    return;
  }

  const filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const ct = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      return fs.readFile(path.join(distDir, 'index.html'), (err2, data2) => {
        if (err2) { res.writeHead(404); res.end('Not Found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
        res.end(data2);
      });
    }
    res.writeHead(200, { 'Content-Type': ct });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => {
  console.log('Preview + CORS: http://127.0.0.1:' + port);
});
