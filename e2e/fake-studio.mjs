/**
 * A stand-in plugin studio for Playwright (drafts, #160): `GET /d/<code>` answers a draft's JSON
 * with a name made from the code, and `/health` answers ok. The e2e server's PLUGIN_STUDIO_URL
 * points here, so the Plugins screen's drafts can be tried end to end.
 */
/* global process, console, URL */
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3953);
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  if (url.pathname === '/health') return void res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
  const code = /^\/d\/([A-Za-z0-9_-]{6,200})$/.exec(url.pathname)?.[1];
  if (!code) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ name: `Draft ${code}`, manifest: { name: `Draft ${code}` } }));
});
server.listen(port, '127.0.0.1', () => console.log(`fake studio on http://127.0.0.1:${port}`));

const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
