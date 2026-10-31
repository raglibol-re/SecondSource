import { BaseError, ContractFunctionRevertedError, encodeFunctionData, toHex, type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import type { SignedResponse } from '../airnode/airnode-v2.ts';
import { logTransaction } from '../airnode/client.ts';
import type { CheckResult } from '../types.ts';
import { artifact, clients, vaultAddress } from './chain.ts';
import { citedPrimaryPost, fetchSignedPost } from './evidence.ts';
import { fetchSignedPrice } from './nodary.ts';
import { signVerdict } from './verdict.ts';

// The contract's AirnodeResponse tuple, from a response exactly as AirnodeHub returned it.
export const responseArg = (r: SignedResponse) => ({
  airnode: r.airnode,
  requestHash: r.requestHash,
  timestamp: BigInt(r.timestamp),
  data: toHex(r.data),
  signature: r.signature,
});

// One plain-English line per contract error, for the tamper test, the judge page and the scripts.
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
};

export const describeRevert = (e: unknown): { error: string; args: string; reason: string } => {
  const revert = e instanceof BaseError ? e.walk((x) => x instanceof ContractFunctionRevertedError) : null;
  if (revert instanceof ContractFunctionRevertedError && revert.data?.errorName) {
    const name = revert.data.errorName;
    return { error: name, args: (revert.data.args ?? []).map(String).join(', '), reason: REASONS[name] ?? name };
  }
  const msg = (e as Error).message ?? String(e);
  return { error: 'revert', args: '', reason: msg.split('\n')[0]!.slice(0, 200) };
};

// Signs the verdict for this vault and the cited primary post, buys the signed post and a fresh price, then asks the
// vault for a trade (CONFIRMED) or a halt (DENIED). The vault decides; with sendAnyway a refused call still goes on chain.
export const actOnVerdict = async (result: CheckResult, { usd = '1000', sendAnyway = false } = {}) => {
  const { abi } = artifact();
  const { pub, wallet, account } = clients();
  const vault = vaultAddress();
  const { postId, author } = citedPrimaryPost(result);
  const post = await fetchSignedPost(postId);
  const verdict = await signVerdict(baseSepolia.id, vault, result.resultHash as Hex, result.verdict, post.response.requestHash);
  const verdictArg = { resultHash: verdict.resultHash, verdict: verdict.verdict, signedAt: verdict.signedAt, signature: verdict.signature };
  const isTrade = result.verdict !== 'DENIED';
  const price = isTrade ? await fetchSignedPrice('ETH/USD') : null;
  const functionName = isTrade ? 'executeTrade' : 'haltOnDenial';
  const args = isTrade
    ? [responseArg(price!), postId, responseArg(post.response), verdictArg, BigInt(Math.round(Number(usd) * 1e6)) * 10n ** 12n]
    : [postId, responseArg(post.response), verdictArg];
  const label = `${functionName} on ${result.verdict} citing @${author} post ${postId}`;
  try {
    const { request } = await pub.simulateContract({ address: vault, abi, functionName, args, account } as never);
    const hash = await wallet.writeContract(request as never);
    const receipt = await pub.waitForTransactionReceipt({ hash });
    logTransaction('Base Sepolia', `https://sepolia.basescan.org/tx/${hash}`, `GuardedVault ${label}: ${result.input.headline.slice(0, 50)}`);
    return { ok: receipt.status === 'success', hash, label };
  } catch (e) {
    const why = describeRevert(e);
    if (!sendAnyway) return { ok: false, label, revert: why };
    const hash = await wallet.sendTransaction({ to: vault, data: encodeFunctionData({ abi, functionName, args } as never), gas: 600_000n });
    await pub.waitForTransactionReceipt({ hash });
    logTransaction('Base Sepolia', `https://sepolia.basescan.org/tx/${hash}`, `GuardedVault refused ${label} (${why.error}): ${result.input.headline.slice(0, 50)}`);
    return { ok: false, hash, label, revert: why };
  }
};
