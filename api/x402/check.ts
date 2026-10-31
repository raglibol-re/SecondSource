import { callAirnode, createPayer } from '../../src/airnode/client.ts';
import { check } from '../../src/check.ts';
import type { CheckInput } from '../../src/types.ts';
import { sellWithX402 } from '../../src/x402/seller.ts';

export const maxDuration = 300;

// POST /api/x402/check: SecondSource for any agent, paid per check over x402 on Cardano preprod (2 tADA).
// No account and no key: an unpaid request gets HTTP 402 with the payment requirements; pay and retry with
// PAYMENT-SIGNATURE. The check runs before settlement, and a failed check is not charged.
export async function POST(request: Request): Promise<Response> {
  let input: CheckInput;
  try {
    input = (await request.json()) as CheckInput;
    if (typeof input.headline !== 'string' || input.headline.trim().length < 8 || input.headline.length > 400) throw new Error();
  } catch {
    return Response.json({ error: 'Send JSON with a headline between 8 and 400 characters.' }, { status: 400 });
  }
  // Refuse before taking payment if this deployment cannot buy evidence.
  if (!process.env.PAYER_PRIVATE_KEY) {
    return Response.json({ error: 'This deployment has no evidence wallet configured, so it does not sell checks right now.' }, { status: 503 });
  }
  const clean: CheckInput = {
    headline: input.headline,
    claimedSource: input.claimedSource || undefined,
    asset: input.asset || undefined,
    publishedAt: input.publishedAt || undefined,
    keywords: Array.isArray(input.keywords) ? input.keywords.slice(0, 6).map(String) : undefined,
  };
  return sellWithX402(request, clean, { method: 'POST', path: '/api/x402/check', description: 'SecondSource: check a market headline against signed primary sources' }, async () => {
    try {
      const pay = createPayer();
      const result = await check(clean, (source, req) => callAirnode(source, req, pay, { maxAgeSeconds: 300 }));
      return { status: 200, body: result };
    } catch (e) {
      return { status: 502, body: { error: `The check failed and was not charged: ${(e as Error).message}` } };
    }
  });
}
