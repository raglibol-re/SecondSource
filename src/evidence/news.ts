import type { Attestation } from '../airnode/client.ts';
import type { AirnodeV2Request } from '../airnode/airnode-v2.ts';
import type { EvidenceItem } from '../types.ts';

// News from established outlets, through two more AirnodeHub listings:
// - LunarCrush topicNews: the articles people are citing about a topic, from any outlet (Fox Business, ABC, Forbes...).
// - Finnhub market-news (general, crypto, forex, merger) and company-news for a US ticker over a date range.
// LunarCrush and Finnhub market news are current only, so they are used for recent questions.

export const NEWS_CATEGORIES = ['general', 'crypto', 'forex', 'merger'] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export const topicNewsRequest = (topic: string): AirnodeV2Request => ({ operation: 'topicNews', parameters: { topic } });
export const marketNewsRequest = (category: NewsCategory): AirnodeV2Request => ({ operation: 'market-news', parameters: { category } });
export const companyNewsRequest = (ticker: string, since: string, until: string): AirnodeV2Request => ({
  operation: 'company-news',
  parameters: { symbol: ticker, from: since.slice(0, 10), to: until.slice(0, 10) },
});

interface Row {
  at: number; // ms
  title: string;
  summary: string;
  outlet: string;
  url?: string;
}

const readRows = (a: Attestation): Row[] => {
  const j = JSON.parse(a.response.data) as unknown;
  const rows = (Array.isArray(j) ? j : ((j as { data?: unknown[] }).data ?? [])) as Record<string, unknown>[];
  return rows.map((x) => ({
    at: Number(x.datetime ?? x.post_created ?? 0) * 1000,
    title: String(x.headline ?? x.post_title ?? ''),
    summary: String(x.summary ?? x.post_description ?? ''),
    outlet: String(x.source ?? x.creator_display_name ?? x.creator_name ?? 'news'),
    url: typeof (x.url ?? x.post_link) === 'string' ? String(x.url ?? x.post_link) : undefined,
  }));
};

// Words worth matching: the keywords themselves plus their longer single words ("Binance hack" -> "binance", "hack").
export const matchTerms = (keywords: string[]) => {
  const terms = new Set<string>();
  for (const k of keywords) {
    const t = k.toLowerCase().trim();
    if (t.length > 2) terms.add(t);
    for (const w of t.split(/[\s-]+/)) if (w.length > 3) terms.add(w);
  }
  return [...terms];
};

// Stories about the claim inside the window, most relevant first.
export const outletNewsToEvidence = (a: Attestation, index: number, keywords: string[], since: string, until: string, limit = 6): Omit<EvidenceItem, 'id'>[] => {
  const terms = matchTerms(keywords);
  const t0 = Date.parse(since) - 6 * 3600_000;
  const t1 = Date.parse(until) + 3600_000;
  return readRows(a)
    .filter((r) => r.title && r.at >= t0 && r.at <= t1)
    .map((r) => ({ r, hits: terms.filter((w) => `${r.title} ${r.summary}`.toLowerCase().includes(w)).length }))
    .filter((x) => x.hits > 0)
    .sort((x, y) => y.hits - x.hits || y.r.at - x.r.at)
    .slice(0, limit)
    .map(({ r }) => ({
      attestation: index,
      kind: 'news' as const,
      at: new Date(r.at).toISOString(),
      author: r.outlet,
      text: `${r.title}${r.summary ? ` - ${r.summary.replace(/\s+/g, ' ').slice(0, 280)}` : ''}`,
      url: r.url,
    }));
};

// SEC EDGAR filings for a US ticker (an 8-K is how a listed company must disclose a material event). A government record,
// so it counts as a primary source for the company's own disclosures.
export const filingsRequest = (ticker: string, since: string, until: string): AirnodeV2Request => ({
  operation: 'filings',
  parameters: { symbol: ticker, from: since.slice(0, 10), to: until.slice(0, 10) },
});

export const filingsToEvidence = (a: Attestation, index: number, ticker: string, limit = 5): Omit<EvidenceItem, 'id'>[] => {
  const j = JSON.parse(a.response.data) as unknown;
  const rows = (Array.isArray(j) ? j : []) as Record<string, unknown>[];
  return rows.slice(0, limit).map((r) => {
    const filed = String(r.acceptedDate ?? r.filedDate ?? '');
    const t = Date.parse(filed.replace(' ', 'T') + (filed.length <= 19 ? 'Z' : ''));
    return {
      attestation: index,
      kind: 'news' as const,
      at: Number.isFinite(t) ? new Date(t).toISOString() : undefined,
      author: 'SEC EDGAR',
      text: `${ticker} filed form ${String(r.form ?? '?')} with the SEC on ${filed.slice(0, 10)}.`,
      url: typeof r.filingUrl === 'string' ? r.filingUrl : undefined,
    };
  });
};
