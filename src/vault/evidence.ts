import { callAirnode, createPayer, type Attestation } from '../airnode/client.ts';
import { deriveRequestHash, type AirnodeV2Request } from '../airnode/airnode-v2.ts';
import type { CheckResult } from '../types.ts';

// The primary-source evidence the Guarded Vault checks on chain: one post, fetched by id from the TwitterAPI.io Airnode
// and projected to four fields, so the signed data is small and the contract can rebuild the request hash itself.
// GuardedVault.primarySourceRequestHash(postId) computes the same hash in Solidity.
export const POST_PROJECTION = {
  author: '/tweets/0/author/userName',
  createdAt: '/tweets/0/createdAt',
  id: '/tweets/0/id',
  text: '/tweets/0/text',
} as const;

export const primarySourceRequest = (postId: string): AirnodeV2Request => {
  if (!/^\d{1,25}$/.test(postId)) throw new Error(`Not a post id: ${postId}`);
  return { operation: 'tweetsByIds', parameters: { tweet_ids: postId }, responseProjection: { ...POST_PROJECTION } };
};

export const primarySourceRequestHash = (postId: string) => deriveRequestHash(primarySourceRequest(postId));

// Buys and verifies the signed post (0.01 aUSD over x402).
export const fetchSignedPost = async (postId: string, pay: typeof fetch = createPayer()): Promise<Attestation> =>
  callAirnode('twitter', primarySourceRequest(postId), pay, { maxAgeSeconds: 300 });

// The post a verdict rests on: the first cited tweet by one of the check's primary accounts.
export const citedPrimaryPost = (r: CheckResult): { postId: string; author: string } => {
  const primary = new Set((r.input.officialAccounts ?? []).map((a) => `@${a}`.toLowerCase()));
  for (const id of r.citations) {
    const e = r.evidence.find((x) => x.id === id);
    const postId = e?.url?.match(/status\/(\d+)/)?.[1];
    if (e?.kind === 'tweet' && postId && e.author && primary.has(e.author.toLowerCase())) return { postId, author: e.author.slice(1) };
  }
  throw new Error('The verdict cites no post by a primary account, so the vault has nothing to verify on chain');
};
