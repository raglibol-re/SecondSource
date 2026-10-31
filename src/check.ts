import { keccak256, toHex } from 'viem';
import type { Attestation } from './airnode/client.ts';
import type { AirnodeV2Request } from './airnode/airnode-v2.ts';
import { PRICES, type AirnodeName } from './airnode/registry.ts';
import { newsRequest, newsToEvidence } from './evidence/benzinga.ts';
import { extractKeywords } from './evidence/keywords.ts';
import { barsRequest, barsToEvidence } from './evidence/market.ts';
import { accountsRequest, handle, keywordRequest, tweetsToEvidence } from './evidence/twitter.ts';
import { JUDGE_MODELS, judgeRequest, parseJudgment } from './judge/openrouter.ts';
import { judgeByRules } from './judge/rules.ts';
import type { Caller, CheckInput, CheckResult, CheckStep, EvidenceItem } from './types.ts';

export const DEFAULT_OFFICIAL_ACCOUNTS = ['RapidResponse47', 'WhiteHouse', 'PressSec'];

// Look 2 hours before the headline and up to 3 hours after it, never past now.
export const evidenceWindow = (publishedAt: string, now = Date.now()) => {
  const t = Date.parse(publishedAt);
  return {
    since: new Date(t - 2 * 3600_000).toISOString(),
    until: new Date(Math.min(t + 3 * 3600_000, now)).toISOString(),
  };
};

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
  const input: CheckInput = {
    ...rawInput,
    headline: rawInput.headline.trim(),
    publishedAt: rawInput.publishedAt && !Number.isNaN(Date.parse(rawInput.publishedAt)) ? new Date(rawInput.publishedAt).toISOString() : new Date().toISOString(),
  };
  const window = evidenceWindow(input.publishedAt!);
  const keywords = input.keywords?.length ? input.keywords : extractKeywords(input.headline);
  const accounts = [...new Set([...(input.officialAccounts?.length ? input.officialAccounts : DEFAULT_OFFICIAL_ACCOUNTS), ...(input.claimedSource ? [input.claimedSource] : [])].map(handle))];

  const plan: { label: string; source: AirnodeName; request: AirnodeV2Request; toEvidence: (a: Attestation, i: number) => Omit<EvidenceItem, 'id'>[] }[] = [
    { label: `Posts by ${accounts.map((a) => '@' + a).join(', ')}`, source: 'twitter', request: accountsRequest(accounts, window.since, window.until), toEvidence: (a, i) => tweetsToEvidence(a, i, 20) },
    { label: `Top posts about "${keywords.join(' ')}"`, source: 'twitter', request: keywordRequest(keywords, window.since, window.until), toEvidence: (a, i) => tweetsToEvidence(a, i, 6) },
    { label: `Benzinga newswire, ${window.since.slice(0, 10)}`, source: 'benzinga', request: newsRequest(window.since, window.until), toEvidence: (a, i) => newsToEvidence(a, i, keywords, window.since, window.until) },
  ];
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
