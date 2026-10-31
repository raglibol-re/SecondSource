import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { Address, PrivateKey } from '@evolution-sdk/evolution';
import { addressFromSeed } from '@evolution-sdk/evolution/sdk/wallet/Derivation';
import { logTransaction } from '../airnode/client.ts';

// pnpm x402:wallet [--fund]
// Creates a Cardano preprod wallet for a demo buyer agent (same derivation as the Cardano Foundation's x402 template),
// writes its mnemonic to .env as BUYER_CARDANO_MNEMONIC and prints only the address. --fund asks the Masumi
// dispenser (preprod, no captcha) for test ADA.
const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
let mnemonic = /^BUYER_CARDANO_MNEMONIC=(.+)$/m.exec(env)?.[1]?.trim();
if (!mnemonic) {
  mnemonic = PrivateKey.generateMnemonic();
  appendFileSync('.env', `${env && !env.endsWith('\n') ? '\n' : ''}BUYER_CARDANO_MNEMONIC=${mnemonic}\n`);
  console.log('New buyer wallet written to .env as BUYER_CARDANO_MNEMONIC');
}
const address = Address.toBech32(addressFromSeed(mnemonic, { networkId: 0 }).address);
console.log(`Buyer address: ${address}`);

if (process.argv.includes('--fund')) {
  const res = await fetch('https://dispenser.masumi.network/submit_transaction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ network: 'testnet', receiverAddress: address, testnet_collateral: false }),
  });
  const data = (await res.json()) as { success?: boolean; transaction_id?: string; error?: string };
  if (!data.success || !data.transaction_id) throw new Error(`Dispenser refused: ${data.error ?? res.status}`);
  console.log(`Funded: https://preprod.cardanoscan.io/transaction/${data.transaction_id}`);
  logTransaction('Cardano Preprod', `https://preprod.cardanoscan.io/transaction/${data.transaction_id}`, 'Masumi dispenser: test ADA to the demo x402 buyer agent');
}
