import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { keccak256, recoverMessageAddress, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { primarySourceRequestHash } from '../src/vault/evidence.ts';
import { priceRequestHash } from '../src/vault/nodary.ts';
import { signVerdict, verdictDigest } from '../src/vault/verdict.ts';

const BEEF = '0x000000000000000000000000000000000000beef';

test('price request hash is the one the API3 starter documents for projected ETH/USD', () => {
  assert.equal(priceRequestHash('ETH/USD'), '0x180eae9387bb66a72380e61ebe0a00d19f8414a716a37ebe1df124b66acfff66');
});

test('primary-source request hash matches the hash the TwitterAPI.io Airnode signed', () => {
  // The Solidity side (GuardedVault.primarySourceRequestHash) is tested against the same fixtures in Foundry.
  for (const f of ['post-rapidresponse-denial', 'post-whitehouse-shipbuilding', 'post-not-primary']) {
    const j = JSON.parse(readFileSync(`contracts/test/fixtures/${f}.json`, 'utf8'));
    assert.equal(primarySourceRequestHash(j.postId), j.requestHash, f);
  }
});

test('verdict digest matches the Solidity abi.encode, computed independently with cast', () => {
  // cast keccak $(cast abi-encode "f(bytes32,uint256,address,bytes32,uint8,uint256,bytes32)" \
  //   $(cast keccak "SecondSource.Verdict.v2") 84532 0x...BEEF $(cast keccak "result") 1 7 $(cast keccak "evidence"))
  const d = verdictDigest(84532, BEEF, keccak256(toHex('result')), 'CONFIRMED', 7n, keccak256(toHex('evidence')));
  assert.equal(d, '0x18e380831536f3479d4c2443543a81d466d7ccf69b3beb54bea55f4492089d66');
});

test('signed verdict recovers to the coworker key', async () => {
  const key = '0x0000000000000000000000000000000000000000000000000000000000c0ffee';
  process.env.COWORKER_SIGNER_KEY = key;
  const ev = keccak256(toHex('evidence'));
  const s = await signVerdict(84532, BEEF, keccak256(toHex('result')), 'DENIED', ev, 7n);
  assert.equal(s.verdict, 3);
  const signer = await recoverMessageAddress({ message: { raw: verdictDigest(84532, BEEF, s.resultHash, 'DENIED', 7n, ev) }, signature: s.signature });
  assert.equal(signer, privateKeyToAccount(key).address);
});
