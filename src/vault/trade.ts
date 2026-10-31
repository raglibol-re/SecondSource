import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { CheckResult } from '../types.ts';
import { actOnVerdict } from './actions.ts';

// pnpm vault:act runs/check-....json [--usd 1000] [--send-anyway]
// CONFIRMED: executeTrade with a fresh signed price, the signed primary-source post and the verdict.
// DENIED: haltOnDenial with the signed post and the verdict, which halts trading for everyone for an hour.
const { positionals, values } = parseArgs({ allowPositionals: true, options: { usd: { type: 'string', default: '1000' }, 'send-anyway': { type: 'boolean', default: false } } });
if (!positionals[0]) throw new Error('Usage: pnpm vault:act <check result json> [--usd 1000] [--send-anyway]');
const result = JSON.parse(readFileSync(positionals[0], 'utf8')) as CheckResult;
console.log(`Verdict ${result.verdict} for "${result.input.headline}"`);
const r = await actOnVerdict(result, { usd: values.usd, sendAnyway: values['send-anyway'] });
if (r.ok) console.log(`DONE: ${r.label}\n  https://sepolia.basescan.org/tx/${r.hash}`);
else console.log(`REFUSED: ${r.label}: ${r.revert?.error}(${r.revert?.args}), ${r.revert?.reason}${r.hash ? `\n  on chain: https://sepolia.basescan.org/tx/${r.hash}` : ''}`);
