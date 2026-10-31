import { investigate } from '../src/agent/investigate.ts';
import { callAirnode, createPayer } from '../src/airnode/client.ts';
import { check } from '../src/check.ts';
import type { CheckInput } from '../src/types.ts';

export const maxDuration = 300;

// POST /api/check with the demo key: the same agent as /api/x402/investigate, without the buyer paying.
// Send {question} for the planning agent, or a CheckInput ({headline, ...}) for a direct check. Streams NDJSON events.
export async function POST(request: Request): Promise<Response> {
  const demoKey = process.env.DEMO_KEY;
  if (!demoKey || request.headers.get('x-demo-key') !== demoKey) {
    return Response.json({ error: 'This route needs the demo key. Pay 0.10 USDC with your wallet instead.' }, { status: 401 });
  }
  let body: { question?: string } & Partial<CheckInput>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Send JSON.' }, { status: 400 });
  }
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  const headline = typeof body.headline === 'string' ? body.headline.trim() : '';
  if ((question.length < 8 || question.length > 1000) && (headline.length < 8 || headline.length > 400)) {
    return Response.json({ error: 'Send a question (8 to 1000 characters) or a headline (8 to 400).' }, { status: 400 });
  }
  const pay = createPayer();
  const call = (s: Parameters<typeof callAirnode>[0], r: Parameters<typeof callAirnode>[1]) => callAirnode(s, r, pay, { maxAgeSeconds: 300 });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      try {
        const result = question.length >= 8
          ? await investigate(question, call, send)
          : await check({ headline, claimedSource: body.claimedSource || undefined, asset: body.asset || undefined, publishedAt: body.publishedAt || undefined }, call, send);
        send({ type: 'result', result });
      } catch (err) {
        send({ type: 'error', error: (err as Error).message });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
}
