import { createPublicClient, erc20Abi, formatEther, formatUnits, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { AUSD_ADDRESS } from '../airnode/x402.ts';

const key = process.env.PAYER_PRIVATE_KEY as Hex | undefined;
if (!key) throw new Error('Set PAYER_PRIVATE_KEY in .env (pnpm wallet:new)');
const { address } = privateKeyToAccount(key);
const client = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC_URL) });
const [eth, ausd] = await Promise.all([
  client.getBalance({ address }),
  client.readContract({ address: AUSD_ADDRESS, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
]);
console.log(`${address}\n  ETH  ${formatEther(eth)}\n  aUSD ${formatUnits(ausd, 6)}`);
