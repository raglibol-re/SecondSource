import type { Attestation } from '../airnode/client.ts';
import type { AirnodeV2Request } from '../airnode/airnode-v2.ts';
import { extractKeywords } from '../evidence/keywords.ts';
import { JUDGE_MODELS } from '../judge/openrouter.ts';
import type { Caller, CheckInput } from '../types.ts';

// The agent's first step: read a free-form question about a headline and decide what to check, where the primary source
// would speak, and which market to watch. Asked through the OpenRouter Airnode, so the plan is signed like the evidence.

export interface Plan {
  headline: string;
  publishedAt?: string;
  claimedSource?: string;
  asset?: string;
  keywords: string[];
  officialAccounts: string[];
  newsTopic?: string;
  newsCategory?: 'general' | 'crypto' | 'forex' | 'merger';
  ticker?: string;
  lookbackHours?: number;
  reply: string;
}

const ASSETS = ['indices/US30', 'indices/US500', 'indices/US100', 'crypto/BTCUSD', 'crypto/ETHUSD', 'commodities/XAUUSD', 'commodities/WTIUSD'];

const SYSTEM = `You are the planning step of SecondSource, an agent that checks market headlines against primary sources before trading agents act on them.
Read the user's message and plan the check. Answer with JSON only:
{"headline": "the claim, written as a one-line headline",
 "publishedAt": "ISO 8601 UTC time the headline ran, or null if the user gave none (then it is now)",
 "claimedSource": "X handle of the person or organisation the claim is attributed to, without @, or null",
 "officialAccounts": ["2 to 4 X handles, without @, of the primary sources whose own posts would confirm or deny it"],
 "keywords": ["2 to 4 search words: names and the most distinctive terms"],
 "asset": "one of ${ASSETS.join(', ')}, the market most affected, or null",
 "newsTopic": "one lowercase word or short name news sites would tag the story with (e.g. binance, nvidia, tariffs), or null",
 "newsCategory": "general, crypto, forex or merger: the news feed most likely to carry it",
 "ticker": "US stock ticker if the claim is about a US-listed company (e.g. NVDA), else null",
 "lookbackHours": "how many hours before the headline time to search: 2 for a fresh headline with a time, 24 to 168 for 'recent', 'this week' or an undated event",
 "reply": "one or two sentences to the user, saying what you will check and where you will look"}
Rules: primary sources are the people and institutions themselves (e.g. WhiteHouse, RapidResponse47, PressSec for the US administration; federalreserve for the Fed; a company's own account and its CEO for company news), not news outlets; news outlets and filings are searched separately. Convert local times to UTC (New York is UTC-4 in summer, UTC-5 in winter). Today is {TODAY}.`;

const handle = (s: unknown) => (typeof s === 'string' ? s.trim().replace(/^@/, '') : '');
const validHandle = (s: string) => /^[A-Za-z0-9_]{1,15}$/.test(s);

export const planRequest = (question: string, model: string): AirnodeV2Request => ({
  operation: 'chatCompletion',
  parameters: {
    model,
    messages: [
      { role: 'system', content: SYSTEM.replace('{TODAY}', new Date().toISOString().slice(0, 10)) },
      { role: 'user', content: question.slice(0, 1000) },
    ],
  },
});

// Reads the model's plan and keeps only what is valid; anything missing falls back to simple rules.
export const parsePlan = (question: string, content: string): Plan => {
  let raw: Record<string, unknown> = {};
  const m = /\{[\s\S]*\}/.exec(content);
  if (m) {
    try {
      raw = JSON.parse(m[0]);
    } catch {}
  }
  const headline = typeof raw.headline === 'string' && raw.headline.trim().length >= 8 ? raw.headline.trim().slice(0, 300) : question.trim().slice(0, 300);
  const t = typeof raw.publishedAt === 'string' ? Date.parse(raw.publishedAt) : NaN;
  // Models tend to invent a time ("today, 00:00") when the user gave none; without any digits in the question, use now.
  const userGaveTime = /\d/.test(question);
  const publishedAt = userGaveTime && Number.isFinite(t) && t <= Date.now() + 60_000 ? new Date(t).toISOString() : undefined;
  const claimed = handle(raw.claimedSource);
  const accounts = (Array.isArray(raw.officialAccounts) ? raw.officialAccounts : []).map(handle).filter(validHandle).slice(0, 4);
  const keywords = (Array.isArray(raw.keywords) ? raw.keywords : []).filter((k): k is string => typeof k === 'string' && k.trim().length > 1).map((k) => k.trim()).slice(0, 4);
  const asset = typeof raw.asset === 'string' && ASSETS.includes(raw.asset) ? raw.asset : undefined;
  const topic = typeof raw.newsTopic === 'string' ? raw.newsTopic.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().slice(0, 40) : '';
  const category = ['general', 'crypto', 'forex', 'merger'].includes(String(raw.newsCategory)) ? (raw.newsCategory as Plan['newsCategory']) : undefined;
  const ticker = typeof raw.ticker === 'string' && /^[A-Z]{1,5}(\.[A-Z])?$/.test(raw.ticker.trim()) ? raw.ticker.trim() : undefined;
  const hours = Number(raw.lookbackHours);
  return {
    headline,
    publishedAt,
    claimedSource: validHandle(claimed) ? claimed : undefined,
    asset,
    keywords: keywords.length ? keywords : extractKeywords(headline),
    officialAccounts: accounts,
    newsTopic: topic || undefined,
    newsCategory: category,
    ticker,
    lookbackHours: Number.isFinite(hours) && hours > 0 ? Math.min(Math.round(hours), 720) : undefined,
    reply: typeof raw.reply === 'string' && raw.reply.trim() ? raw.reply.trim().slice(0, 400) : `I'll check "${headline}" against primary sources.`,
  };
};

export const toCheckInput = (p: Plan): CheckInput => ({
  headline: p.headline,
  publishedAt: p.publishedAt,
  claimedSource: p.claimedSource,
  asset: p.asset,
  keywords: p.keywords,
  officialAccounts: p.officialAccounts.length ? p.officialAccounts : undefined,
  newsTopic: p.newsTopic,
  newsCategory: p.newsCategory,
  ticker: p.ticker,
  lookbackHours: p.lookbackHours,
});

// Tries each model through the Airnode; a refused call is not charged. Without any model, plans by simple rules.
export const planCheck = async (question: string, call: Caller): Promise<{ plan: Plan; attestation?: Attestation; model?: string }> => {
  for (const model of JUDGE_MODELS) {
    try {
      const a = await call('openrouter', planRequest(question, model));
      const body = JSON.parse(a.response.data) as { choices?: { message?: { content?: string } }[] };
      return { plan: parsePlan(question, body.choices?.[0]?.message?.content ?? ''), attestation: a, model };
    } catch {}
  }
  return { plan: parsePlan(question, '') };
};
