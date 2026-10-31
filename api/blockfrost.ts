// GET /api/blockfrost/<path> (rewritten to /api/blockfrost?path=<path> in vercel.json): a read-only proxy to Blockfrost
// Cardano preprod for the browser wallet payment, so the project key never reaches the browser. Only the paths the
// payment builder reads are allowed: protocol parameters, address UTxOs and transaction outputs.
const ALLOWED = [
  /^epochs\/latest\/parameters$/,
  /^addresses\/addr_test1[0-9a-z]{20,120}\/utxos(\/[0-9a-f]{56,120})?$/,
  /^txs\/[0-9a-f]{64}(\/utxos)?$/,
];

export async function GET(request: Request): Promise<Response> {
  const key = process.env.BLOCKFROST_API_KEY_PREPROD;
  if (!key) return Response.json({ error: 'Cardano wallet payments are not configured on this deployment.' }, { status: 503 });
  const url = new URL(request.url);
  const path = (url.searchParams.get('path') ?? '').replace(/^\/+/, '');
  if (!ALLOWED.some((r) => r.test(path))) return Response.json({ error: 'Path not allowed' }, { status: 403 });
  const query = new URLSearchParams();
  for (const k of ['page', 'count', 'order']) {
    const v = url.searchParams.get(k);
    if (v && /^[a-z0-9]{1,8}$/.test(v)) query.set(k, v);
  }
  const upstream = await fetch(`https://cardano-preprod.blockfrost.io/api/v0/${path}${query.size ? `?${query}` : ''}`, {
    headers: { project_id: key },
    signal: AbortSignal.timeout(15_000),
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json', 'Cache-Control': 'no-store' },
  });
}
