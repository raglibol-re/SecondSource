import { VAULT_ADDRESS, VAULT_DEPLOY_TX } from '../../src/vault/deployment.generated.ts';
import { buildTamperCases } from '../../src/vault/onchain.ts';

// GET /api/vault/cases: the five tamper-test responses, built fresh from real Nodary responses: one valid, an edited
// value, a stale response, a response to a different request, and one signed by a throwaway key.
export async function GET(): Promise<Response> {
  try {
    const cases = await buildTamperCases();
    return Response.json({ vault: VAULT_ADDRESS, deployTx: VAULT_DEPLOY_TX, cases }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: `Could not reach the Nodary Airnode: ${(e as Error).message}` }, { status: 502 });
  }
}
