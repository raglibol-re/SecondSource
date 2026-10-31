import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { callAirnode, createPayer } from './airnode/client.ts';
import { investigate } from './agent/investigate.ts';
import { check, type ProgressEvent } from './check.ts';

// pnpm check --question "plain-words question" (the agent plans the check), or
// pnpm check "headline" [--source RapidResponse47] [--asset indices/US30] [--at 2025-04-07T14:12:00Z] [--keywords a,b]
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { question: { type: 'string' }, source: { type: 'string' }, asset: { type: 'string' }, at: { type: 'string' }, keywords: { type: 'string' }, out: { type: 'string' } },
});
const headline = positionals.join(' ');
if (!headline && !values.question) {
  console.error('Usage: pnpm check "headline" [--source handle] [--asset indices/US30] [--at ISO time] [--keywords a,b,c]');
  process.exit(1);
}
const pay = createPayer();
const call = (source: Parameters<typeof callAirnode>[0], request: Parameters<typeof callAirnode>[1]) => callAirnode(source, request, pay, { maxAgeSeconds: 300 });
const log = (e: ProgressEvent) => {
  if (e.type === 'step') {
    const tx = e.attestation?.paymentTx ? ` paid tx ${e.attestation.paymentTx}` : '';
    console.error(`${e.step.status === 'ok' ? '✔' : '✘'} ${e.step.label}${e.step.status === 'ok' ? ' (signature verified)' : `: ${e.step.error}`}${tx}`);
  }
};
const result = values.question
  ? await investigate(values.question, call, (e) => (e.type === 'plan' ? console.error(`Plan (${e.model ?? 'rules'}): ${JSON.stringify(e.plan)}`) : log(e)))
  : await check({ headline, claimedSource: values.source, asset: values.asset, publishedAt: values.at, keywords: values.keywords?.split(',').map((k) => k.trim()) }, call, log);
mkdirSync('runs', { recursive: true });
const file = values.out ?? `runs/check-${result.checkedAt.replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify(result, null, 2));
console.log(`\n${result.verdict} (confidence ${result.confidence})\n${result.reasoning}\nCited: ${result.citations.join(', ') || 'none'}`);
for (const id of result.citations) {
  const e = result.evidence.find((x) => x.id === id);
  if (e) console.log(`  [${id}] ${e.author ?? ''} ${e.at ?? ''}: ${e.text.slice(0, 160)}`);
}
console.log(`\n${result.attestations.length} signed attestations, cost ${result.costAusd} aUSD, resultHash ${result.resultHash}\nSaved ${file}`);
