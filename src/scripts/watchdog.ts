import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { callAirnode, createPayer } from '../airnode/client.ts';
import { check } from '../check.ts';
import { actOnVerdict } from '../vault/actions.ts';

// pnpm watchdog "rumour" [--every 300] [--cycles 12] [--asset indices/US30] [--at ISO]
// An autonomous agent guarding the vault. Each cycle it buys fresh signed evidence over x402 (AirnodeHub, Base
// Sepolia), has SecondSource judge the rumour, and as soon as a primary account denies it, brings the signed post and
// the DENIED verdict on chain with haltOnDenial, which stops trading for every agent using the vault.
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { every: { type: 'string', default: '300' }, cycles: { type: 'string', default: '12' }, asset: { type: 'string' }, at: { type: 'string' } },
});
const headline = positionals.join(' ');
if (!headline) throw new Error('Usage: pnpm watchdog "rumour" [--every 300] [--cycles 12] [--asset indices/US30] [--at ISO]');
const every = Math.max(30, Number(values.every)) * 1000;
const cycles = Math.max(1, Number(values.cycles));
const pay = createPayer();
mkdirSync('runs', { recursive: true });

console.log(`Watchdog on "${headline}", every ${every / 1000} s, up to ${cycles} cycles`);
for (let cycle = 1; cycle <= cycles; cycle++) {
  const started = new Date().toISOString().slice(11, 19);
  const result = await check({ headline, asset: values.asset, publishedAt: values.at }, (s, r) => callAirnode(s, r, pay, { maxAgeSeconds: 300 }));
  const file = `runs/watchdog-${result.checkedAt.replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify(result, null, 2));
  console.log(`[${started}] cycle ${cycle}: ${result.verdict} (${Math.round(result.confidence * 100)}%), ${result.attestations.length} signed answers, ${result.costAusd} aUSD paid over x402`);
  if (result.verdict === 'DENIED') {
    try {
      const r = await actOnVerdict(result);
      console.log(r.ok ? `  HALTED the vault: ${r.label}\n  https://sepolia.basescan.org/tx/${r.hash}` : `  Vault refused: ${r.revert?.error}, ${r.revert?.reason}`);
      if (r.ok) break;
    } catch (e) {
      console.log(`  Denied, but nothing to bring on chain: ${(e as Error).message}`);
    }
  } else {
    console.log('  No primary-source denial yet; trading stays open.');
  }
  if (cycle < cycles) await new Promise((r) => setTimeout(r, every));
}
