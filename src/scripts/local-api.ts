import { createServer } from 'node:http';
import { POST as x402Check } from '../../api/x402/check.ts';

// Serves the x402 check route locally (http://127.0.0.1:4021/api/x402/check) to test before deploying to Vercel.
const port = Number(process.env.LOCAL_API_PORT ?? 4021);
createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const url = `http://127.0.0.1:${port}${req.url}`;
  if (req.method !== 'POST' || new URL(url).pathname !== '/api/x402/check') {
    res.writeHead(404).end();
    return;
  }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const response = await x402Check(new Request(url, { method: 'POST', headers, body: Buffer.concat(chunks) }));
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, '127.0.0.1', () => console.log(`Local API on http://127.0.0.1:${port}/api/x402/check`));
