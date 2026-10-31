import type { Attestation } from '../airnode/client.ts';
import type { AirnodeV2Request } from '../airnode/airnode-v2.ts';
import type { CheckInput, EvidenceItem, Verdict } from '../types.ts';

// Every chatCompletion costs the same flat 0.05 aUSD, whatever the model. On 2026-10-31 the Airnode refused paid models
// with an upstream 403 but served this free one, so the judge tries the preferred model first and falls back in order.
// JUDGE_MODELS (comma separated) overrides the list.
export const JUDGE_MODELS = (process.env.JUDGE_MODELS ?? 'anthropic/claude-sonnet-5,nvidia/nemotron-3-ultra-550b-a55b:free,google/gemma-4-31b-it:free')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
export const JUDGE_MODEL = JUDGE_MODELS[0]!;

const SYSTEM = `You are SecondSource, a fact-checker that trading agents hire before acting on a market headline.
You get the headline and a numbered list of evidence. Every evidence line was bought from a primary source and is cryptographically signed, so treat it as authentic, but judge what it actually says.
Rules:
- DENIED: an official or primary source in the evidence contradicts or disowns the claim (e.g. calls it fake, wrong, or not true). This wins over everything else.
- CONFIRMED: an official or primary source in the evidence states the claim, or the person it is attributed to says it. A company's own SEC filing counts as primary for its disclosures.
- CONFIRMED, with confidence at most 0.8: for an event (a hack, an outage, an arrest, a deal) rather than a quote, when at least two independent established news organisations (e.g. Reuters, AP, Bloomberg, ABC News, Fox Business, Forbes, CoinDesk, Cointelegraph, Decrypt) report it as fact in their own reporting, and no primary source disputes it. Say in the reasoning that the confirmation rests on independent reporting.
- UNCONFIRMED: anything else. Outlets relaying an unverified quote or "reports say" are not confirmation, and neither are anonymous accounts. Market moves are context, never proof.
- Cite only evidence ids that support your verdict.
Answer with JSON only, no prose around it:
{"verdict":"CONFIRMED|UNCONFIRMED|DENIED","confidence":0.0-1.0,"reasoning":"two or three plain sentences","citations":["E1"]}`;

export const judgeRequest = (input: CheckInput, evidence: EvidenceItem[], model = JUDGE_MODEL): AirnodeV2Request => {
  const lines = evidence.map((e) => `[${e.id}] (${e.kind}${e.author ? `, ${e.author}` : ''}${e.at ? `, ${e.at}` : ''}) ${e.text}`);
  const user = [
    `Headline: ${input.headline}`,
    input.claimedSource ? `Attributed to: ${input.claimedSource}` : '',
    input.lookbackHours && input.lookbackHours > 6
      ? `Asked at ${input.publishedAt}; no headline time was given, so the evidence covers the ${input.lookbackHours} hours before.`
      : `Headline time: ${input.publishedAt}`,
    '',
    'Evidence:',
    ...lines,
  ]
    .filter((l) => l !== '')
    .join('\n');
  return {
    operation: 'chatCompletion',
    parameters: {
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: user },
      ],
    },
  };
};

export interface Judgment {
  verdict: Verdict;
  confidence: number;
  reasoning: string;
  citations: string[];
}

const VERDICTS: Verdict[] = ['CONFIRMED', 'UNCONFIRMED', 'DENIED'];

// Reads the model's answer out of the signed completion and enforces the rules the model may have bent: citations must
// exist, and a CONFIRMED or DENIED with nothing valid to point at is downgraded to UNCONFIRMED.
export const parseJudgment = (completion: Attestation, evidence: EvidenceItem[]): Judgment => {
  const body = JSON.parse(completion.response.data) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content ?? '';
  const match = /\{[\s\S]*\}/.exec(content);
  if (!match) return { verdict: 'UNCONFIRMED', confidence: 0, reasoning: 'The judge gave no readable answer.', citations: [] };
  let raw: Partial<Judgment>;
  try {
    raw = JSON.parse(match[0]) as Partial<Judgment>;
  } catch {
    return { verdict: 'UNCONFIRMED', confidence: 0, reasoning: 'The judge gave no readable answer.', citations: [] };
  }
  const ids = new Set(evidence.map((e) => e.id));
  const citations = (Array.isArray(raw.citations) ? raw.citations : []).filter((c): c is string => typeof c === 'string' && ids.has(c));
  let verdict: Verdict = VERDICTS.includes(raw.verdict as Verdict) ? (raw.verdict as Verdict) : 'UNCONFIRMED';
  let reasoning = typeof raw.reasoning === 'string' ? raw.reasoning : '';
  if (verdict !== 'UNCONFIRMED' && citations.length === 0) {
    verdict = 'UNCONFIRMED';
    reasoning = `${reasoning} (Downgraded: the judge cited no evidence.)`.trim();
  }
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0));
  return { verdict, confidence, reasoning, citations };
};
