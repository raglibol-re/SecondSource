// Pays an x402 "exact" requirement in USDC on Base Sepolia from a browser wallet (EIP-1193, e.g. MetaMask), with no
// library. The wallet signs an EIP-3009 TransferWithAuthorization; the facilitator submits it, so the buyer pays no gas.
// Same payload as @x402/evm's ExactEvmScheme client (createEIP3009Payload) and @x402/core's encoding.

export const BASE_SEPOLIA = {
  chainId: '0x14a34', // 84532
  chainName: 'Base Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://sepolia.base.org'],
  blockExplorerUrls: ['https://sepolia.basescan.org'],
};
export const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
export const USDC_FAUCET = 'https://faucet.circle.com/';

const toB64 = (obj) => {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const fromB64 = (s) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))));
const hex = (bytes) => '0x' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function connectWallet(provider) {
  if (!provider) throw new Error('No browser wallet found. Install MetaMask (or another EVM wallet) and reload.');
  const [address] = await provider.request({ method: 'eth_requestAccounts' });
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_SEPOLIA.chainId }] });
  } catch (e) {
    if (e?.code !== 4902) throw e;
    await provider.request({ method: 'wallet_addEthereumChain', params: [BASE_SEPOLIA] });
  }
  return address;
}

export async function usdcBalance(provider, address) {
  const data = '0x70a08231' + address.slice(2).toLowerCase().padStart(64, '0'); // balanceOf(address)
  const out = await provider.request({ method: 'eth_call', params: [{ to: USDC, data }, 'latest'] });
  return BigInt(out); // 6 decimals
}

// POSTs `body` to an x402 endpoint, pays the Base Sepolia USDC requirement it answers with, and returns the paid response
// plus the settlement receipt (PAYMENT-RESPONSE).
export async function payWithUsdc(provider, from, url, body, onStatus = () => {}) {
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const first = await fetch(url, init);
  if (first.status !== 402) {
    const text = await first.text();
    throw new Error(`Expected HTTP 402, got ${first.status}: ${text.slice(0, 200)}`);
  }
  const required = fromB64(first.headers.get('payment-required'));
  const accepted = required.accepts.find((a) => a.network === 'eip155:84532' && a.scheme === 'exact');
  if (!accepted) throw new Error('This endpoint does not accept USDC on Base Sepolia');

  const now = Math.floor(Date.now() / 1000);
  const authorization = {
    from,
    to: accepted.payTo,
    value: accepted.amount,
    validAfter: '0',
    validBefore: String(now + accepted.maxTimeoutSeconds),
    nonce: hex(crypto.getRandomValues(new Uint8Array(32))),
  };
  const typedData = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    domain: { name: accepted.extra.name, version: accepted.extra.version, chainId: 84532, verifyingContract: accepted.asset },
    primaryType: 'TransferWithAuthorization',
    message: authorization,
  };
  onStatus(`Sign the payment of ${Number(accepted.amount) / 1e6} USDC in your wallet (no gas)`);
  const signature = await provider.request({ method: 'eth_signTypedData_v4', params: [from, JSON.stringify(typedData)] });

  onStatus('Paid. SecondSource is buying signed evidence and judging it (about 30 seconds)...');
  const payment = { x402Version: 2, payload: { authorization, signature }, resource: required.resource, accepted };
  const paid = await fetch(url, { ...init, headers: { ...init.headers, 'PAYMENT-SIGNATURE': toB64(payment) } });
  const receiptHeader = paid.headers.get('payment-response');
  return { response: paid, settlement: receiptHeader ? fromB64(receiptHeader) : null };
}
