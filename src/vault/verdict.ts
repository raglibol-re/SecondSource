import { encodeAbiParameters, keccak256, toHex, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Verdict } from '../types.ts';

// Must match GuardedVault.Verdict and GuardedVault.verdictDigest.
export const VERDICT_CODE: Record<Verdict, number> = { CONFIRMED: 1, UNCONFIRMED: 2, DENIED: 3 };
export const VERDICT_TAG = keccak256(toHex('SecondSource.Verdict.v2'));

// The verdict commits to one chain, one vault and one primary-source post (its request hash), so it cannot be moved to
// another vault or reused with different evidence.
export const verdictDigest = (
  chainId: number,
  vault: Address,
  resultHash: Hex,
  verdict: Verdict,
  signedAt: bigint,
  evidenceRequestHash: Hex
): Hex =>
  keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }, { type: 'uint8' }, { type: 'uint256' }, { type: 'bytes32' }],
      [VERDICT_TAG, BigInt(chainId), vault, resultHash, VERDICT_CODE[verdict], signedAt, evidenceRequestHash]
    )
  );

export const coworkerSigner = () => {
  const key = process.env.COWORKER_SIGNER_KEY as Hex | undefined;
  if (!key) throw new Error('Set COWORKER_SIGNER_KEY in .env (pnpm vault:signer)');
  return privateKeyToAccount(key);
};

export const signVerdict = async (
  chainId: number,
  vault: Address,
  resultHash: Hex,
  verdict: Verdict,
  evidenceRequestHash: Hex,
  signedAt = BigInt(Math.floor(Date.now() / 1000))
) => {
  const signature = await coworkerSigner().signMessage({
    message: { raw: verdictDigest(chainId, vault, resultHash, verdict, signedAt, evidenceRequestHash) },
  });
  return { resultHash, verdict: VERDICT_CODE[verdict], signedAt, signature };
};
