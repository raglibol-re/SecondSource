import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Attestation } from '../src/airnode/client.ts';
import type { AirnodeV2Request } from '../src/airnode/airnode-v2.ts';
import type { AirnodeName } from '../src/airnode/registry.ts';
import { check, evidenceWindow, hashResult } from '../src/check.ts';
import { extractKeywords } from '../src/evidence/keywords.ts';
import type { Caller } from '../src/types.ts';

// These tests exercise the pipeline logic with fixture payloads. Signature checking is covered by verify.test.ts; here the
// caller stands in for callAirnode, which only returns attestations that already verified.
const fake = (source: AirnodeName, request: AirnodeV2Request, data: unknown): Attestation => ({
  source,
  request,
  response: { airnode: '0x0000000000000000000000000000000000000001', requestHash: '0x00', timestamp: '1743948720', data: JSON.stringify(data), signature: '0x00' },
  paymentTx: '0xfeed',
});

const HASSETT = {
  headline: 'Hassett: Trump considering 90-day tariff pause',
  asset: 'indices/US30',
  publishedAt: '2025-04-07T14:12:00Z',
};

const denialTweets = {
  tweets: [
    { id: '1909', text: 'FAKE NEWS', createdAt: 'Mon Apr 07 14:30:00 +0000 2025', author: { userName: 'RapidResponse47' } },
  ],
};
const repeatTweets = {
  tweets: [{ id: '1908', text: 'BREAKING: Hassett says Trump considering 90-day pause on tariffs', createdAt: 'Mon Apr 07 14:13:00 +0000 2025', author: { userName: 'DeItaone' } }],
};
const news = [{ title: 'Dow swings 800 points on tariff pause report', created: 'Mon, 07 Apr 2025 14:20:00 -0400', author: 'Staff' }];
const bars = {
  symbol: 'US30',
  results: [
    { t: Date.parse('2025-04-07T14:10:00Z'), h: 37000, c: 37000 },
    { t: Date.parse('2025-04-07T14:20:00Z'), h: 37800, c: 37700 },
    { t: Date.parse('2025-04-07T14:40:00Z'), h: 37200, c: 37100 },
  ],
};

const caller =
  (accountTweets: unknown, judgeAnswer: string, requests: AirnodeV2Request[] = []): Caller =>
  async (source, request) => {
    requests.push(request);
    if (source === 'twitter') return fake(source, request, String(request.parameters.query).startsWith('(') ? accountTweets : repeatTweets);
    if (source === 'benzinga') return fake(source, request, news);
    if (source === 'tickerlayer') return fake(source, request, bars);
    return fake(source, request, { choices: [{ message: { content: judgeAnswer } }] });
  };

test('keywords come from the headline, names first', () => {
  assert.deepEqual(extractKeywords(HASSETT.headline), ['Hassett', 'Trump', '90-day']);
});

test('window is 2h before to 3h after, capped at now', () => {
  assert.deepEqual(evidenceWindow('2025-04-07T14:12:00Z'), { since: '2025-04-07T12:12:00.000Z', until: '2025-04-07T17:12:00.000Z' });
  const now = Date.parse('2025-04-07T15:00:00Z');
  assert.equal(evidenceWindow('2025-04-07T14:12:00Z', now).until, '2025-04-07T15:00:00.000Z');
});

test('DENIED when the official account calls it fake', async () => {
  const requests: AirnodeV2Request[] = [];
  const r = await check(HASSETT, caller(denialTweets, '{"verdict":"DENIED","confidence":0.92,"reasoning":"The White House rapid response account called it fake news.","citations":["E1"]}', requests));
  assert.equal(r.verdict, 'DENIED');
  assert.equal(r.confidence, 0.92);
  assert.deepEqual(r.citations, ['E1']);
  assert.equal(r.evidence[0]!.author, '@RapidResponse47');
  assert.equal(r.attestations.length, 5); // 2 tweets searches, news, bars, judge
  assert.equal(r.costAusd, '0.13');
  assert.match(String(requests[0]!.parameters.query), /^\(from:RapidResponse47 OR from:WhiteHouse OR from:PressSec\) since_time:1744027920 until_time:1744045920$/);
  const market = r.evidence.find((e) => e.kind === 'market')!;
  assert.match(market.text, /\+?2\.16%/);
  const { resultHash, ...rest } = r;
  assert.equal(resultHash, hashResult(rest));
});

test('CONFIRMED when the attributed source says it', async () => {
  const confirm = { tweets: [{ id: '1', text: 'We are pausing tariffs for 90 days.', createdAt: 'Wed Apr 09 17:18:00 +0000 2025', author: { userName: 'WhiteHouse' } }] };
  const r = await check(HASSETT, caller(confirm, 'Sure. {"verdict":"CONFIRMED","confidence":0.8,"reasoning":"The White House said it.","citations":["E1","E99"]}'));
  assert.equal(r.verdict, 'CONFIRMED');
  assert.deepEqual(r.citations, ['E1']); // E99 does not exist and is dropped
});

test('a verdict with no valid citation is downgraded to UNCONFIRMED', async () => {
  const r = await check(HASSETT, caller(denialTweets, '{"verdict":"DENIED","confidence":0.9,"reasoning":"x","citations":["E42"]}'));
  assert.equal(r.verdict, 'UNCONFIRMED');
});

test('garbage from the judge is UNCONFIRMED', async () => {
  const r = await check(HASSETT, caller(denialTweets, 'I cannot help with that'));
  assert.equal(r.verdict, 'UNCONFIRMED');
  assert.equal(r.confidence, 0);
});

test('a failing source is recorded, the rest still count', async () => {
  const base = caller(denialTweets, '{"verdict":"DENIED","confidence":0.9,"reasoning":"x","citations":["E1"]}');
  const r = await check(HASSETT, async (s, q) => {
    if (s === 'benzinga') throw new Error('benzinga.news answered 500');
    return base(s, q);
  });
  assert.equal(r.verdict, 'DENIED');
  assert.equal(r.steps.find((s) => s.source === 'benzinga')!.status, 'failed');
});

test('no evidence at all: UNCONFIRMED without paying the judge', async () => {
  let judged = false;
  const r = await check({ headline: 'Something happened' }, async (s, q) => {
    if (s === 'openrouter') judged = true;
    return fake(s, q, s === 'benzinga' ? [] : { tweets: [] });
  });
  assert.equal(r.verdict, 'UNCONFIRMED');
  assert.equal(judged, false);
});

test('judge unreachable: fixed rules over the signed evidence, marked unsigned', async () => {
  const base = caller(denialTweets, '');
  const r = await check(HASSETT, async (s, q) => {
    if (s === 'openrouter') throw new Error('openrouter.chatCompletion answered 502');
    return base(s, q);
  });
  assert.equal(r.verdict, 'DENIED');
  assert.deepEqual(r.citations, ['E1']);
  assert.equal(r.judge?.signed, false);
  assert.match(r.reasoning, /this judgment is not/);
});
