import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { callAirnode, createPayer } from '../airnode/client.ts';
import { check } from '../check.ts';

// A toy trading agent for the demo.
//   pnpm agent "headline" --naive          buys on any bullish-looking headline
//   pnpm agent "headline" [--asset ...]    hires SecondSource first, then lets the Guarded Vault decide
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { naive: { type: 'boolean', default: false }, asset: { type: 'string' }, at: { type: 'string' }, usd: { type: 'string', default: '1000' } },
});
const headline = positionals.join(' ');
if (!headline) throw new Error('Usage: pnpm agent "headline" [--naive] [--asset indices/US30] [--at ISO time]');
const bullish = /\b(pause|cut|deal|approve|approved|beat|surge|rally|ceasefire)\b/i.test(headline);

console.log(`Agent read: "${headline}"`);
if (!bullish) {
  console.log('Not a trading signal. Doing nothing.');
  process.exit(0);
}
if (values.naive) {
  console.log(`Signal looks bullish. BUY $${values.usd} now. (No check.)`);
  process.exit(0);
}

console.log('Signal looks bullish. Hiring SecondSource before acting...');
const pay = createPayer();
const result = await check({ headline, asset: values.asset, publishedAt: values.at }, (s, r) => callAirnode(s, r, pay, { maxAgeSeconds: 300 }), (e) => {
  if (e.type === 'step') console.log(`  ${e.step.status === 'ok' ? 'signed' : 'failed'}: ${e.step.label}${e.attestation?.paymentTx ? ' (paid)' : ''}`);
});
mkdirSync('runs', { recursive: true });
const file = `runs/agent-${result.checkedAt.replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify(result, null, 2));
console.log(`SecondSource: ${result.verdict} (${Math.round(result.confidence * 100)}%). ${result.reasoning}`);
console.log('Asking the Guarded Vault to trade with the signed verdict...');
execFileSync(process.execPath, ['--env-file-if-exists=.env', 'src/vault/trade.ts', file, '--usd', values.usd!, '--send-anyway'], { stdio: 'inherit' });
