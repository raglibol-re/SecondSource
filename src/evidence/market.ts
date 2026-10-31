import type { Attestation } from '../airnode/client.ts';
import type { AirnodeV2Request } from '../airnode/airnode-v2.ts';
import type { EvidenceItem } from '../types.ts';

export const parseAsset = (asset: string) => {
  const slash = asset.indexOf('/');
  if (slash < 1) throw new Error(`asset must look like "indices/US30", got "${asset}"`);
  return { assetClass: asset.slice(0, slash), symbol: asset.slice(slash + 1) };
};

// TickerLayer keeps 5-minute bars only for recent days; older history comes in hourly bars (checked on the US30 bars
// for 7 April 2025, which have hourly but no minute data).
export const barsRequest = (asset: string, since: string, until: string, now = Date.now()): AirnodeV2Request => {
  const old = now - Date.parse(since) > 3 * 86_400_000;
  return {
    operation: 'aggregates',
    parameters: { ...parseAsset(asset), multiplier: old ? 1 : 5, timespan: old ? 'hour' : 'minute', from: since.slice(0, 10), to: until.slice(0, 10) },
  };
};

// TickerLayer bar fields are not pinned in the spec beyond `results: array`, so accept the usual spellings.
interface RawBar {
  t?: number;
  timestamp?: number;
  o?: number;
  h?: number;
  c?: number;
  open?: number;
  high?: number;
  close?: number;
}

export interface Bar {
  t: number;
  o: number;
  h: number;
  c: number;
}

export const readBars = (a: Attestation): { symbol: string; bars: Bar[] } => {
  const body = JSON.parse(a.response.data) as { symbol?: string; results?: RawBar[] };
  const bars = (body.results ?? [])
    .map((b) => {
      const t = b.t ?? b.timestamp ?? 0;
      const c = b.c ?? b.close ?? NaN;
      return { t: t < 1e12 ? t * 1000 : t, o: b.o ?? b.open ?? c, c, h: b.h ?? b.high ?? c };
    })
    .filter((b) => Number.isFinite(b.c))
    .sort((x, y) => x.t - y.t);
  return { symbol: body.symbol ?? 'asset', bars };
};

const iso = (t: number) => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const round = (x: number) => Math.round(x * 100) / 100;

// One line for the judge: the level when the headline hit, how far the market ran after it, and where it ended up.
export const barsToEvidence = (a: Attestation, index: number, publishedAt: string, since: string, until: string): Omit<EvidenceItem, 'id'>[] => {
  const { symbol, bars: all } = readBars(a);
  const tp = Date.parse(publishedAt);
  const span = all.length > 1 ? all[1]!.t - all[0]!.t : 0;
  // Keep the bar that was already open when the window started.
  const bars = all.filter((b) => b.t + span > Date.parse(since) && b.t <= Date.parse(until));
  if (bars.length === 0) return [{ attestation: index, kind: 'market', author: `TickerLayer ${symbol}`, text: `${symbol}: no bars in the window` }];
  // The bar the headline landed in; its open is the last level before the headline.
  const hit = [...bars].reverse().find((b) => b.t <= tp) ?? bars[0]!;
  const base = hit.o;
  const after = bars.filter((b) => b.t >= hit.t);
  const peak = after.reduce((m, b) => (b.h > m.h ? b : m), hit);
  const last = bars[bars.length - 1]!;
  const pct = (x: number) => `${x >= base ? '+' : ''}${(((x - base) / base) * 100).toFixed(2)}%`;
  const minutes = Math.round(span / 60_000);
  return [
    {
      attestation: index,
      kind: 'market',
      at: new Date(hit.t).toISOString(),
      author: `TickerLayer ${symbol}`,
      text: `${symbol} (${minutes}-minute bars): ${round(base)} when the bar containing the headline opened at ${iso(hit.t)}; high ${round(peak.h)} in the bar from ${iso(peak.t)} (${pct(peak.h)}); ${round(last.c)} at the close of the last bar in the window (${pct(last.c)}).`,
    },
  ];
};
