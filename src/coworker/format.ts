import type { CheckInput, CheckResult } from '../types.ts';

const SITE = process.env.SITE_URL ?? 'https://secondsource-two.vercel.app';

// A Sokosumi Task carries a name and a free-text description. Accept either JSON
// ({"headline": "...", "asset": "indices/US30", ...}) or plain text: the headline on the first line, then optional
// "source: handle", "asset: indices/US30", "at: 2025-04-07T14:12:00Z" and "keywords: a, b" lines.
export const parseTaskInput = (description: string | null, name = ''): CheckInput => {
  const text = (description ?? '').trim();
  if (text.startsWith('{')) {
    const j = JSON.parse(text) as Partial<CheckInput>;
    if (typeof j.headline !== 'string' || !j.headline.trim()) throw new Error('The JSON brief needs a "headline" string');
    return {
      headline: j.headline.trim(),
      claimedSource: j.claimedSource,
      asset: j.asset,
      publishedAt: j.publishedAt,
      keywords: Array.isArray(j.keywords) ? j.keywords : undefined,
    };
  }
  const input: CheckInput = { headline: '' };
  const rest: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(source|attributed to|asset|market|at|time|published|keywords)\s*:\s*(.+)$/i.exec(line);
    if (!m) {
      rest.push(line);
      continue;
    }
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'source' || key === 'attributed to') input.claimedSource = value;
    else if (key === 'asset' || key === 'market') input.asset = value;
    else if (key === 'keywords') input.keywords = value.split(',').map((k) => k.trim()).filter(Boolean);
    else input.publishedAt = value;
  }
  input.headline = (rest[0] ?? name).replace(/^headline\s*:\s*/i, '').replace(/^["“]|["”]$/g, '').trim();
  if (input.headline.length < 8) throw new Error('Put the headline on the first line of the Task description');
  return input;
};

// What the buyer reads in Sokosumi: verdict first, then why, then the receipts.
export const formatResult = (r: CheckResult): string => {
  const cited = r.citations.map((id) => r.evidence.find((e) => e.id === id)).filter((e) => e !== undefined);
  const lines = [
    `VERDICT: ${r.verdict} (confidence ${Math.round(r.confidence * 100)}%)`,
    `Headline: ${r.input.headline}`,
    '',
    r.reasoning,
    '',
  ];
  if (cited.length) {
    lines.push('Cited evidence:');
    for (const e of cited) lines.push(`- [${e.id}] ${e.author ?? e.kind}${e.at ? `, ${e.at}` : ''}: ${e.text}${e.url ? ` (${e.url})` : ''}`);
    lines.push('');
  }
  lines.push(`Receipts (${r.attestations.length} signed answers, ${r.costAusd} aUSD paid over x402):`);
  for (const s of r.steps) {
    const a = s.attestation !== undefined ? r.attestations[s.attestation] : undefined;
    lines.push(
      `- ${s.status === 'ok' ? 'OK' : 'FAILED'} ${s.label}${a ? `, signed by ${a.response.airnode} at ${new Date(Number(a.response.timestamp) * 1000).toISOString()}` : ''}${a?.paymentTx ? `, paid https://sepolia.basescan.org/tx/${a.paymentTx}` : ''}${s.error ? `, ${s.error}` : ''}`
    );
  }
  lines.push('', `Result hash: ${r.resultHash}`, `Verify any receipt: ${SITE}/verify`);
  return lines.join('\n');
};
