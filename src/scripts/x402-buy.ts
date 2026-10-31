import { parseArgs } from 'node:util';
import { toClientCardanoSigner } from '@x402/cardano';
import { ExactCardanoScheme } from '@x402/cardano/exact/client';
import { wrapFetchWithPayment, x402Client, x402HTTPClient } from '@x402/fetch';
import { logTransaction } from '../airnode/client.ts';
import type { CheckResult } from '../types.ts';

// pnpm x402:buy "headline" [--asset indices/US30] [--at ISO] [--url https://secondsource-two.vercel.app]
// An outside agent hiring SecondSource with no account and no key: it calls the paid endpoint, gets HTTP 402, pays
// 2 tADA on Cardano preprod over x402 and receives the signed check. Follows the Cardano Foundation's x402 buyer.
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { asset: { type: 'string' }, at: { type: 'string' }, url: { type: 'string', default: 'https://secondsource-two.vercel.app' } },
});
const headline = positionals.join(' ');
const mnemonic = process.env.BUYER_CARDANO_MNEMONIC;
const projectId = process.env.BLOCKFROST_API_KEY_PREPROD;
if (!headline || !mnemonic || !projectId) throw new Error('Usage: pnpm x402:buy "headline"; needs BUYER_CARDANO_MNEMONIC (pnpm x402:wallet) and BLOCKFROST_API_KEY_PREPROD in .env');

// lovelace is not USD-pegged, so spend controls must allow it explicitly; cap each payment at 3 tADA.
const client = new x402Client().setSpendControls({ allowedAssets: [{ network: 'cardano:*', asset: 'lovelace', maxAmountPerPayment: '3000000' }] });
const signer = toClientCardanoSigner({
  mnemonic,
  network: 'cardano:preprod',
  provider: { blockfrost: { baseUrl: 'https://cardano-preprod.blockfrost.io/api/v0', projectId } },
});
client.register('cardano:*', new ExactCardanoScheme(signer));
console.log(`Buyer agent wallet: ${signer.getAddress()}`);

const url = `${values.url}/api/x402/check`;
const body = JSON.stringify({ headline, asset: values.asset, publishedAt: values.at });
const plain = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
console.log(`Unpaid request: HTTP ${plain.status}${plain.status === 402 ? ' Payment Required' : ''}`);
if (plain.status !== 402) {
  console.log(await plain.text());
  process.exit(1);
}

console.log('Paying 2 tADA over x402 on Cardano preprod and retrying (20 to 90 seconds)...');
const started = Date.now();
const res = await wrapFetchWithPayment(fetch, client)(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
console.log(`HTTP ${res.status} after ${((Date.now() - started) / 1000).toFixed(0)}s`);
if (!res.ok) {
  console.log(await res.text());
  process.exit(1);
}
const result = (await res.json()) as CheckResult;
const receipt = new x402HTTPClient(client).getPaymentSettleResponse((name) => res.headers.get(name));
console.log(`\n${result.verdict} (${Math.round(result.confidence * 100)}%): ${result.reasoning}`);
console.log(`${result.attestations.length} signed attestations, resultHash ${result.resultHash}`);
if (receipt?.transaction) {
  console.log(`Paid: https://preprod.cardanoscan.io/transaction/${receipt.transaction}`);
  logTransaction('Cardano Preprod', `https://preprod.cardanoscan.io/transaction/${receipt.transaction}`, `x402 payment (2 tADA) from a buyer agent for a SecondSource check: ${result.verdict}`);
}
