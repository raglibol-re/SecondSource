// Read-only calls to the deployed GuardedVault (eth_call, no gas, no keys), shared by the tamper test, the judge API
// and the CLI. Nothing here touches the filesystem, so it also runs in the Vercel functions.
import { BaseError, ContractFunctionRevertedError, createPublicClient, encodePacked, formatUnits, http, keccak256, toHex, type Address, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import type { SignedResponse } from '../airnode/airnode-v2.ts';
import { STALE_ETH_USD, VAULT_ABI, VAULT_ADDRESS } from './deployment.generated.ts';
import { fetchSignedPrice } from './nodary.ts';

export const responseArg = (r: SignedResponse) => ({
  airnode: r.airnode,
  requestHash: r.requestHash,
  timestamp: BigInt(r.timestamp),
  data: toHex(r.data),
  signature: r.signature,
});

// One plain-English line per contract error.
export const REASONS: Record<string, string> = {
  WrongRequest: 'answers a different request than the contract expects',
  SignatureMismatch: 'signature does not match the data: a value, the timestamp or the signature was changed',
  UnexpectedAirnode: 'validly signed, but by a key that is not the expected Airnode',
  PriceResponseTooOld: 'the price was signed more than 60 seconds ago',
  PriceDataTooOld: 'Nodary took this price more than 60 seconds ago',
  EvidenceTooOld: 'the post was fetched more than a day ago',
  InvalidPostId: 'the post id is not a number',
  PostIdMismatch: 'the signed post is not the requested one',
  NotPrimarySource: 'the post is not by a primary account',
  VerdictNotSignedBySecondSource: 'the verdict was not signed by SecondSource for this vault and this post',
  UnexpectedVerdict: 'the verdict does not allow this action',
  VerdictTooOld: 'the verdict was signed more than an hour ago',
  VerdictAlreadyUsed: 'this verdict was already used',
  TradingHalted: 'trading is halted by a primary-source denial',
  ECDSAInvalidSignature: 'the signature is not a valid signature at all',
  ECDSAInvalidSignatureLength: 'the signature has the wrong length',
};

export const describeRevert = (e: unknown): { error: string; args: string; reason: string } => {
  const revert = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
  if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName) {
    const name = revert.data.errorName;
    return { error: name, args: (revert.data.args ?? []).map(String).join(', '), reason: REASONS[name] ?? name };
  }
  const msg = (e as Error)?.message ?? String(e);
  return { error: 'revert', args: '', reason: msg.split('\n')[0]!.slice(0, 200) };
};

const client = () => createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC_URL) });

export type Outcome =
  | { accepted: true; detail: string; values: Record<string, string> }
  | { accepted: false; error: string; args: string; reason: string };

export const verifyPriceOnChain = async (r: SignedResponse, vault: Address = VAULT_ADDRESS): Promise<Outcome> => {
  try {
    const [price, updatedAt] = (await client().readContract({ address: vault, abi: VAULT_ABI, functionName: 'verifyPrice', args: [responseArg(r)] })) as [bigint, bigint];
    const taken = new Date(Number(updatedAt) * 1000).toISOString();
    return { accepted: true, detail: `ETH/USD ${formatUnits(price, 18)}, taken ${taken}`, values: { price: formatUnits(price, 18), updatedAt: taken } };
  } catch (e) {
    return { accepted: false, ...describeRevert(e) };
  }
};

export const verifyPostOnChain = async (postId: string, r: SignedResponse, vault: Address = VAULT_ADDRESS): Promise<Outcome> => {
  try {
    const [author, text] = (await client().readContract({ address: vault, abi: VAULT_ABI, functionName: 'verifyPrimarySource', args: [postId, responseArg(r)] })) as [string, string];
    return { accepted: true, detail: `@${author}: "${text}"`, values: { author, text } };
  } catch (e) {
    return { accepted: false, ...describeRevert(e) };
  }
};

// Re-signs a response the way an Airnode does, with a throwaway key that is not the Nodary Airnode's.
const signAs = async (key: Hex, r: SignedResponse): Promise<SignedResponse> => {
  const account = privateKeyToAccount(key);
  const digest = keccak256(encodePacked(['bytes32', 'uint256', 'bytes'], [r.requestHash, BigInt(r.timestamp), toHex(r.data)]));
  return { ...r, airnode: account.address, signature: await account.signMessage({ message: { raw: digest } }) };
};

export interface TamperCase {
  key: 'valid' | 'edited' | 'stale' | 'wrong-request' | 'wrong-key';
  label: string;
  response: SignedResponse;
}

// The API3 tamper test: one valid, timely response, then four variants of real responses.
export const buildTamperCases = async (): Promise<TamperCase[]> => {
  const [fresh, otherRequest] = await Promise.all([fetchSignedPrice('ETH/USD'), fetchSignedPrice('BTC/USD')]);
  const stale = STALE_ETH_USD as unknown as SignedResponse;
  const ageMinutes = Math.round((Date.now() / 1000 - Number(stale.timestamp)) / 60);
  return [
    { key: 'valid', label: 'Valid, timely response from the Nodary Airnode', response: fresh },
    {
      key: 'edited',
      label: 'Real response with one value edited (the price)',
      response: { ...fresh, data: fresh.data.replace(/"price":(\d)/, (_, d: string) => `"price":${(Number(d) % 9) + 1}`) },
    },
    { key: 'stale', label: `Real response that is too old (signed ${ageMinutes} minutes ago)`, response: stale },
    { key: 'wrong-request', label: 'Real response to a different request (BTC/USD instead of ETH/USD)', response: otherRequest },
    { key: 'wrong-key', label: 'Response signed by a key that is not the Nodary Airnode', response: await signAs(generatePrivateKey(), fresh) },
  ];
};
