import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { callAirnode, createPayer } from './airnode/client.ts';
import { check } from './check.ts';

// pnpm check "headline" [--source RapidResponse47] [--asset indices/US30] [--at 2025-04-07T14:12:00Z] [--keywords a,b]
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { source: { type: 'string' }, asset: { type: 'string' }, at: { type: 'string' }, keywords: { type: 'string' }, out: { type: 'string' } },
});
const headline = positionals.join(' ');
if (!headline) {
  console.error('Usage: pnpm check "headline" [--source handle] [--asset indices/US30] [--at ISO time] [--keywords a,b,c]');
  process.exit(1);
}
const pay = createPayer();
const result = await check(
  { headline, claimedSource: values.source, asset: values.asset, publishedAt: values.at, keywords: values.keywords?.split(',').map((k) => k.trim()) },
  (source, request) => callAirnode(source, request, pay, { maxAgeSeconds: 300 }),
  (e) => {
    if (e.type === 'step') {
      const tx = e.attestation?.paymentTx ? ` paid tx ${e.attestation.paymentTx}` : '';
      console.error(`${e.step.status === 'ok' ? '✔' : '✘'} ${e.step.label}${e.step.status === 'ok' ? ' (signature verified)' : `: ${e.step.error}`}${tx}`);
    }
  }
);
mkdirSync('runs', { recursive: true });
const file = values.out ?? `runs/check-${result.checkedAt.replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify(result, null, 2));
console.log(`\n${result.verdict} (confidence ${result.confidence})\n${result.reasoning}\nCited: ${result.citations.join(', ') || 'none'}`);
for (const id of result.citations) {
  const e = result.evidence.find((x) => x.id === id);
  if (e) console.log(`  [${id}] ${e.author ?? ''} ${e.at ?? ''}: ${e.text.slice(0, 160)}`);
}
console.log(`\n${result.attestations.length} signed attestations, cost ${result.costAusd} aUSD, resultHash ${result.resultHash}\nSaved ${file}`);
