import type { Attestation } from '../airnode/client.ts';
import type { AirnodeV2Request } from '../airnode/airnode-v2.ts';
import type { EvidenceItem } from '../types.ts';

export const newsRequest = (keywords: string[], since: string, until: string): AirnodeV2Request => ({
  operation: 'news',
  parameters: {
    dateFrom: since.slice(0, 10),
    dateTo: until.slice(0, 10),
    topics: keywords.join(','),
    topic_group_by: 'or',
    displayOutput: 'abstract',
    pageSize: 15,
  },
});

interface Story {
  title?: string;
  teaser?: string;
  created?: string;
  author?: string;
  url?: string;
}

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

export const newsToEvidence = (a: Attestation, index: number, limit = 8): Omit<EvidenceItem, 'id'>[] => {
  const parsed = JSON.parse(a.response.data) as Story[] | { data?: Story[] };
  const stories = Array.isArray(parsed) ? parsed : (parsed.data ?? []);
  return stories.slice(0, limit).map((s) => ({
    attestation: index,
    kind: 'news' as const,
    at: s.created && !Number.isNaN(Date.parse(s.created)) ? new Date(s.created).toISOString() : undefined,
    author: s.author ? `Benzinga / ${s.author}` : 'Benzinga',
    text: `${s.title ?? ''}${s.teaser ? ` - ${stripHtml(s.teaser).slice(0, 300)}` : ''}`,
    url: s.url,
  }));
};
