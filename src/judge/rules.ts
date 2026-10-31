import { handle } from '../evidence/twitter.ts';
import type { CheckInput, EvidenceItem } from '../types.ts';
import type { Judgment } from './openrouter.ts';

// Fallback judge for when the OpenRouter Airnode is unavailable. Deterministic and deliberately narrow: it reads only
// posts by the primary accounts, and only says DENIED or CONFIRMED when one of them speaks to the claim directly.
// Its verdict is not signed (the evidence still is), and the result says so.
const DENIAL = /\b(fake news|wrong|false|not true|untrue|did not say|didn't say|never said|no such|misreport\w*|incorrect|denie[sd])\b/i;

export const judgeByRules = (input: CheckInput, evidence: EvidenceItem[], keywords: string[], accounts: string[]): Judgment => {
  const primary = new Set(accounts.map((a) => `@${handle(a)}`.toLowerCase()));
  const words = keywords.map((k) => k.toLowerCase()).filter((k) => k.length > 2);
  const published = Date.parse(input.publishedAt ?? '');
  const posts = evidence.filter((e) => e.kind === 'tweet' && e.author && primary.has(e.author.toLowerCase()));

  const relevant = (e: EvidenceItem) => words.filter((w) => e.text.toLowerCase().includes(w)).length;
  const soonAfter = (e: EvidenceItem) => {
    const t = Date.parse(e.at ?? '');
    return Number.isFinite(t) && Number.isFinite(published) && t >= published && t - published <= 60 * 60_000;
  };

  // Posts from before the headline cannot answer it.
  const afterHeadline = (e: EvidenceItem) => !Number.isFinite(published) || !e.at || Date.parse(e.at) >= published;
  // A primary account rejecting the claim: it names the claim, or answers within an hour of the headline.
  const denials = posts.filter((e) => afterHeadline(e) && DENIAL.test(e.text) && (relevant(e) >= 1 || soonAfter(e)));
  if (denials.length) {
    const named = denials.filter((e) => relevant(e) >= 1);
    return {
      verdict: 'DENIED',
      confidence: named.length ? 0.85 : 0.65,
      reasoning: `${denials.length} post${denials.length > 1 ? 's' : ''} by ${[...new Set(denials.map((e) => e.author))].join(', ')} reject${denials.length > 1 ? '' : 's'} the claim${named.length ? ', naming it directly' : ' within an hour of the headline'}. Judged by fixed rules because the OpenRouter Airnode was unavailable; the evidence is signed, this judgment is not.`,
      citations: denials.map((e) => e.id),
    };
  }
  // A primary account stating the claim itself: it must carry the specific words of the headline, not only names.
  const specific = keywords.filter((k) => !/^[A-Z]/.test(k)).map((k) => k.toLowerCase());
  const specificHits = (e: EvidenceItem) => specific.filter((w) => e.text.toLowerCase().includes(w)).length;
  const confirmations = posts.filter(
    (e) => !DENIAL.test(e.text) && relevant(e) >= Math.min(2, words.length) && specificHits(e) >= Math.min(2, specific.length)
  );
  if (confirmations.length) {
    return {
      verdict: 'CONFIRMED',
      confidence: 0.6,
      reasoning: `${[...new Set(confirmations.map((e) => e.author))].join(', ')} posted about the claim in the window without disputing it. Judged by fixed rules because the OpenRouter Airnode was unavailable; the evidence is signed, this judgment is not.`,
      citations: confirmations.map((e) => e.id),
    };
  }
  return {
    verdict: 'UNCONFIRMED',
    confidence: 0.3,
    reasoning: 'No primary account confirmed or denied the claim in the window. Judged by fixed rules because the OpenRouter Airnode was unavailable; the evidence is signed, this judgment is not.',
    citations: [],
  };
};
