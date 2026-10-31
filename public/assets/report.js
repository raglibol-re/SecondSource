// Renders a SecondSource check result: the verdict stamp, the reasoning, a receipt per bought answer, and the evidence.
const SOURCE_NAMES = {
  twitter: 'TwitterAPI.io',
  benzinga: 'Benzinga',
  tickerlayer: 'TickerLayer',
  openrouter: 'OpenRouter',
  nodary: 'Nodary',
};
const PRICES = { twitter: 0.01, benzinga: 0.01, tickerlayer: 0.05, openrouter: 0.05, nodary: 0 };

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const short = (h) => (h && h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-6)}` : (h ?? ''));
const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
};
const signedAt = (a) => (a?.response?.timestamp ? fmtTime(new Date(Number(a.response.timestamp) * 1000).toISOString()) : '');

export const receiptHtml = (step, attestation, state = step.status) => {
  const name = SOURCE_NAMES[step.source] ?? step.source;
  const price = PRICES[step.source] ?? 0;
  const sub = [];
  if (state === 'pending') sub.push('Buying and checking the signature');
  if (attestation) {
    sub.push(`Signed by <span class="mono" title="${esc(attestation.response.airnode)}">${esc(short(attestation.response.airnode))}</span>, ${esc(signedAt(attestation))}`);
    sub.push('Signature checked');
    if (attestation.paymentTx) sub.push(`<a href="https://sepolia.basescan.org/tx/${esc(attestation.paymentTx)}" target="_blank" rel="noopener">Payment on Base Sepolia</a>`);
  }
  if (step.error) sub.push(`<span style="color: var(--deny)">${esc(step.error)}</span>`);
  const raw = attestation
    ? `<details><summary class="small">Show the signed response</summary><pre>${esc(JSON.stringify({ request: attestation.request, response: attestation.response }, null, 2))}</pre></details>`
    : '';
  return `<li class="receipt ${state}">
    <span class="tick" aria-hidden="true">${state === 'failed' ? '!' : state === 'pending' ? '' : '✓'}</span>
    <span class="what">${esc(name)}: ${esc(step.label)}</span>
    <span class="price">${state === 'failed' ? 'not charged' : price ? `${price.toFixed(2)} aUSD` : 'free'}</span>
    <span class="sub">${sub.join('<span aria-hidden="true"></span>')}</span>
    ${raw}
  </li>`;
};

export const stampHtml = (verdict, animate) =>
  `<div class="stamp ${verdict.toLowerCase()} ${animate ? 'animate' : ''}" role="img" aria-label="Verdict: ${esc(verdict.toLowerCase())}">${esc(verdict)}</div>`;

export const renderReport = (el, r, { animate = true, receipts = true } = {}) => {
  const cited = new Set(r.citations ?? []);
  const evidence = (r.evidence ?? [])
    .slice()
    .sort((a, b) => Number(cited.has(b.id)) - Number(cited.has(a.id)))
    .map(
      (e) => `<li class="${cited.has(e.id) ? 'cited' : ''}">
        <span class="eid">${esc(e.id)}</span>${esc(e.text)}
        <span class="src">${esc(e.author ?? e.kind)}${e.at ? `, ${esc(fmtTime(e.at))}` : ''}${e.url ? `, <a href="${esc(e.url)}" target="_blank" rel="noopener">original</a>` : ''}${cited.has(e.id) ? ', cited by the judge' : ''}</span>
      </li>`
    )
    .join('');
  el.innerHTML = `
    <div class="report-head">
      <p class="muted small" style="margin-bottom: 6px">Headline checked${r.input?.publishedAt ? `, as of ${esc(fmtTime(r.input.publishedAt))}` : ''}</p>
      <p class="claim">${esc(r.input?.headline)}</p>
      ${stampHtml(r.verdict, animate)}
    </div>
    <p class="reasoning">${esc(r.reasoning)}</p>
    <div class="meta">
      <span>Confidence <b>${Math.round((r.confidence ?? 0) * 100)}%</b></span>
      <span>Signed answers <b>${r.attestations?.length ?? 0}</b></span>
      <span>Evidence cost <b>${esc(r.costAusd)} aUSD</b></span>
      ${r.judge ? `<span>Judge <b>${esc(r.judge.model)}</b></span>` : ''}
      ${r.resultHash ? `<span>Result hash <b class="mono" title="${esc(r.resultHash)}">${esc(short(r.resultHash))}</b></span>` : ''}
    </div>
    ${receipts ? `<h3 style="margin-bottom: 8px">Receipts</h3>
    <ul class="receipts">${(r.steps ?? []).map((s) => receiptHtml(s, s.attestation !== undefined ? r.attestations[s.attestation] : undefined)).join('')}</ul>` : ''}
    <h3 style="margin-bottom: 12px">Evidence the judge saw</h3>
    ${evidence ? `<ul class="evidence">${evidence}</ul>` : '<p class="muted">No evidence came back in the time window.</p>'}
    <div class="actions">
      <button class="btn secondary small" type="button" data-download>Download the full result</button>
      <a class="btn secondary small" href="/verify">Verify these receipts</a>
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
