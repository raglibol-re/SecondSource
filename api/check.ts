import { callAirnode, createPayer } from '../src/airnode/client.ts';
import { check } from '../src/check.ts';
import type { CheckInput } from '../src/types.ts';

export const maxDuration = 300;

// POST /api/check with a CheckInput. Streams newline-delimited JSON: one {type:"step"} per bought attestation as it
// lands, then {type:"result"}. Each real check spends about 0.13 aUSD from the payer wallet, so it needs the demo key.
export async function POST(request: Request): Promise<Response> {
  const demoKey = process.env.DEMO_KEY;
  if (!demoKey || request.headers.get('x-demo-key') !== demoKey) {
    return Response.json({ error: 'A live check spends test money, so it needs the demo key. Replay a recorded check instead.' }, { status: 401 });
  }
  let input: CheckInput;
  try {
    input = (await request.json()) as CheckInput;
    if (typeof input.headline !== 'string' || input.headline.trim().length < 8 || input.headline.length > 400) throw new Error();
  } catch {
    return Response.json({ error: 'Send JSON with a headline between 8 and 400 characters.' }, { status: 400 });
  }
  const pay = createPayer();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      try {
        const result = await check(
          { headline: input.headline, claimedSource: input.claimedSource || undefined, asset: input.asset || undefined, publishedAt: input.publishedAt || undefined, keywords: input.keywords },
          (source, req) => callAirnode(source, req, pay, { maxAgeSeconds: 300 }),
          (e) => send(e)
        );
        send({ type: 'result', result });
      } catch (err) {
        send({ type: 'error', error: (err as Error).message });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
}
