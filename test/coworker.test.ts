import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatResult, parseTaskInput } from '../src/coworker/format.ts';
import { advancePaid, confirmedState, PRICE_ATOMIC, purchasePayload, sha256, USDM, type PaidState, type Registration } from '../src/coworker/paid.ts';
import type { CheckResult } from '../src/types.ts';

test('plain-text brief: headline first, then labelled lines', () => {
  const i = parseTaskInput('"Hassett: Trump considering 90-day tariff pause"\nasset: indices/US30\nat: 2025-04-07T14:12:00Z\nkeywords: Hassett, tariff pause');
  assert.deepEqual(i, { headline: 'Hassett: Trump considering 90-day tariff pause', asset: 'indices/US30', publishedAt: '2025-04-07T14:12:00Z', keywords: ['Hassett', 'tariff pause'] });
});

test('JSON brief', () => {
  const i = parseTaskInput('{"headline":"Fed cuts rates by 50bp","asset":"indices/US500"}');
  assert.equal(i.headline, 'Fed cuts rates by 50bp');
  assert.equal(i.asset, 'indices/US500');
});

test('empty description falls back to the Task name, too short is refused', () => {
  assert.equal(parseTaskInput(null, 'Apple to buy Disney, says report').headline, 'Apple to buy Disney, says report');
  assert.throws(() => parseTaskInput('hi'), /headline/);
});

test('result text leads with the verdict and lists receipts with payment links', () => {
  const r = {
    input: { headline: 'H' },
    verdict: 'DENIED',
    confidence: 0.9,
    reasoning: 'The White House called it fake.',
    citations: ['E1'],
    evidence: [{ id: 'E1', attestation: 0, kind: 'tweet', author: '@RapidResponse47', text: 'FAKE NEWS' }],
    attestations: [{ source: 'twitter', request: { operation: 'searchTweets', parameters: {} }, response: { airnode: '0xabc', requestHash: '0x1', timestamp: '1743948720', data: '{}', signature: '0x2' }, paymentTx: '0xpay' }],
    steps: [{ label: 'Posts', source: 'twitter', status: 'ok', attestation: 0 }],
    costAusd: '0.01',
    resultHash: '0xres',
  } as unknown as CheckResult;
  const text = formatResult(r);
  assert.match(text, /^VERDICT: DENIED \(confidence 90%\)/);
  assert.match(text, /\[E1\] @RapidResponse47: FAKE NEWS/);
  assert.match(text, /https:\/\/sepolia\.basescan\.org\/tx\/0xpay/);
  assert.match(text, /Result hash: 0xres/);
});

const reg: Registration = { agentIdentifier: 'agent1', supportedPaymentSourceIndex: 0, walletId: 'w1', registrationState: 'RegistrationConfirmed' };
const payment = (over: object = {}) => ({
  blockchainIdentifier: 'bc1',
  agentIdentifier: 'agent1',
  inputHash: 'ih',
  payByTime: String(Date.now() + 300_000),
  submitResultTime: String(Date.now() + 1_200_000),
  unlockTime: '3',
  externalDisputeUnlockTime: '4',
  sellerReturnAddress: null,
  RequestedFunds: [{ amount: PRICE_ATOMIC, unit: USDM }],
  PaymentSource: { network: 'Preprod', paymentSourceType: 'Web3CardanoV2', smartContractAddress: 'addr_test', policyId: 'pol' },
  SmartContractWallet: { id: 'w1', walletVkey: 'vkey' },
  ...over,
});

test('purchase payload refuses a quote that is not exactly 1 tUSDM from our wallet', () => {
  assert.equal(purchasePayload(payment() as never, 'n', reg).Amounts[0]!.amount, PRICE_ATOMIC);
  assert.throws(() => purchasePayload(payment({ RequestedFunds: [{ amount: '5000000', unit: USDM }] }) as never, 'n', reg), /1 tUSDM/);
  assert.throws(() => purchasePayload(payment({ SmartContractWallet: { id: 'other', walletVkey: 'v' } }) as never, 'n', reg), /wallet/);
});

test('confirmed state needs a Confirmed transaction into that state', () => {
  assert.equal(confirmedState({ CurrentTransaction: { status: 'Pending', newOnChainState: 'FundsLocked' } } as never, 'FundsLocked'), false);
  assert.equal(confirmedState({ TransactionHistory: [{ status: 'Confirmed', newOnChainState: 'FundsLocked' }] } as never, 'FundsLocked'), true);
});

test('paid flow walks terms, escrow, check, on-chain result hash, completion', async () => {
  const calls: string[] = [];
  let onChain: object = { onChainState: 'FundsRequested' };
  let state: PaidState = {};
  const deps = {
    core: async () => ({ get: async () => ({ data: {} }), post: async (path: string, body: any) => (calls.push(`core ${body.status ?? 'payment'}`), { data: { id: 'ev1' } }) }),
    mps: async (path: string, body: any) => {
      calls.push(`mps ${path}`);
      if (path === '/api/v1/payment') return payment({ inputHash: body.inputHash });
      if (path === '/api/v1/payment/submit-result') return {};
      return onChain;
    },
    registration: () => reg,
    run: async () => ({ text: 'VERDICT: DENIED', checkResultHash: '0xk' }),
    save: () => {},
  };
  const step = async () => (state = await advancePaid('t1', 'brief', state, deps));
  await step();
  assert.equal(state.stage, 'terms-saved');
  await step();
  assert.equal(state.stage, 'awaiting-escrow');
  await step();
  assert.equal(state.stage, 'awaiting-escrow'); // not funded yet
  onChain = { onChainState: 'FundsLocked', CurrentTransaction: { status: 'Confirmed', newOnChainState: 'FundsLocked' } };
  await step();
  assert.equal(state.stage, 'result-saved');
  assert.equal(state.resultHash, sha256('VERDICT: DENIED'));
  await step();
  assert.equal(state.stage, 'awaiting-result');
  onChain = { onChainState: 'ResultSubmitted', resultHash: sha256('VERDICT: DENIED'), CurrentTransaction: { status: 'Confirmed', newOnChainState: 'ResultSubmitted' } };
  await step();
  assert.equal(state.stage, 'complete-ready');
  await step();
  assert.equal(state.stage, 'completed');
  assert.deepEqual(calls.filter((c) => c.startsWith('core')), ['core payment', 'core COMPLETED']);
});

test('an uncertain stage is never retried automatically', async () => {
  await assert.rejects(
    advancePaid('t1', 'brief', { stage: 'submit-pending' }, { core: async () => ({}) as never, mps: async () => ({}), registration: () => reg, run: async () => ({ text: 'x' }), save: () => {} }),
    /Uncertain stage submit-pending/
  );
});
