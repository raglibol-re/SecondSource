import { mkdirSync, writeFileSync } from 'node:fs';
import { callAirnode, createPayer, type Attestation } from '../airnode/client.ts';
import type { AirnodeV2Request } from '../airnode/airnode-v2.ts';
import type { AirnodeName } from '../airnode/registry.ts';

// Phase 1 feasibility: can we get signed evidence about 7 April 2025 (the Hassett tariff-pause headline)?
// The headline ran at 10:12 New York (14:12 UTC). Window: 13:30 to 16:00 UTC.
const since = Date.UTC(2025, 3, 7, 13, 30) / 1000;
const until = Date.UTC(2025, 3, 7, 16, 0) / 1000;

const probes: [string, AirnodeName, AirnodeV2Request][] = [
  ['rapidresponse-tweets', 'twitter', { operation: 'searchTweets', parameters: { query: `from:RapidResponse47 since_time:${since} until_time:${until}`, queryType: 'Latest' } }],
  ['benzinga-hassett', 'benzinga', { operation: 'news', parameters: { dateFrom: '2025-04-07', dateTo: '2025-04-07', topics: 'Hassett', displayOutput: 'abstract', pageSize: 20 } }],
  ['dow-bars', 'tickerlayer', { operation: 'aggregates', parameters: { assetClass: 'indices', symbol: 'US30', multiplier: 5, timespan: 'minute', from: '2025-04-07', to: '2025-04-07' } }],
];

const only = process.argv[2];
const pay = createPayer();
mkdirSync('runs', { recursive: true });
for (const [name, source, request] of probes) {
  if (only && only !== name) continue;
  try {
    const a: Attestation = await callAirnode(source, request, pay);
    writeFileSync(`runs/probe-${name}.json`, JSON.stringify(a, null, 2));
    console.log(`\n## ${name}: verified, ${a.response.data.length} bytes, paid ${a.paymentTx ?? 'free'}`);
    console.log(a.response.data.slice(0, 1200));
  } catch (e) {
    console.log(`\n## ${name}: FAILED ${(e as Error).message.slice(0, 500)}`);
  }
}
