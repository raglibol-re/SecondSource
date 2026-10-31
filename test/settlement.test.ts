import assert from 'node:assert/strict';
import { test } from 'node:test';
import { undecidedSettlement } from '../src/x402/seller.ts';

const header = (o: unknown) => ({ 'PAYMENT-RESPONSE': Buffer.from(JSON.stringify(o)).toString('base64') });

test('a facilitator timeout is undecided, so the work is delivered', () => {
  // The real answer on 31 Oct 2026, after the 2 tADA had already been submitted.
  assert.equal(undecidedSettlement({ status: 402, headers: header({ success: false, errorReason: 'Facilitator settle failed (504): <html>504 Gateway Time-out</html>' }) }), true);
  assert.equal(undecidedSettlement({ status: 502, body: { error: 'bad gateway' } }), true);
});

test('a definite rejection is not undecided, so the verdict is withheld', () => {
  assert.equal(undecidedSettlement({ status: 402, headers: header({ success: false, errorReason: 'insufficient_funds' }) }), false);
  assert.equal(undecidedSettlement({ status: 402, headers: header({ success: false, errorReason: 'invalid_signature' }) }), false);
});
