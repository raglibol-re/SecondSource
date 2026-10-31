import { encodeFunctionData, type Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { logTransaction } from '../airnode/client.ts';
import type { CheckResult } from '../types.ts';
import { artifact, clients, vaultAddress } from './chain.ts';
import { citedPrimaryPost, fetchSignedPost } from './evidence.ts';
import { fetchSignedPrice } from './nodary.ts';
import { describeRevert, responseArg } from './onchain.ts';
import { signVerdict } from './verdict.ts';

export { describeRevert, responseArg };

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
