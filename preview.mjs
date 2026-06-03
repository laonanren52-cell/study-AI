import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, 'dist');
const versionFile = path.join(__dirname, '.build_version');
const port = 5188;

const RELOAD_SCRIPT = '<script>(function(){var v=0;setInterval(function(){var x=new XMLHttpRequest();x.open("GET","/__version",true);x.onload=function(){var n=parseInt(x.responseText);if(v>0&&n>v)location.reload();if(n)v=n;};x.send();},2000);})();</script>';

const MIME = {
  '.html': 'text/html;charset=utf-8',
  '.js': 'application/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8',
  '.mjs': 'application/javascript;charset=utf-8',
  '.json': 'application/json;charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function getVersion() {
  try { return fs.readFileSync(versionFile, 'utf8').trim() || '0'; }
  catch { return '0'; }
}

http.createServer((req, res) => {
  /* CORS: 必须设置，因为 Vite 构建的 HTML 有 crossorigin 属性 */
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.url === '/__version') {
    res.writeHead(200, { 'Content-Type': 'text/plain;charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(getVersion());
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
        res.end(data2.toString().replace('</body>', RELOAD_SCRIPT + '</body>'));
      });
    }
    let body = data;
    if (ext === '.html') body = data.toString().replace('</body>', RELOAD_SCRIPT + '</body>');
    res.writeHead(200, { 'Content-Type': ct });
    res.end(body);
  });
}).listen(port, '127.0.0.1', () => {
  console.log('Preview + CORS + auto-reload: http://127.0.0.1:' + port);
});