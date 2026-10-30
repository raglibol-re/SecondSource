import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { CheckResult } from '../types.ts';

// Refreshes the static data the site reads:
// - public/data/transactions.json from docs/transactions.md
// - public/runs/index.json from the recorded checks in public/runs/*.json
// - public/data/example-nodary.json from the test fixture
mkdirSync('public/data', { recursive: true });
mkdirSync('public/runs', { recursive: true });

const txs = existsSync('docs/transactions.md')
  ? readFileSync('docs/transactions.md', 'utf8')
      .split('\n')
      .filter((l) => /^\| \d{4}-/.test(l))
      .map((l) => {
        const [when, network, link, what] = l.split('|').slice(1, 5).map((c) => c.trim());
        return { when, network, link, what };
      })
  : [];
writeFileSync('public/data/transactions.json', JSON.stringify(txs, null, 2) + '\n');

const runs = readdirSync('public/runs')
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((file) => {
    const r = JSON.parse(readFileSync(`public/runs/${file}`, 'utf8')) as CheckResult & { note?: string };
    return {
      file,
      headline: r.input.headline,
      verdict: r.verdict,
      note: r.note ?? `Checked ${r.checkedAt.slice(0, 10)} with ${r.attestations.length} signed answers.`,
      checkedAt: r.checkedAt,
    };
  })
  .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
writeFileSync('public/runs/index.json', JSON.stringify(runs, null, 2) + '\n');

copyFileSync('test/fixtures/nodary-eth-usd.json', 'public/data/example-nodary.json');
console.log(`${txs.length} transactions, ${runs.length} recorded checks`);
