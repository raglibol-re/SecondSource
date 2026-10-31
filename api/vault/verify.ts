import type { SignedResponse } from '../../src/airnode/airnode-v2.ts';
import { VAULT_ADDRESS } from '../../src/vault/deployment.generated.ts';
import { verifyPostOnChain, verifyPriceOnChain } from '../../src/vault/onchain.ts';

// POST /api/vault/verify with an AirnodeHub response ({airnode, requestHash, timestamp, data, signature}), optionally
// wrapped as {response, postId}. The deployed GuardedVault checks it on Base Sepolia (eth_call): verifyPrice for a
// Nodary ETH/USD response, verifyPrimarySource when postId is given. Free, no keys.
export async function POST(request: Request): Promise<Response> {
  let body: { response?: SignedResponse; postId?: string } & Partial<SignedResponse>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Send JSON.' }, { status: 400 });
  }
  const r = (body.response ?? body) as SignedResponse;
  if (!r || typeof r.signature !== 'string' || typeof r.data !== 'string' || typeof r.requestHash !== 'string' || typeof r.airnode !== 'string' || r.timestamp === undefined) {
    return Response.json({ error: 'Expected airnode, requestHash, timestamp, data and signature.' }, { status: 400 });
  }
  const postId = typeof body.postId === 'string' && body.postId.trim() ? body.postId.trim() : undefined;
  const outcome = postId ? await verifyPostOnChain(postId, r) : await verifyPriceOnChain(r);
  return Response.json({ vault: VAULT_ADDRESS, network: 'Base Sepolia', function: postId ? 'verifyPrimarySource' : 'verifyPrice', ...outcome });
}
