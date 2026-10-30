import { CdpClient } from '@coinbase/cdp-sdk';
import { createPublicClient, formatEther, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { logTransaction } from '../airnode/client.ts';

// pnpm faucet [claims]   Requests Base Sepolia ETH for the payer wallet from the Coinbase CDP faucet.
// Needs CDP_API_KEY_ID and CDP_API_KEY_SECRET in .env (portal.cdp.coinbase.com/api-keys/secret). Each claim is
// 0.0001 ETH; minting aUSD needs far less than one claim, deploying the vault a bit more. Default: 5 claims.
if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
  throw new Error('Set CDP_API_KEY_ID and CDP_API_KEY_SECRET in .env (create them at portal.cdp.coinbase.com/api-keys/secret)');
}
const claims = Math.min(Math.max(Number(process.argv[2] ?? 5), 1), 20);
const { address } = privateKeyToAccount(process.env.PAYER_PRIVATE_KEY as Hex);
const cdp = new CdpClient();
const pub = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC_URL) });

for (let i = 1; i <= claims; i++) {
  const { transactionHash } = await cdp.evm.requestFaucet({ address, network: 'base-sepolia', token: 'eth' });
  await pub.waitForTransactionReceipt({ hash: transactionHash as Hex });
  console.log(`claim ${i}/${claims}: https://sepolia.basescan.org/tx/${transactionHash}`);
  logTransaction('Base Sepolia', `https://sepolia.basescan.org/tx/${transactionHash}`, 'CDP faucet: 0.0001 ETH to payer for gas');
}
console.log(`${address} now holds ${formatEther(await pub.getBalance({ address }))} ETH`);
