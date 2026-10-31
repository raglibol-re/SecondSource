import type { Attestation } from '../airnode/client.ts';
import type { AirnodeV2Request } from '../airnode/airnode-v2.ts';
import type { EvidenceItem } from '../types.ts';

// Benzinga's topics filter is unreliable for this use (on 7 April 2025 "Hassett" matched nothing and "tariff" returned
// the unfiltered feed), so buy the day's newswire and pick the relevant stories locally. The whole page stays signed.
export const newsRequest = (since: string, until: string): AirnodeV2Request => ({
  operation: 'news',
  parameters: { dateFrom: since.slice(0, 10), dateTo: until.slice(0, 10), displayOutput: 'abstract', pageSize: 100 },
});

interface Story {
  title?: string;
  teaser?: string;
  created?: string;
  author?: string;
  url?: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string) =>
  s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m)
  );
const stripHtml = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// Stories inside the window or mentioning a keyword, keyword matches first, newest last.
export const newsToEvidence = (a: Attestation, index: number, keywords: string[], since: string, until: string, limit = 8): Omit<EvidenceItem, 'id'>[] => {
  const parsed = JSON.parse(a.response.data) as Story[] | { data?: Story[] };
  const stories = Array.isArray(parsed) ? parsed : (parsed.data ?? []);
  const words = keywords.map((k) => k.toLowerCase().replace(/[^a-z0-9-]/g, '')).filter((k) => k.length > 2);
  const t0 = Date.parse(since), t1 = Date.parse(until);
  const scored = stories
    .map((s) => {
      const t = s.created ? Date.parse(s.created) : NaN;
      const text = `${s.title ?? ''} ${s.teaser ?? ''}`.toLowerCase();
      const hits = words.filter((w) => text.includes(w)).length;
      const inWindow = t >= t0 && t <= t1;
      return { s, t, score: hits * 2 + (inWindow ? 1 : 0) };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score || x.t - y.t)
    .slice(0, limit);
  return scored.map(({ s, t }) => ({
    attestation: index,
    kind: 'news' as const,
    at: Number.isNaN(t) ? undefined : new Date(t).toISOString(),
    author: s.author ? `Benzinga / ${s.author}` : 'Benzinga',
    text: `${decode(s.title ?? '')}${s.teaser ? ` - ${stripHtml(s.teaser).slice(0, 300)}` : ''}`,
    url: s.url,
  }));
};
