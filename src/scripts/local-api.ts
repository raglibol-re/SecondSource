import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

// pnpm site:local: the whole website on http://127.0.0.1:4021, static pages from public/ plus every api/*.ts route.
// Offline fallback for the booth: recorded checks replay and receipts verify with no network. Live checks, the x402
// endpoint and the contract calls still need the internet.
const port = Number(process.env.LOCAL_API_PORT ?? 4021);
const TYPES: Record<string, string> = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const file = join('api', `${normalize(url.pathname.slice(5)).replace(/^(\.\.[/\\])+/, '')}.ts`);
      if (!existsSync(file)) return void res.writeHead(404).end();
      const mod = await import(pathToFileURL(file).href);
      const handler = mod[req.method ?? 'GET'];
      if (!handler) return void res.writeHead(405).end();
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
      const response: Response = await handler(new Request(url, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return void res.end(Buffer.from(await response.arrayBuffer()));
    }
    let file = join('public', normalize(url.pathname).replace(/^(\.\.[/\\])+/, ''));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
    if (!existsSync(file)) return void res.writeHead(404).end('Not found');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: (e as Error).message }));
  }
}).listen(port, '127.0.0.1', () => console.log(`SecondSource locally on http://127.0.0.1:${port} (x402 endpoint at /api/x402/check)`));
