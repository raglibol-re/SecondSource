import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { logTransaction } from '../airnode/client.ts';

// pnpm masumi:payout: for each paid Sokosumi task in masumi/sokosumi.json, asks the Masumi Payment Service for the escrow
// state and records the seller's withdrawal (payout) transaction once the funds were collected.
const MPS = process.env.MPS_URL;
const token = process.env.MPS_ADMIN_KEY ?? process.env.MPS_RUNTIME_TOKEN;
if (!MPS || !token) throw new Error('Set MPS_URL and MPS_ADMIN_KEY in .env');

const file = 'masumi/sokosumi.json';
const s = JSON.parse(readFileSync(file, 'utf8'));
for (const t of [s.paidTask, ...(s.earlierPaidTasks ?? [])].filter(Boolean)) {
  const journal = `.local/tasks/${t.id}.json`;
  if (!existsSync(journal)) continue;
  const j = JSON.parse(readFileSync(journal, 'utf8'));
  const res = await fetch(`${MPS}/api/v1/payment/resolve-blockchain-identifier`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', token },
    body: JSON.stringify({ network: 'Preprod', blockchainIdentifier: j.paid.payment.blockchainIdentifier, includeHistory: 'true' }),
  });
  const p = ((await res.json()) as { data: any }).data;
  const txs = [p.CurrentTransaction, ...(p.TransactionHistory ?? [])].filter(Boolean);
  const w = txs.find((x: any) => x.newOnChainState === 'Withdrawn' && x.status === 'Confirmed');
  const already = t.payout?.withdrawnTx === w?.txHash;
  t.payout = { state: p.onChainState, withdrawnTx: w?.txHash ?? null };
  if (w?.txHash && !already) {
    logTransaction('Cardano Preprod', `https://preprod.cardanoscan.io/transaction/${w.txHash}`, `Masumi escrow Withdrawn: SecondSource collected 1 tUSDM for Task ${t.id}`);
  }
  console.log(`${t.id}: ${p.onChainState}${w?.txHash ? `, payout https://preprod.cardanoscan.io/transaction/${w.txHash}` : ''}`);
}
writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
