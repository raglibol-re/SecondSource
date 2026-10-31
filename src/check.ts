import { keccak256, toHex } from 'viem';
import type { Attestation } from './airnode/client.ts';
import type { AirnodeV2Request } from './airnode/airnode-v2.ts';
import { PRICES, type AirnodeName } from './airnode/registry.ts';
import { newsRequest, newsToEvidence } from './evidence/benzinga.ts';
import { extractKeywords } from './evidence/keywords.ts';
import { barsRequest, barsToEvidence } from './evidence/market.ts';
import { companyNewsRequest, filingsRequest, filingsToEvidence, marketNewsRequest, outletNewsToEvidence, topicNewsRequest } from './evidence/news.ts';
import { accountsRequest, accountsTopicRequest, handle, keywordQuery, keywordRequest, tweetsToEvidence } from './evidence/twitter.ts';
import { JUDGE_MODELS, judgeRequest, parseJudgment } from './judge/openrouter.ts';
import { judgeByRules } from './judge/rules.ts';
import type { Caller, CheckInput, CheckResult, CheckStep, EvidenceItem } from './types.ts';

export const DEFAULT_OFFICIAL_ACCOUNTS = ['RapidResponse47', 'WhiteHouse', 'PressSec'];

// Look 2 hours (or lookbackHours) before the headline and up to 3 hours after it, never past now.
export const evidenceWindow = (publishedAt: string, now = Date.now(), lookbackHours = 2) => {
  const t = Date.parse(publishedAt);
  return {
    since: new Date(t - lookbackHours * 3600_000).toISOString(),
    until: new Date(Math.min(t + 3 * 3600_000, now)).toISOString(),
  };
};

// An undated question ("the recent Binance hack") looks back a week, since nobody knows when the story broke.
export const UNDATED_LOOKBACK_HOURS = 168;
const MAX_LOOKBACK_HOURS = 24 * 30;
// LunarCrush topic news and Finnhub market news only serve the current feed.
const CURRENT_FEED_MS = 8 * 24 * 3600_000;

const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]))
      : v;

// The hash the coworker reports to Masumi and signs for the vault: it covers the input, the verdict and every attestation.
export const hashResult = (result: Omit<CheckResult, 'resultHash'>) => keccak256(toHex(JSON.stringify(canonical(result))));

export type ProgressEvent =
  | { type: 'step'; step: CheckStep; attestation?: Attestation }
  | { type: 'evidence'; evidence: EvidenceItem[] };

// A signed planning step that came before the check (src/agent/plan.ts); it joins the receipts and the result hash.
export interface Prelude {
  question: string;
  reply: string;
  model?: string;
  attestation?: Attestation;
}

export const check = async (rawInput: CheckInput, call: Caller, onProgress?: (e: ProgressEvent) => void, prelude?: Prelude): Promise<CheckResult> => {
  if (!rawInput.headline?.trim()) throw new Error('headline is required');
  const dated = !!rawInput.publishedAt && !Number.isNaN(Date.parse(rawInput.publishedAt));
  const lookback = Number(rawInput.lookbackHours);
  const input: CheckInput = {
    ...rawInput,
    headline: rawInput.headline.trim(),
    publishedAt: dated ? new Date(rawInput.publishedAt!).toISOString() : new Date().toISOString(),
    lookbackHours: Number.isFinite(lookback) && lookback > 0 ? Math.min(lookback, MAX_LOOKBACK_HOURS) : dated ? undefined : UNDATED_LOOKBACK_HOURS,
  };
  if (input.lookbackHours === undefined) delete input.lookbackHours;
  const window = evidenceWindow(input.publishedAt!, Date.now(), input.lookbackHours ?? 2);
  const keywords = input.keywords?.length ? input.keywords : extractKeywords(input.headline);
  const accounts = [...new Set([...(input.officialAccounts?.length ? input.officialAccounts : DEFAULT_OFFICIAL_ACCOUNTS), ...(input.claimedSource ? [input.claimedSource] : [])].map(handle))];
  const longWindow = (input.lookbackHours ?? 2) > 6;
  const current = Date.now() - Date.parse(window.until) < CURRENT_FEED_MS;

  const plan: { label: string; source: AirnodeName; request: AirnodeV2Request; toEvidence: (a: Attestation, i: number) => Omit<EvidenceItem, 'id'>[] }[] = [
    { label: `Posts by ${accounts.map((a) => '@' + a).join(', ')}`, source: 'twitter', request: accountsRequest(accounts, window.since, window.until), toEvidence: (a, i) => tweetsToEvidence(a, i, 20) },
    { label: `Top posts about ${keywordQuery(keywords)}`, source: 'twitter', request: keywordRequest(keywords, window.since, window.until), toEvidence: (a, i) => tweetsToEvidence(a, i, 8) },
    { label: `Benzinga newswire, ${window.since.slice(0, 10)}${window.until.slice(0, 10) !== window.since.slice(0, 10) ? ` to ${window.until.slice(0, 10)}` : ''}`, source: 'benzinga', request: newsRequest(window.since, window.until), toEvidence: (a, i) => newsToEvidence(a, i, keywords, window.since, window.until) },
  ];
  // Over a long window the accounts' latest posts are mostly about other things; also ask for their posts on the topic.
  if (longWindow) {
    plan.splice(1, 0, { label: `What ${accounts.map((a) => '@' + a).join(', ')} said about it`, source: 'twitter', request: accountsTopicRequest(accounts, keywords, window.since, window.until), toEvidence: (a, i) => tweetsToEvidence(a, i, 10) });
  }
  if (current) {
    const topic = (input.newsTopic ?? keywords[0] ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    if (topic) plan.push({ label: `News outlets on "${topic}" (LunarCrush)`, source: 'lunarcrush', request: topicNewsRequest(topic), toEvidence: (a, i) => outletNewsToEvidence(a, i, keywords, window.since, window.until) });
    const category = input.newsCategory ?? (input.asset?.startsWith('crypto/') ? 'crypto' : 'general');
    plan.push({ label: `Finnhub ${category} market news`, source: 'finnhub', request: marketNewsRequest(category), toEvidence: (a, i) => outletNewsToEvidence(a, i, keywords, window.since, window.until) });
  }
  if (input.ticker) {
    const ticker = input.ticker;
    plan.push({ label: `Finnhub company news for ${ticker}`, source: 'finnhub', request: companyNewsRequest(ticker, window.since, window.until), toEvidence: (a, i) => outletNewsToEvidence(a, i, keywords, window.since, window.until) });
    plan.push({ label: `SEC filings by ${ticker}`, source: 'finnhub', request: filingsRequest(ticker, window.since, window.until), toEvidence: (a, i) => filingsToEvidence(a, i, ticker) });
  }
  if (input.asset) {
    plan.push({ label: `Market: ${input.asset} price bars`, source: 'tickerlayer', request: barsRequest(input.asset, window.since, window.until), toEvidence: (a, i) => barsToEvidence(a, i, input.publishedAt!, window.since, window.until) });
  }

  // Buy all evidence in parallel. A failed source is recorded, not fatal.
  const settled = await Promise.allSettled(
    plan.map(async (p) => {
      const a = await call(p.source, p.request);
      return a;
    })
  );
  const attestations: Attestation[] = [];
  const steps: CheckStep[] = [];
  if (prelude) {
    const step: CheckStep = prelude.attestation
      ? { label: `Plan: ${prelude.model}`, source: 'openrouter', status: 'ok', attestation: attestations.push(prelude.attestation) - 1 }
      : { label: 'Plan: simple rules (no model reachable)', source: 'openrouter', status: 'failed' };
    steps.push(step);
  }
  const evidence: EvidenceItem[] = [];
  settled.forEach((s, k) => {
    const p = plan[k]!;
    if (s.status === 'fulfilled') {
      const index = attestations.push(s.value) - 1;
      const step: CheckStep = { label: p.label, source: p.source, status: 'ok', attestation: index };
      steps.push(step);
      onProgress?.({ type: 'step', step, attestation: s.value });
      try {
        // The same post can come back from both searches; keep the first copy.
        for (const e of p.toEvidence(s.value, index)) if (!(e.url && evidence.some((x) => x.url === e.url))) evidence.push({ ...e, id: `E${evidence.length + 1}` });
      } catch (err) {
        step.error = `Could not read the response: ${(err as Error).message}`;
      }
    } else {
      const step: CheckStep = { label: p.label, source: p.source, status: 'failed', error: String((s.reason as Error)?.message ?? s.reason).slice(0, 300) };
      steps.push(step);
      onProgress?.({ type: 'step', step });
    }
  });
  onProgress?.({ type: 'evidence', evidence });

  let judgment = { verdict: 'UNCONFIRMED' as CheckResult['verdict'], confidence: 0, reasoning: 'No evidence could be bought, so nothing confirms the headline.', citations: [] as string[] };
  let judge: CheckResult['judge'] = null;
  if (evidence.length > 0) {
    // Try each model in turn through the OpenRouter Airnode; a refused call is not charged.
    for (const model of JUDGE_MODELS) {
      const request = judgeRequest(input, evidence, model);
      try {
        const a = await call('openrouter', request);
        const index = attestations.push(a) - 1;
        judge = { model, attestation: index, signed: true };
        const step: CheckStep = { label: `Judge: ${model}`, source: 'openrouter', status: 'ok', attestation: index };
        steps.push(step);
        onProgress?.({ type: 'step', step, attestation: a });
        judgment = parseJudgment(a, evidence);
        break;
      } catch (err) {
        const step: CheckStep = { label: `Judge: ${model}`, source: 'openrouter', status: 'failed', error: (err as Error).message.slice(0, 300) };
        steps.push(step);
        onProgress?.({ type: 'step', step });
      }
    }
    if (!judge) {
      // No model reachable: fixed rules over the signed evidence, and the result says so.
      judgment = judgeByRules(input, evidence, keywords, accounts);
      judge = { model: 'fixed rules (OpenRouter Airnode unavailable)', signed: false };
    }
  }

  const cost = attestations.reduce((sum, a) => sum + Math.round(Number(PRICES[a.source]?.[a.request.operation] ?? 0) * 100), 0) / 100;
  const result: Omit<CheckResult, 'resultHash'> = {
    input: { ...input, keywords, officialAccounts: accounts },
    ...(prelude ? { plan: { question: prelude.question, reply: prelude.reply, model: prelude.model ?? null } } : {}),
    window,
    ...judgment,
    evidence,
    attestations,
    steps,
    judge,
    costAusd: cost.toFixed(2),
    checkedAt: new Date().toISOString(),
  };
  return { ...result, resultHash: hashResult(result) };
};
