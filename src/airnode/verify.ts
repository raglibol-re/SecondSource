import type { Address, Hex } from 'viem';
import { deriveRequestHash, verifySignedResponse, type AirnodeV2Request, type SignedResponse } from './airnode-v2.ts';

export interface VerifyOptions {
  // Reject a response signed longer ago than this. Omit for historical evidence that was fetched earlier.
  maxAgeSeconds?: number;
  now?: number;
}

// Checks one attestation before anything uses it: the request hash is the one we computed for what we asked, the signer
// is the Airnode address pinned from that API's spec, and the timestamp is fresh enough and not in the future.
export const verifyAttestation = async (
  response: SignedResponse,
  request: AirnodeV2Request,
  expectedSigner: Address,
  { maxAgeSeconds, now = Math.floor(Date.now() / 1000) }: VerifyOptions = {}
): Promise<void> => {
  const requestHash: Hex = deriveRequestHash(request);
  await verifySignedResponse(response, expectedSigner, requestHash);
  const timestamp = Number(response.timestamp);
  if (!Number.isSafeInteger(timestamp)) throw new Error(`Bad timestamp ${response.timestamp}`);
  if (timestamp > now + 60) throw new Error(`The response is dated ${timestamp}, in the future`);
  if (maxAgeSeconds !== undefined && now - timestamp > maxAgeSeconds) {
    throw new Error(`The response is ${now - timestamp}s old, more than ${maxAgeSeconds}s`);
  }
};
