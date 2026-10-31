import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createPublicClient, formatUnits, http, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { recoverSigner, type SignedResponse } from '../airnode/airnode-v2.ts';
import { encodePacked, keccak256, toHex } from 'viem';
import { describeRevert, responseArg } from '../vault/actions.ts';
import { artifact, vaultAddress } from '../vault/chain.ts';
import { fetchSignedPrice } from '../vault/nodary.ts';

// pnpm tamper-test [--vault 0x...] [--offline]
// The API3 tamper test against the deployed GuardedVault on Base Sepolia, read-only (eth_call, no gas):
// one valid, timely ETH/USD response from the Nodary Airnode, then four rejected variants of real responses.
// --offline runs the same five cases as Foundry tests on saved real responses, with no network.
const { values } = parseArgs({ options: { vault: { type: 'string' }, offline: { type: 'boolean', default: false } } });
if (values.offline) {
  execFileSync('forge', ['test', '--match-contract', 'GuardedVaultTamperTest', '-vv'], { cwd: 'contracts', stdio: 'inherit', shell: process.platform === 'win32' });
  process.exit(0);
}

const started = Date.now();
const vault = (values.vault ?? vaultAddress()) as Address;
const { abi } = artifact();
const pub = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC_URL) });

// Re-signs a response the way an Airnode does, with a key that is not the Nodary Airnode's.
const signAs = async (key: Hex, r: SignedResponse): Promise<SignedResponse> => {
  const account = privateKeyToAccount(key);
  const digest = keccak256(encodePacked(['bytes32', 'uint256', 'bytes'], [r.requestHash, BigInt(r.timestamp), toHex(r.data)]));
  return { ...r, airnode: account.address, signature: await account.signMessage({ message: { raw: digest } }) };
};

const [fresh, otherRequest] = await Promise.all([fetchSignedPrice('ETH/USD'), fetchSignedPrice('BTC/USD')]);
const stale = JSON.parse(readFileSync('contracts/test/fixtures/nodary-eth-usd.json', 'utf8')) as SignedResponse;
const edited = { ...fresh, data: fresh.data.replace(/"price":(\d)/, (_, d: string) => `"price":${(Number(d) % 9) + 1}`) };
const wrongKey = await signAs(generatePrivateKey(), fresh);
if ((await recoverSigner(wrongKey)) !== wrongKey.airnode) throw new Error('test key signing failed');

const cases: [string, SignedResponse][] = [
  ['Valid, timely response from the Nodary Airnode', fresh],
  ['Real response with one value edited', edited],
  [`Real response that is too old (${Math.round(Date.now() / 1000 - Number(stale.timestamp))} s)`, stale],
  ['Real response to a different request (BTC/USD)', otherRequest],
  ['Response signed by a key that is not the Nodary Airnode', wrongKey],
];

console.log(`GuardedVault ${vault} on Base Sepolia, verifyPrice via eth_call\n`);
let accepted = 0;
let rejected = 0;
const reasons = new Set<string>();
for (const [i, [label, r]] of cases.entries()) {
  try {
    const [price, updatedAt] = (await pub.readContract({ address: vault, abi, functionName: 'verifyPrice', args: [responseArg(r)] })) as [bigint, bigint];
    accepted++;
    console.log(`${i + 1}. ${label}\n   ACCEPTED: ETH/USD ${formatUnits(price, 18)}, taken ${new Date(Number(updatedAt) * 1000).toISOString()}`);
  } catch (e) {
    const why = describeRevert(e);
    rejected++;
    reasons.add(why.error);
    console.log(`${i + 1}. ${label}\n   REVERTED ${why.error}: ${why.reason}`);
  }
}
const pass = accepted === 1 && rejected === 4 && reasons.size === 4;
console.log(`\n${accepted} accepted, ${rejected} rejected with ${reasons.size} distinct reasons: ${pass ? 'PASS' : 'FAIL'} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
process.exit(pass ? 0 : 1);
