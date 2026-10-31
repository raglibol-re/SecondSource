// Renders a SecondSource result: verdict stamp, the reasoning, the cited posts as cards, and one quiet line per receipt.
const SOURCE_NAMES = {
  twitter: 'TwitterAPI.io',
  benzinga: 'Benzinga',
  tickerlayer: 'TickerLayer',
  openrouter: 'OpenRouter',
  nodary: 'Nodary',
  lunarcrush: 'LunarCrush',
  finnhub: 'Finnhub',
};
const PRICES = { twitter: 0.01, benzinga: 0.01, tickerlayer: 0.05, openrouter: 0.05, nodary: 0, lunarcrush: 0.02, finnhub: 0.01 };

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const short = (h) => (h && h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-6)}` : (h ?? ''));
const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
};
const hhmm = (iso) => (iso ? new Date(iso).toISOString().slice(11, 16) + ' UTC' : '');
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

// Short, human labels for the steps, so a receipt reads as one line.
const shortLabel = (step) =>
  step.label
    .replace(/^Posts by /, 'Posts by ')
    .replace(/^Top posts about /, 'Search ')
    .replace(/^What (.+) said about it$/, '$1 on the topic')
    .replace(/^News outlets on "(.+)" \(LunarCrush\)$/, 'Newsrooms on “$1”')
    .replace(/^Finnhub (\w+) market news$/, '$1 market news')
    .replace(/^Benzinga newswire, /, 'Newswire ')
    .replace(/^Market: (\S+) price bars$/, 'Prices $1')
    .replace(/^Judge: .*/, 'Judgment')
    .replace(/^Plan: .*/, 'Plan');
const failReason = (err = '') => (/403|502|unavailable/i.test(err) ? 'model unavailable, not charged' : 'failed, not charged');

export const receiptHtml = (step, attestation, state = step.status) => {
  const name = SOURCE_NAMES[step.source] ?? step.source;
  const price = PRICES[step.source] ?? 0;
  const right =
    state === 'failed'
      ? `<span class="rc-note">${esc(failReason(step.error))}</span>`
      : state === 'pending'
        ? '<span class="rc-note">working…</span>'
        : attestation?.paymentTx
          ? `<a class="rc-pay" href="https://sepolia.basescan.org/tx/${esc(attestation.paymentTx)}" target="_blank" rel="noopener" title="x402 payment on Base Sepolia">${price.toFixed(2)} aUSD</a>`
          : `<span class="rc-note">${price ? `${price.toFixed(2)} aUSD` : 'free'}</span>`;
  const details = attestation
    ? `<details class="rc-more"><summary>signed by ${esc(short(attestation.response.airnode))}</summary><pre>${esc(JSON.stringify({ request: attestation.request, response: attestation.response }, null, 2))}</pre></details>`
    : '';
  return `<li class="rc ${state}">
    <span class="rc-dot" aria-hidden="true"></span>
    <span class="rc-src">${esc(name)}</span>
    <span class="rc-what" title="${esc(step.label)}">${esc(shortLabel(step))}</span>
    ${right}
    ${details}
  </li>`;
};

export const stampHtml = (verdict, animate) =>
  `<div class="stamp ${verdict.toLowerCase()} ${animate ? 'animate' : ''}" role="img" aria-label="Verdict: ${esc(verdict.toLowerCase())}">${esc(verdict)}</div>`;

// A cited post, drawn like the post it is, with the Airnode that signed it.
export const postCard = (e, attestation) => `<article class="post">
    <header><b>${esc(e.author ?? e.kind)}</b><time>${esc(hhmm(e.at))}${e.at ? `, ${esc(day(e.at))}` : ''}</time></header>
    <p>${esc(e.text.replace(/\s*https:\/\/t\.co\/\S+/g, ''))}</p>
    <footer><span class="seal-line">Signed by the ${esc(SOURCE_NAMES[attestation?.source] ?? 'source')} Airnode</span>${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">original</a>` : ''}</footer>
  </article>`;

const tally = (ev = []) => {
  const n = (k) => ev.filter((e) => e.kind === k).length;
  const parts = [[n('tweet'), 'post'], [n('news'), 'news story', 'news stories']].filter(([c]) => c).map(([c, one, many]) => `${c} ${c === 1 ? one : (many ?? one + 's')}`);
  return parts.length ? `${parts.join(' and ')} read, ` : '';
};

export const renderReport = (el, r, { animate = true, receipts = true } = {}) => {
  const cited = (r.citations ?? []).map((id) => r.evidence.find((e) => e.id === id)).filter(Boolean);
  const citedIds = new Set(cited.map((e) => e.id));
  const rest = (r.evidence ?? []).filter((e) => !citedIds.has(e.id));
  el.innerHTML = `
    <div class="verdict v-${esc((r.verdict ?? '').toLowerCase())}">
      <div class="verdict-head">
        <p class="eyeline">${(r.input?.lookbackHours ?? 0) > 6 ? `Checked ${esc(fmtTime(r.checkedAt ?? r.input.publishedAt))}, looking back ${r.input.lookbackHours >= 48 ? `${Math.round(r.input.lookbackHours / 24)} days` : `${r.input.lookbackHours} hours`}` : r.input?.publishedAt ? `As of ${esc(fmtTime(r.input.publishedAt))}` : 'Checked now'}</p>
        <p class="claim">${esc(r.input?.headline)}</p>
        ${stampHtml(r.verdict, animate)}
      </div>
      <p class="reasoning">${esc(r.reasoning)}</p>
      ${cited.length ? `<div class="posts">${cited.slice(0, 6).map((e) => postCard(e, r.attestations[e.attestation])).join('')}</div>` : ''}
      ${cited.length > 6 ? `<details class="more"><summary>${cited.length - 6} more cited sources</summary><div class="posts" style="margin-top: 10px">${cited.slice(6).map((e) => postCard(e, r.attestations[e.attestation])).join('')}</div></details>` : ''}
      <div class="confidence"><span class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round((r.confidence ?? 0) * 100)}" aria-label="Confidence"><span style="--w:${Math.round((r.confidence ?? 0) * 100)}%"></span></span><b>${Math.round((r.confidence ?? 0) * 100)}%</b> confidence</div>
      <p class="meta small">${tally(r.evidence)}${r.attestations?.length ?? 0} signed answers, ${esc(r.costAusd)} aUSD of evidence${r.judge ? `, judged by ${esc(r.judge.model)}` : ''}.</p>
      ${receipts ? `<ul class="rcs">${(r.steps ?? []).map((s) => receiptHtml(s, s.attestation !== undefined ? r.attestations[s.attestation] : undefined)).join('')}</ul>` : ''}
      ${rest.length ? `<details class="more"><summary>All ${rest.length} other evidence lines</summary><ul class="evidence">${rest.map((e) => `<li><span class="src">${esc(e.author ?? e.kind)}${e.at ? `, ${esc(fmtTime(e.at))}` : ''}</span>${esc(e.text)}</li>`).join('')}</ul></details>` : ''}
      <div class="verdict-actions">
        <a href="/verify">Verify the signatures</a>
        <button type="button" class="linklike" data-download>Download the result</button>
        ${r.resultHash ? `<span class="mono small muted" title="${esc(r.resultHash)}">${esc(short(r.resultHash))}</span>` : ''}
      </div>
    </div>`;
  el.querySelector('[data-download]').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `secondsource-${r.verdict.toLowerCase()}-${(r.checkedAt ?? '').slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  try {
    sessionStorage.setItem('secondsource:last', JSON.stringify(r));
  } catch {}
};
