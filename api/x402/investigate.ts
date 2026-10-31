import { investigate } from '../../src/agent/investigate.ts';
import { callAirnode, createPayer } from '../../src/airnode/client.ts';
import { settlementFromHeaders, undecidedSettlement, verifyX402Payment } from '../../src/x402/seller.ts';

export const maxDuration = 300;

// POST /api/x402/investigate {question}: the agent, paid per question over x402 (0.10 USDC on Base Sepolia or 2 tADA on
// Cardano preprod). Streams newline-delimited JSON as it works: {type:"plan"}, {type:"step"}..., then settles the
// payment and only then sends {type:"settlement"} and {type:"result"}. If the work fails, nothing is settled.
export async function POST(request: Request): Promise<Response> {
  let question: string;
  try {
    const body = (await request.json()) as { question?: unknown };
    question = typeof body.question === 'string' ? body.question.trim() : '';
    if (question.length < 8 || question.length > 1000) throw new Error();
  } catch {
    return Response.json({ error: 'Send JSON with a question between 8 and 1000 characters.' }, { status: 400 });
  }
  if (!process.env.PAYER_PRIVATE_KEY) {
    return Response.json({ error: 'This deployment has no evidence wallet configured, so it does not take paid questions right now.' }, { status: 503 });
  }
  const v = await verifyX402Payment(request, { question });
  if ('respond' in v) return v.respond;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + '\n'));
      try {
        // The buyer's payment is verified (not yet settled): tell them what they are paying, for their receipt.
        send({ type: 'payment', ...v.terms, verifiedAt: new Date().toISOString() });
        const pay = createPayer();
        const result = await investigate(question, (s, r) => callAirnode(s, r, pay, { maxAgeSeconds: 300 }), (e) => send(e));
        send({ type: 'settling' });
        const s = await v.settle(Buffer.from(JSON.stringify(result)));
        const receipt = settlementFromHeaders(s.headers) as { errorReason?: string; transaction?: string } | null;
        if (!s.ok && receipt?.errorReason === 'settlement_pending') {
          // Cardano: the signed transaction was submitted and is waiting for its confirmation. The buyer will be charged,
          // so they get the verdict now; the transaction id lets them follow it.
          send({ type: 'settlement', ...receipt, pending: true, settledAt: new Date().toISOString() });
          send({ type: 'result', result });
        } else if (!s.ok && undecidedSettlement(s)) {
          // The facilitator did not answer; the payment may already be on chain. Never charge without delivering.
          send({ type: 'settlement', network: v.terms.network, pending: true, unconfirmed: true, settledAt: new Date().toISOString() });
          send({ type: 'result', result });
        } else if (!s.ok) {
          const reason = receipt?.errorReason ?? (!s.ok ? JSON.stringify(s.body).slice(0, 200) : '');
          send({ type: 'error', notCharged: true, error: `Your payment could not be settled (${reason}), so you were not charged and the verdict is withheld.` });
        } else {
          send({ type: 'settlement', ...settlementFromHeaders(s.headers), settledAt: new Date().toISOString() });
          send({ type: 'result', result });
        }
      } catch (err) {
        send({ type: 'error', notCharged: true, error: `The investigation failed, so you were not charged: ${(err as Error).message}` });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
}
