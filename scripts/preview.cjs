const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const base = path.resolve(__dirname, '../src');
http.createServer((req, res) => {
  const name = req.url === '/' ? 'index.html' : req.url.split('?')[0].slice(1);
  if (!['index.html', 'app.js', 'styles.css', 'reference.css'].includes(name) && !/^icons\/[a-z-]+\.svg$/.test(name)) { res.writeHead(404).end(); return; }
  const content = fs.readFileSync(path.join(base, name));
  res.setHeader('Content-Type', name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
  res.end(content);
}).listen(4173, '127.0.0.1', () => console.log('ENtree demo preview: http://127.0.0.1:4173'));
