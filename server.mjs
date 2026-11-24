import http from 'node:http';
import { readFile } from 'node:fs/promises';
const files = { '/navigation.js':['navigation.js','text/javascript'], '/pedal-control.js':['pedal-control.js','text/javascript'], '/pedal-controls-ui.js':['pedal-controls-ui.js','text/javascript'], '/studio.js': ['studio.js', 'text/javascript'], '/lessons.js': ['lessons.js', 'text/javascript'], '/tuner-control.js': ['tuner-control.js', 'text/javascript'], '/pedal-tuner.js': ['pedal-tuner.js', 'text/javascript'], '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/dsp.js': ['dsp.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
const server = http.createServer(async (req, res) => {
  const entry = files[new URL(req.url, 'http://localhost').pathname];
  if (!entry || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const data = await readFile(new URL(`./public/${entry[0]}`, import.meta.url));
    res.writeHead(200, { 'Content-Type': `${entry[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(500); res.end('Unable to load app'); }
});
server.on('error', e => { console.error(e.message); process.exitCode = 1; });
server.listen(4317, '127.0.0.1', () => console.log('Guitar Lab: http://127.0.0.1:4317 — Ctrl+C to stop'));
