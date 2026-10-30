import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { deriveRequestHash, type SignedResponse } from '../src/airnode/airnode-v2.ts';
import { AIRNODES } from '../src/airnode/registry.ts';
import { verifyAttestation } from '../src/airnode/verify.ts';

// A real response from the Nodary Airnode, fetched 2026-10-30.
const response: SignedResponse = JSON.parse(readFileSync('test/fixtures/nodary-eth-usd.json', 'utf8'));
const request = { operation: 'latestFeeds', parameters: { name: 'ETH/USD' } };
const signer = AIRNODES.nodary.address;
const at = Number(response.timestamp) + 10;

test('request hash matches the one the Airnode signed', () => {
  assert.equal(deriveRequestHash(request), response.requestHash);
});

test('a genuine response verifies', async () => {
  await verifyAttestation(response, request, signer, { maxAgeSeconds: 60, now: at });
});

test('tampered data fails', async () => {
  const tampered = { ...response, data: response.data.replace('2237.99', '9237.99') };
  assert.notEqual(tampered.data, response.data);
  await assert.rejects(verifyAttestation(tampered, request, signer, { now: at }), /signed by/);
});

test('tampered timestamp fails', async () => {
  const tampered = { ...response, timestamp: String(Number(response.timestamp) - 1) };
  await assert.rejects(verifyAttestation(tampered, request, signer, { now: at }), /signed by/);
});

test('wrong expected signer fails', async () => {
  await assert.rejects(verifyAttestation(response, request, AIRNODES.twitter.address, { now: at }), /signed by/);
});

test('a different request fails', async () => {
  const other = { operation: 'latestFeeds', parameters: { name: 'BTC/USD' } };
  await assert.rejects(verifyAttestation(response, other, signer, { now: at }), /answers the request/);
});

test('stale response fails when freshness is required', async () => {
  await assert.rejects(
    verifyAttestation(response, request, signer, { maxAgeSeconds: 60, now: at + 3600 }),
    /old, more than/
  );
});
