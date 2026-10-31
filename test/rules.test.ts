import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeByRules } from '../src/judge/rules.ts';
import type { EvidenceItem } from '../src/types.ts';

const input = { headline: 'Hassett: Trump considering 90-day tariff pause', publishedAt: '2025-04-07T14:12:00.000Z' };
const keywords = ['Hassett', 'Trump', '90-day'];
const accounts = ['RapidResponse47', 'WhiteHouse', 'PressSec'];
const tweet = (id: string, author: string, at: string, text: string): EvidenceItem => ({ id, attestation: 0, kind: 'tweet', author, at, text });

// Texts as signed by the TwitterAPI.io Airnode for 7 April 2025.
const real = [
  tweet('E1', '@RapidResponse47', '2025-04-07T14:41:00.000Z', '.@PressSec: Reports that @POTUS is considering a 90-day pause on tariffs are FAKE NEWS.'),
  tweet('E2', '@RapidResponse47', '2025-04-07T14:39:00.000Z', 'Wrong. Fake News.'),
  tweet('E3', '@RapidResponse47', '2025-04-07T14:38:00.000Z', 'Wrong. Not only did Director Hassett not say this (clip below), @POTUS has been clear'),
  tweet('E4', '@RapidResponse47', '2025-04-07T15:29:00.000Z', 'Senator @Eric_Schmitt: "I think a lot of these judges are taking it upon themselves"'),
  tweet('E5', '@DeItaone', '2025-04-07T14:13:00.000Z', 'HASSETT: TRUMP CONSIDERING 90-DAY PAUSE IN TARIFFS'),
];

test('the real 7 April posts give DENIED, citing the three denials only', () => {
  const j = judgeByRules(input, real, keywords, accounts);
  assert.equal(j.verdict, 'DENIED');
  assert.deepEqual(j.citations.sort(), ['E1', 'E2', 'E3']);
  assert.equal(j.confidence, 0.85);
});

test('a secondary account repeating the claim is not confirmation', () => {
  assert.equal(judgeByRules(input, [real[4]!], keywords, accounts).verdict, 'UNCONFIRMED');
});

test('a primary account stating the claim confirms it', () => {
  const j = judgeByRules(input, [tweet('E1', '@WhiteHouse', '2025-04-09T17:18:00.000Z', 'President Trump authorizes a 90-day pause on reciprocal tariffs')], keywords, accounts);
  assert.equal(j.verdict, 'CONFIRMED');
});

test('a post from before the headline cannot deny it', () => {
  const early = tweet('E9', '@RapidResponse47', '2025-04-07T12:41:00.000Z', '"If that were false," says NEC Director Kevin Hassett about tariffs');
  assert.equal(judgeByRules(input, [early], keywords, accounts).verdict, 'UNCONFIRMED');
});
