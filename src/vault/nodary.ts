import { deriveRequestHash, fetchSignedResponse, type AirnodeV2Request, type SignedResponse } from '../airnode/airnode-v2.ts';
import { AIRNODES } from '../airnode/registry.ts';
import { verifyAttestation } from '../airnode/verify.ts';

// The one Nodary request the Guarded Vault accepts: a feed projected down to the two fields the contract reads.
export const priceRequest = (feed = 'ETH/USD'): AirnodeV2Request => {
  const pointer = `/${feed.replace(/~/g, '~0').replace(/\//g, '~1')}`;
  return { operation: 'latestFeeds', parameters: { name: feed }, responseProjection: { price: `${pointer}/value`, updatedAt: `${pointer}/timestamp` } };
};
export const priceRequestHash = (feed = 'ETH/USD') => deriveRequestHash(priceRequest(feed));

// Nodary is free, so no payment is needed. Verified against the pinned signer and a 60 s age limit, like the vault.
export const fetchSignedPrice = async (feed = 'ETH/USD'): Promise<SignedResponse> => {
  const request = priceRequest(feed);
  const response = await fetchSignedResponse(AIRNODES.nodary.url, request);
  await verifyAttestation(response, request, AIRNODES.nodary.address, { maxAgeSeconds: 60 });
  return response;
};
