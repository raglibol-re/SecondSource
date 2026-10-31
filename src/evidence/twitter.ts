import type { Attestation } from '../airnode/client.ts';
import type { AirnodeV2Request } from '../airnode/airnode-v2.ts';
import type { EvidenceItem } from '../types.ts';

const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);

export const handle = (s: string) => s.trim().replace(/^@/, '');

// What the named accounts posted in the window.
export const accountsRequest = (accounts: string[], since: string, until: string): AirnodeV2Request => ({
  operation: 'searchTweets',
  parameters: {
    query: `(${accounts.map((a) => `from:${handle(a)}`).join(' OR ')}) since_time:${unix(since)} until_time:${unix(until)}`,
    queryType: 'Latest',
  },
});

const term = (k: string) => (/\s/.test(k.trim()) ? `"${k.trim().replace(/"/g, '')}"` : k.trim());

// What anyone with reach said about the claim in the window. The first keyword (the name) must match, any of the
// others may: requiring every word missed real coverage ("Binance hack $6.3B North Korea" matched almost nothing).
export const keywordQuery = (keywords: string[]) => {
  const [first, ...rest] = keywords.filter((k) => k.trim()).map(term);
  if (!first) return '';
  return rest.length ? `${first} (${rest.join(' OR ')})` : first;
};

export const keywordRequest = (keywords: string[], since: string, until: string): AirnodeV2Request => ({
  operation: 'searchTweets',
  parameters: { query: `${keywordQuery(keywords)} since_time:${unix(since)} until_time:${unix(until)}`, queryType: 'Top' },
});

// What the primary accounts said about the topic, over the whole window (their latest posts may be about other things).
export const accountsTopicRequest = (accounts: string[], keywords: string[], since: string, until: string): AirnodeV2Request => ({
  operation: 'searchTweets',
  parameters: {
    query: `(${accounts.map((a) => `from:${handle(a)}`).join(' OR ')}) (${keywords.map(term).join(' OR ')}) since_time:${unix(since)} until_time:${unix(until)}`,
    queryType: 'Latest',
  },
});

interface Tweet {
  id?: string;
  url?: string;
  text?: string;
  createdAt?: string;
  author?: { userName?: string };
}

export const tweetsToEvidence = (a: Attestation, index: number, limit = 8): Omit<EvidenceItem, 'id'>[] => {
  const body = JSON.parse(a.response.data) as { tweets?: Tweet[] };
  return (body.tweets ?? []).slice(0, limit).map((t) => ({
    attestation: index,
    kind: 'tweet' as const,
    at: t.createdAt && !Number.isNaN(Date.parse(t.createdAt)) ? new Date(t.createdAt).toISOString() : undefined,
    author: t.author?.userName ? `@${t.author.userName}` : undefined,
    text: (t.text ?? '').replace(/\s+/g, ' ').slice(0, 400),
    url: t.url ?? (t.id && t.author?.userName ? `https://x.com/${t.author.userName}/status/${t.id}` : undefined),
  }));
};
