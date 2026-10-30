import { createPublicClient, erc20Abi, formatUnits, http, isHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { AIRNODES, PRICES } from '../src/airnode/registry.ts';
import { AUSD_ADDRESS } from '../src/airnode/x402.ts';

// GET /api/status: the wallet that pays for evidence, its aUSD balance, and the pinned Airnode signers.
export async function GET(): Promise<Response> {
  const key = process.env.PAYER_PRIVATE_KEY;
  let payer: { address: string; ausd: string | null } | null = null;
  if (key && isHex(key)) {
    const { address } = privateKeyToAccount(key);
    let ausd: string | null = null;
    try {
      const client = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC_URL) });
      ausd = formatUnits(await client.readContract({ address: AUSD_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address] }), 6);
    } catch {
      ausd = null;
    }
    payer = { address, ausd };
  }
  return Response.json(
    { payer, liveChecks: Boolean(process.env.DEMO_KEY && payer), airnodes: AIRNODES, prices: PRICES },
    { headers: { 'Cache-Control': 'public, max-age=30' } }
  );
}
