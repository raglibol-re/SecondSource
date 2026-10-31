// Browser bundle (built to public/assets/cardano-pay.js with `pnpm build:browser`): pay an x402 offer in tADA on Cardano
// preprod from a CIP-30 wallet such as Eternl or Lace. The wallet signs; the facilitator broadcasts.
// The signer is adapted from the Cardano Foundation's x402-next template (lib/x402/cip30.ts), itself from
// cardano-foundation/x402-cardano-demo. Blockfrost is reached through this site's /api/blockfrost proxy, so the project
// key stays on the server.
import { Buffer } from 'buffer';
import { Address, Assets, Client, Transaction, preprod, type UTxO } from '@evolution-sdk/evolution';
import { LOVELACE_ASSET, parseAssetUnit, type ClientCardanoSigner } from '@x402/cardano';
import { ExactCardanoScheme } from '@x402/cardano/exact/client';
import { x402Client, x402HTTPClient } from '@x402/core/client';

(globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer;

type Blockfrost = { baseUrl: string };
interface Cip30Api {
  getNetworkId(): Promise<number>;
}
interface Cip30Wallet {
  name: string;
  icon: string;
  enable(): Promise<unknown>;
}

const ref = (u: UTxO.UTxO) => `${Buffer.from(u.transactionId.hash).toString('hex')}#${u.index}`;

const assets = (asset: string, amount: bigint) => {
  if (asset === LOVELACE_ASSET) return Assets.fromLovelace(amount);
  const { policyId, assetNameHex } = parseAssetUnit(asset);
  return Assets.addByHex(Assets.fromLovelace(0n), policyId, assetNameHex, amount);
};

// CIP-30's testnet id also covers preview, so only spend inputs that Blockfrost sees live on preprod.
const liveUtxos = async (utxos: readonly UTxO.UTxO[], provider: Blockfrost): Promise<UTxO.UTxO[]> => {
  const live = new Set<string>();
  for (const address of new Set(utxos.map((u) => Address.toBech32(u.address)))) {
    for (let page = 1; ; page++) {
      const r = await fetch(`${provider.baseUrl}/addresses/${address}/utxos?count=100&page=${page}`);
      if (r.status === 404) break;
      if (!r.ok) throw new Error(`Blockfrost returned ${r.status} checking preprod inputs. Try again before signing.`);
      const rows = (await r.json()) as { tx_hash: string; output_index: number }[];
      for (const row of rows) live.add(`${row.tx_hash.toLowerCase()}#${row.output_index}`);
      if (rows.length < 100) break;
    }
  }
  const usable = utxos.filter((u) => live.has(ref(u)));
  if (!usable.length) throw new Error('No live preprod inputs in your wallet. Switch it to preprod and fund it (dispenser.masumi.network).');
  return usable;
};

const createCip30Signer = async (walletApi: unknown, provider: Blockfrost): Promise<ClientCardanoSigner & { lovelace: () => Promise<bigint> }> => {
  const api = walletApi as Cip30Api;
  const checkNetwork = async () => {
    if ((await api.getNetworkId()) !== 0) throw new Error('Switch your wallet to Cardano preprod before paying.');
  };
  await checkNetwork();
  const client = Client.make(preprod).withBlockfrost(provider as never).withCip30(walletApi as never);
  const address = Address.toBech32(await client.address());
  return {
    getAddress: () => address,
    async lovelace() {
      const utxos = await client.getWalletUtxos();
      return utxos.reduce((sum, u) => sum + BigInt((u.assets as unknown as { lovelace?: bigint }).lovelace ?? 0n), 0n);
    },
    async buildAndSignPaymentTransaction(input) {
      if (input.network !== 'cardano:preprod') throw new Error('Only Cardano preprod is supported.');
      await checkNetwork();
      if ((input.extra?.assetTransferMethod ?? 'default') !== 'default') throw new Error('Only the default payment method is supported.');
      const utxos = await client.getWalletUtxos();
      if (!utxos.length) throw new Error('Your wallet has no inputs. Fund it with test ADA from dispenser.masumi.network.');
      const usable = await liveUtxos(utxos, provider);
      const nonceInput = usable[0]!;
      const built = await client
        .newTx()
        .collectFrom({ inputs: [nonceInput] })
        .payToAddress({ address: Address.fromBech32(input.payTo), assets: assets(input.asset, BigInt(input.amount)) })
        .setValidity({ to: BigInt(Date.now() + input.maxTimeoutSeconds * 1000) })
        .build({ changeAddress: await client.address(), availableUtxos: usable, autoMinUtxo: input.asset !== LOVELACE_ASSET });
      await checkNetwork();
      const unsigned = await built.toTransaction();
      const signed = await built.sign();
      const transaction = new Transaction.Transaction({
        body: unsigned.body,
        witnessSet: signed.witnessSet,
        isValid: true,
        auxiliaryData: unsigned.auxiliaryData,
      });
      return { transaction: Buffer.from(Transaction.toCBORBytes(transaction)).toString('base64'), nonce: ref(nonceInput) };
    },
  };
};

// CIP-30 wallets installed in this browser (window.cardano.<name>).
export const listCardanoWallets = (): { id: string; name: string; icon: string }[] => {
  const c = (globalThis as { cardano?: Record<string, Cip30Wallet> }).cardano ?? {};
  return Object.entries(c)
    .filter(([, w]) => w && typeof w.enable === 'function' && typeof w.name === 'string')
    .map(([id, w]) => ({ id, name: w.name, icon: w.icon }));
};

export const connectCardanoWallet = async (id: string) => {
  const w = (globalThis as { cardano?: Record<string, Cip30Wallet> }).cardano?.[id];
  if (!w) throw new Error('That Cardano wallet is not installed.');
  const api = await w.enable();
  return createCip30Signer(api, { baseUrl: `${location.origin}/api/blockfrost` });
};

// POSTs `body` to an x402 endpoint, pays its Cardano preprod offer from the wallet, and returns the paid response.
export const payWithCardano = async (signer: ClientCardanoSigner, url: string, body: unknown, onStatus: (s: string) => void = () => {}) => {
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const first = await fetch(url, init);
  if (first.status !== 402) throw new Error(`Expected HTTP 402, got ${first.status}: ${(await first.text()).slice(0, 200)}`);
  const http = new x402HTTPClient(
    x402Client.fromConfig({
      schemes: [{ network: 'cardano:preprod', client: new ExactCardanoScheme(signer) }],
      spendControls: { allowedAssets: [{ network: 'cardano:preprod', asset: 'lovelace', maxAmountPerPayment: '3000000' }] },
    } as never)
  );
  const required = http.getPaymentRequiredResponse((name) => first.headers.get(name));
  required.accepts = required.accepts.filter((a) => a.network === 'cardano:preprod');
  onStatus('Sign the 2 tADA payment in your Cardano wallet');
  const payload = await http.createPaymentPayload(required);
  onStatus('Signed. Sending the payment; Cardano confirms it while the agent works...');
  return fetch(url, { ...init, headers: { ...init.headers, ...http.encodePaymentSignatureHeader(payload) } });
};
