import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keccak256, recoverMessageAddress, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { priceRequestHash } from '../src/vault/nodary.ts';
import { signVerdict, verdictDigest } from '../src/vault/verdict.ts';

test('price request hash is the one the API3 starter documents for projected ETH/USD', () => {
  assert.equal(priceRequestHash('ETH/USD'), '0x180eae9387bb66a72380e61ebe0a00d19f8414a716a37ebe1df124b66acfff66');
});

test('verdict digest matches the Solidity abi.encode, computed independently with cast', () => {
  // cast keccak $(cast abi-encode "f(bytes32,uint256,address,bytes32,uint8,uint256)" $(cast keccak "SecondSource.Verdict.v1") 84532 0x...BEEF $(cast keccak "result") 1 7)
  const d = verdictDigest(84532, '0x000000000000000000000000000000000000beef', keccak256(toHex('result')), 'CONFIRMED', 7n);
  assert.equal(d, '0xd9072adaa8bed29282fa16f4e61999d45e5e4c6afe5641f79012f643c1dba28f');
});

test('signed verdict recovers to the coworker key', async () => {
  const key = '0x0000000000000000000000000000000000000000000000000000000000c0ffee';
  process.env.COWORKER_SIGNER_KEY = key;
  const s = await signVerdict(84532, '0x000000000000000000000000000000000000beef', keccak256(toHex('result')), 'DENIED', 7n);
  assert.equal(s.verdict, 3);
  const signer = await recoverMessageAddress({ message: { raw: verdictDigest(84532, '0x000000000000000000000000000000000000beef', s.resultHash, 'DENIED', 7n) }, signature: s.signature });
  assert.equal(signer, privateKeyToAccount(key).address);
});
