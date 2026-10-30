// Registers SecondSource in the Masumi registry on Preprod through a local Masumi Payment Service (MPS).
// Ported from masumi-network/demo-agent-token2049 (live-demo-name-finder, payment-registration.mjs).
//
//   pnpm masumi register   one Standard, Dynamic-priced registration (needs MPS_ADMIN_KEY, MPS_WALLET_ID, MPS_SOURCE_ID)
//   pnpm masumi status     refresh masumi/registration.json from the registry; RegistrationConfirmed enables paid Tasks
//   pnpm masumi key        create a runtime key scoped to Preprod and the seller wallet; prints where it was saved
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { logTransaction } from '../airnode/client.ts';
import { REGISTRATION_FILE } from './paid.ts';

const MPS = process.env.MPS_URL;
const ADMIN = process.env.MPS_ADMIN_KEY;
if (!MPS || !ADMIN) throw new Error('Set MPS_URL and MPS_ADMIN_KEY in .env');
mkdirSync('masumi', { recursive: true });
type State = Record<string, any>;
const state: State = existsSync(REGISTRATION_FILE) ? JSON.parse(readFileSync(REGISTRATION_FILE, 'utf8')) : {};
const save = () => writeFileSync(REGISTRATION_FILE, JSON.stringify(state, null, 2) + '\n');

const request = async (path: string, body?: unknown) => {
  const r = await fetch(`${MPS}/api/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { token: ADMIN, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const j = (await r.json()) as { status?: string; data?: any; error?: unknown };
  if (!r.ok || j.status !== 'success') throw new Error(`${path} answered ${r.status}: ${JSON.stringify(j.error ?? j).slice(0, 300)}`);
  return j.data;
};

const findById = (x: unknown, id: string): any => {
  if (Array.isArray(x)) {
    for (const y of x) {
      const r = findById(y, id);
      if (r) return r;
    }
  } else if (x && typeof x === 'object') {
    if ((x as { id?: string }).id === id) return x;
    for (const y of Object.values(x)) {
      const r = findById(y, id);
      if (r) return r;
    }
  }
  return undefined;
};

const cmd = process.argv[2];
if (cmd === 'ids') {
  // Lists the seeded Preprod V2 payment sources and their selling wallets, so MPS_SOURCE_ID and MPS_WALLET_ID can be set.
  const { ExtendedPaymentSources: sources } = (await request('/payment-source-extended?take=100')) as { ExtendedPaymentSources: any[] };
  for (const s of sources.filter((x) => x.network === 'Preprod' && x.paymentSourceType === 'Web3CardanoV2')) {
    console.log(`MPS_SOURCE_ID=${s.id}   # ${s.paymentSourceType} ${s.smartContractAddress}`);
    const { Wallets } = (await request(`/wallet/list?take=100&paymentSourceId=${s.id}`)) as { Wallets: any[] };
    for (const w of Wallets) {
      const line = `${w.type} wallet ${w.walletAddress}`;
      console.log(w.type === 'Selling' ? `MPS_WALLET_ID=${w.id}   # ${line} (fund with test ADA)` : `# ${line}`);
    }
  }
  process.exit(0);
}
if (cmd === 'key') {
  if (state.runtimeKeyId) {
    console.log(`Runtime key already created: ${state.runtimeKeyId}`);
    process.exit(0);
  }
  const walletId = process.env.MPS_WALLET_ID;
  if (!walletId) throw new Error('Set MPS_WALLET_ID (the selling hot wallet id from the MPS admin)');
  const key = await request('/api-key', {
    usageLimited: 'false', UsageCredits: [], NetworkLimit: ['Preprod'], ChainIdLimit: [],
    canRead: true, canPay: true, canAdmin: false,
    walletScopeEnabled: true, WalletScopeHotWalletIds: [walletId], x402WalletScopeEnabled: true, X402WalletScopeEvmWalletIds: [],
  });
  state.runtimeKeyId = key.id;
  save();
  if (typeof key.token !== 'string' || key.token.startsWith('*****')) throw new Error('MPS did not reveal the new token; key id saved');
  appendFileSync('.env', `\nMPS_RUNTIME_TOKEN=${key.token}\n`);
  console.log(`Runtime key ${key.id} created and written to .env as MPS_RUNTIME_TOKEN`);
} else if (cmd === 'register') {
  if (state.registrationId) {
    console.log(`Already registered: ${state.registrationId}`);
    process.exit(0);
  }
  if (state.registrationWritePending) throw new Error('A previous registration write is uncertain. Inspect the registry before retrying.');
  const walletId = process.env.MPS_WALLET_ID, sourceId = process.env.MPS_SOURCE_ID;
  if (!walletId || !sourceId) throw new Error('Set MPS_WALLET_ID and MPS_SOURCE_ID from the MPS admin');
  const wallet = await request(`/wallet?walletType=Selling&id=${walletId}`);
  const source = findById(await request('/payment-source?take=100'), sourceId);
  if (!source) throw new Error('Payment source not found');
  const body = {
    network: 'Preprod',
    type: 'Standard',
    sellingWalletVkey: wallet.walletVkey,
    supportedPaymentSources: [{ chain: 'Cardano', network: 'Preprod', paymentSourceType: 'Web3CardanoV2', address: source.smartContractAddress, pricing: { pricingType: 'Dynamic' } }],
    ExampleOutputs: [],
    Tags: ['fact-check', 'trading', 'news', 'signed-data', 'api3'],
    name: 'SecondSource',
    description: 'Checks a market headline against signed primary sources (X posts, Benzinga, market data via API3 AirnodeHub) and returns CONFIRMED, UNCONFIRMED or DENIED with a signed receipt for every step.',
    Capability: { name: 'secondsource-check', version: '1' },
    Author: { name: 'SecondSource team' },
    apiBaseUrl: process.env.AGENT_API_URL ?? 'http://127.0.0.1:3013',
  };
  state.walletId = walletId;
  state.sellerAddress = wallet.walletAddress;
  state.registrationWritePending = true;
  state.request = body;
  save();
  const r = await request('/registry', body);
  Object.assign(state, { registrationId: r.id, registrationWritePending: false, registration: r });
  save();
  console.log(`Registration submitted: ${r.id}. Run "pnpm masumi status" until it is RegistrationConfirmed.`);
} else {
  if (!state.registrationId) throw new Error('Nothing registered yet');
  const r = await request('/registry?network=Preprod&filterPaymentSourceType=Web3CardanoV2&limit=100');
  const mine = findById(r, state.registrationId);
  if (mine) {
    state.registration = mine;
    state.agentIdentifier = mine.agentIdentifier;
    state.registrationState = mine.state;
    state.supportedPaymentSourceIndex ??= 0;
    const tx = mine.CurrentTransaction?.txHash;
    if (tx && state.registrationTx !== tx) {
      state.registrationTx = tx;
      logTransaction('Cardano Preprod', `https://preprod.cardanoscan.io/transaction/${tx}`, `Masumi registry: register SecondSource (${mine.state})`);
    }
    save();
  }
  console.log(JSON.stringify({ id: state.registrationId, state: state.registrationState, agentIdentifier: state.agentIdentifier, tx: state.registrationTx }, null, 2));
}
