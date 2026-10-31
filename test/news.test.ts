import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Attestation } from '../src/airnode/client.ts';
import type { AirnodeV2Request } from '../src/airnode/airnode-v2.ts';
import type { AirnodeName } from '../src/airnode/registry.ts';
import { check, UNDATED_LOOKBACK_HOURS } from '../src/check.ts';
import { outletNewsToEvidence } from '../src/evidence/news.ts';
import { keywordQuery } from '../src/evidence/twitter.ts';
import { judgeByRules } from '../src/judge/rules.ts';
import type { EvidenceItem } from '../src/types.ts';

const fake = (source: AirnodeName, request: AirnodeV2Request, data: unknown): Attestation => ({
  source,
  request,
  response: { airnode: '0x0000000000000000000000000000000000000001', requestHash: '0x00', timestamp: '0', data: JSON.stringify(data), signature: '0x00' },
});

const now = Math.floor(Date.now() / 1000);
// Shapes as returned on 31 Oct 2026 by LunarCrush topicNews and Finnhub market-news.
const lunar = { data: [
  { post_title: 'North Korean hackers suspected in $6.3B Binance cryptocurrency theft', post_link: 'https://www.foxbusiness.com/a', post_created: now - 3600 * 20, creator_display_name: 'Fox Business' },
  { post_title: 'Bitcoin ETF flows slow', post_link: 'https://example.com/b', post_created: now - 3600, creator_display_name: 'Forbes' },
] };
const finnhub = [{ headline: 'Experts divided over Binance hack asset freezes', datetime: now - 3600 * 5, source: 'CoinDesk', summary: 'After the hack...', url: 'https://www.coindesk.com/c' }];

test('the keyword search needs the name and any one of the other words', () => {
  assert.equal(keywordQuery(['Binance', 'hack', 'North Korea']), 'Binance (hack OR "North Korea")');
  assert.equal(keywordQuery(['Binance']), 'Binance');
});

test('outlet news keeps stories that mention the claim, inside the window', () => {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const until = new Date().toISOString();
  const ev = outletNewsToEvidence(fake('lunarcrush', { operation: 'topicNews', parameters: {} }, lunar), 0, ['Binance', 'hack'], since, until);
  assert.equal(ev.length, 1);
  assert.equal(ev[0]!.author, 'Fox Business');
  assert.equal(ev[0]!.url, 'https://www.foxbusiness.com/a');
});

test('an undated question looks back a week and asks news outlets', async () => {
  const requests: { source: string; request: AirnodeV2Request }[] = [];
  const r = await check({ headline: 'Binance was hacked', keywords: ['Binance', 'hack'], asset: 'crypto/BTCUSD' }, async (source, request) => {
    requests.push({ source, request });
    if (source === 'lunarcrush') return fake(source, request, lunar);
    if (source === 'finnhub') return fake(source, request, finnhub);
    if (source === 'twitter') return fake(source, request, { tweets: [] });
    if (source === 'benzinga') return fake(source, request, []);
    if (source === 'tickerlayer') return fake(source, request, { results: [] });
    throw new Error('no model');
  });
  assert.equal(r.input.lookbackHours, UNDATED_LOOKBACK_HOURS);
  assert.ok(Date.parse(r.window.until) - Date.parse(r.window.since) >= 167 * 3600_000);
  assert.deepEqual(requests.find((x) => x.source === 'lunarcrush')?.request.parameters, { topic: 'binance' });
  assert.deepEqual(requests.find((x) => x.source === 'finnhub')?.request.parameters, { category: 'crypto' });
  // Two independent outlets report the hack as fact and no primary account disputes it.
  assert.equal(r.verdict, 'CONFIRMED');
  assert.match(r.reasoning, /independent/);
});

test('one outlet alone, or hedged reports, do not confirm', () => {
  const base = { attestation: 0, kind: 'news' as const };
  const one: EvidenceItem[] = [{ ...base, id: 'E1', author: 'CoinDesk', text: 'Binance hack drains $6.3B' }];
  assert.equal(judgeByRules({ headline: 'Binance hacked' }, one, ['Binance', 'hack'], []).verdict, 'UNCONFIRMED');
  const hedged: EvidenceItem[] = [...one, { ...base, id: 'E2', author: 'Decrypt', text: 'Binance hack rumours spread, unconfirmed' }];
  assert.equal(judgeByRules({ headline: 'Binance hacked' }, hedged, ['Binance', 'hack'], []).verdict, 'UNCONFIRMED');
});
