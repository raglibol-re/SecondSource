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

// What anyone with reach said about the claim in the window.
export const keywordRequest = (keywords: string[], since: string, until: string): AirnodeV2Request => ({
  operation: 'searchTweets',
  parameters: { query: `${keywords.join(' ')} since_time:${unix(since)} until_time:${unix(until)}`, queryType: 'Top' },
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
