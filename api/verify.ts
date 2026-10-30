import { isAddressEqual, type Address } from 'viem';
import { deriveRequestHash, recoverSigner, type AirnodeV2Request, type SignedResponse } from '../src/airnode/airnode-v2.ts';
import { AIRNODES } from '../src/airnode/registry.ts';

interface Item {
  request?: AirnodeV2Request;
  response: SignedResponse;
}

const known = (address: string) => Object.entries(AIRNODES).find(([, v]) => isAddressEqual(v.address, address as Address))?.[0];

// POST /api/verify with one attestation ({request?, response}), a list of them, or a whole check result. Free: it only
// does the maths, so anyone can check our receipts without trusting us.
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Send JSON.' }, { status: 400 });
  }
  const b = body as { attestations?: Item[]; response?: SignedResponse } & Partial<SignedResponse>;
  const items: Item[] = Array.isArray(body)
    ? (body as Item[])
    : b.attestations
      ? b.attestations
      : b.response
        ? [b as Item]
        : b.signature
          ? [{ response: b as SignedResponse }]
          : [];
  if (items.length === 0 || items.length > 50) return Response.json({ error: 'No attestation found in the JSON.' }, { status: 400 });

  const results = await Promise.all(
    items.map(async ({ request: req, response: res }) => {
      try {
        const signer = await recoverSigner(res);
        const listing = known(signer);
        const claimedOk = isAddressEqual(signer, res.airnode);
        const requestOk = req ? deriveRequestHash(req) === res.requestHash : null;
        return {
          ok: claimedOk && !!listing && requestOk !== false,
          signer,
          listing: listing ?? null,
          signerMatchesClaim: claimedOk,
          requestHashMatches: requestOk,
          signedAt: new Date(Number(res.timestamp) * 1000).toISOString(),
          operation: req?.operation ?? null,
        };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    })
  );
  return Response.json({ results });
}
