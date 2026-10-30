import type { Attestation } from '../airnode/client.ts';
import type { AirnodeV2Request } from '../airnode/airnode-v2.ts';
import type { EvidenceItem } from '../types.ts';

export const parseAsset = (asset: string) => {
  const slash = asset.indexOf('/');
  if (slash < 1) throw new Error(`asset must look like "indices/US30", got "${asset}"`);
  return { assetClass: asset.slice(0, slash), symbol: asset.slice(slash + 1) };
};

export const barsRequest = (asset: string, since: string, until: string): AirnodeV2Request => ({
  operation: 'aggregates',
  parameters: { ...parseAsset(asset), multiplier: 5, timespan: 'minute', from: since.slice(0, 10), to: until.slice(0, 10) },
});

// TickerLayer bar fields are not pinned in the spec beyond `results: array`, so accept the usual spellings.
interface RawBar {
  t?: number;
  timestamp?: number;
  h?: number;
  c?: number;
  high?: number;
  close?: number;
}

export interface Bar {
  t: number;
  h: number;
  c: number;
}

export const readBars = (a: Attestation): { symbol: string; bars: Bar[] } => {
  const body = JSON.parse(a.response.data) as { symbol?: string; results?: RawBar[] };
  const bars = (body.results ?? [])
    .map((b) => {
      const t = b.t ?? b.timestamp ?? 0;
      const c = b.c ?? b.close;
      return { t: t < 1e12 ? t * 1000 : t, c: c ?? NaN, h: b.h ?? b.high ?? c ?? NaN };
    })
    .filter((b) => Number.isFinite(b.c))
    .sort((x, y) => x.t - y.t);
  return { symbol: body.symbol ?? 'asset', bars };
};

const iso = (t: number) => new Date(t).toISOString();

export const barsToEvidence = (
  a: Attestation,
  index: number,
  publishedAt: string,
  since: string,
  until: string
): Omit<EvidenceItem, 'id'>[] => {
  const { symbol, bars: all } = readBars(a);
  const tp = Date.parse(publishedAt);
  const bars = all.filter((b) => b.t >= Date.parse(since) && b.t <= Date.parse(until));
  if (bars.length === 0) return [{ attestation: index, kind: 'market', author: `TickerLayer ${symbol}`, text: `${symbol}: no bars in the window` }];
  const before = [...bars].reverse().find((b) => b.t <= tp) ?? bars[0]!;
  const after = bars.filter((b) => b.t >= tp);
  const peak = after.reduce((m, b) => (b.h > m.h ? b : m), before);
  const last = bars[bars.length - 1]!;
  const pct = (x: number) => `${(((x - before.c) / before.c) * 100).toFixed(2)}%`;
  return [
    {
      attestation: index,
      kind: 'market',
      at: iso(before.t),
      author: `TickerLayer ${symbol}`,
      text: `${symbol}: ${before.c} at ${iso(before.t)} (before headline); high after headline ${peak.h} at ${iso(peak.t)} (${pct(peak.h)}); last ${last.c} at ${iso(last.t)} (${pct(last.c)}).`,
    },
  ];
};
