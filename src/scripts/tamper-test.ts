import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import type { Address } from 'viem';
import { VAULT_ADDRESS } from '../vault/deployment.generated.ts';
import { buildTamperCases, verifyPriceOnChain } from '../vault/onchain.ts';

// pnpm tamper-test [--vault 0x...] [--offline]
// The API3 tamper test against the deployed GuardedVault on Base Sepolia, read-only (eth_call, no gas, no keys):
// one valid, timely ETH/USD response from the Nodary Airnode, then four rejected variants of real responses.
// --offline runs the same five cases as Foundry tests on saved real responses, with no network.
const { values } = parseArgs({ options: { vault: { type: 'string' }, offline: { type: 'boolean', default: false } } });
if (values.offline) {
  execFileSync('forge', ['test', '--match-contract', 'GuardedVaultTamperTest', '-vv'], { cwd: 'contracts', stdio: 'inherit', shell: process.platform === 'win32' });
  process.exit(0);
}

const started = Date.now();
const vault = (values.vault ?? VAULT_ADDRESS) as Address;
console.log(`GuardedVault ${vault} on Base Sepolia, verifyPrice via eth_call\n`);
let accepted = 0;
const reasons = new Set<string>();
for (const [i, c] of (await buildTamperCases()).entries()) {
  const o = await verifyPriceOnChain(c.response, vault);
  if (o.accepted) accepted++;
  else reasons.add(o.error);
  console.log(`${i + 1}. ${c.label}\n   ${o.accepted ? `ACCEPTED: ${o.detail}` : `REVERTED ${o.error}: ${o.reason}`}`);
}
const pass = accepted === 1 && reasons.size === 4;
console.log(`\n${accepted} accepted, ${5 - accepted} rejected with ${reasons.size} distinct reasons: ${pass ? 'PASS' : 'FAIL'} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
process.exitCode = pass ? 0 : 1;
