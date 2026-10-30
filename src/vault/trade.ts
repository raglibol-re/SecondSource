import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { BaseError, ContractFunctionRevertedError, encodeFunctionData, parseEther, toHex, type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { logTransaction } from '../airnode/client.ts';
import type { CheckResult } from '../types.ts';
import { artifact, clients, vaultAddress } from './chain.ts';
import { fetchSignedPrice } from './nodary.ts';
import { signVerdict } from './verdict.ts';

// pnpm vault:trade runs/check-....json [--usd 1000] [--send-anyway]
// Signs the check's verdict with the coworker key, fetches a fresh signed ETH/USD price from Nodary, and asks the vault
// to trade. The vault decides. With --send-anyway a trade the vault refuses is still sent, so the revert is on chain.
const { positionals, values } = parseArgs({ allowPositionals: true, options: { usd: { type: 'string', default: '1000' }, 'send-anyway': { type: 'boolean', default: false } } });
const file = positionals[0];
if (!file) throw new Error('Usage: pnpm vault:trade <check result json> [--usd 1000] [--send-anyway]');
const result = JSON.parse(readFileSync(file, 'utf8')) as CheckResult;
if (!result.resultHash) throw new Error('The result has no resultHash');

const { abi } = artifact();
const { pub, wallet, account } = clients();
const vault = vaultAddress();
const v = await signVerdict(baseSepolia.id, vault, result.resultHash as Hex, result.verdict);
const p = await fetchSignedPrice('ETH/USD');
const args = [
  { timestamp: BigInt(p.timestamp), data: toHex(p.data), signature: p.signature },
  { resultHash: v.resultHash, verdict: v.verdict, signedAt: v.signedAt, signature: v.signature },
  parseEther(values.usd!),
] as const;
console.log(`Verdict ${result.verdict} for "${result.input.headline}"\nPrice ${p.data} signed at ${p.timestamp}`);

try {
  const { request } = await pub.simulateContract({ address: vault, abi, functionName: 'executeTrade', args, account });
  const hash = await wallet.writeContract(request);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  console.log(`ALLOWED: trade executed (${receipt.status}) https://sepolia.basescan.org/tx/${hash}`);
  logTransaction('Base Sepolia', `https://sepolia.basescan.org/tx/${hash}`, `GuardedVault trade ALLOWED (${result.verdict}): ${result.input.headline.slice(0, 60)}`);
} catch (e) {
  const revert = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
  const reason = revert instanceof ContractFunctionRevertedError ? `${revert.data?.errorName ?? 'revert'}(${(revert.data?.args ?? []).join(', ')})` : (e as Error).message.slice(0, 200);
  console.log(`BLOCKED: the vault refused: ${reason}`);
  if (values['send-anyway']) {
    const data = encodeFunctionData({ abi, functionName: 'executeTrade', args });
    const hash = await wallet.sendTransaction({ to: vault, data, gas: 300_000n });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    console.log(`  sent anyway, on-chain status ${receipt.status}: https://sepolia.basescan.org/tx/${hash}`);
    logTransaction('Base Sepolia', `https://sepolia.basescan.org/tx/${hash}`, `GuardedVault trade BLOCKED (${result.verdict}, ${reason}): ${result.input.headline.slice(0, 60)}`);
  }
}
