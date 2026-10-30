// Paid Sokosumi Task flow on Cardano Preprod, ported from Masumi's reference worker
// (masumi-network/demo-agent-token2049, branch live-demo-name-finder, paid-task.mjs).
//
// Stages: quote terms from the Masumi Payment Service (MPS) -> post them to the Task as masumiPayment -> wait until the
// buyer's 1 tUSDM is locked in escrow -> run the check -> submit the result hash on chain via MPS -> complete the Task.
// Every stage is journaled before its side effect, and an uncertain "-pending" stage is never retried automatically.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { CoreClient } from './sokosumi.ts';

const MINUTE = 60_000;
// Test USDM on Preprod (policy id + asset name), as in Masumi's reference.
export const USDM = '16a55b2a349361ff88c03788f93e1e966e5d689605d044fef722ddde0014df10745553444d';
export const PRICE_ATOMIC = '1000000'; // 1 tUSDM

export const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

export interface Registration {
  agentIdentifier: string;
  supportedPaymentSourceIndex: number;
  walletId: string;
  registrationState?: string;
  sellerAddress?: string;
}

export const REGISTRATION_FILE = 'masumi/registration.json';

export const readRegistration = (): Registration | null => {
  if (!existsSync(REGISTRATION_FILE)) return null;
  const r = JSON.parse(readFileSync(REGISTRATION_FILE, 'utf8')) as Registration;
  return r.registrationState === 'RegistrationConfirmed' ? r : null;
};

interface Tx {
  status?: string;
  newOnChainState?: string;
}
interface Payment {
  blockchainIdentifier: string;
  agentIdentifier: string;
  inputHash: string;
  payByTime: string;
  submitResultTime: string;
  unlockTime: string;
  externalDisputeUnlockTime: string;
  sellerReturnAddress?: string | null;
  forceLayer?: unknown;
  onChainState?: string;
  resultHash?: string;
  RequestedFunds: { amount: string; unit: string }[];
  PaymentSource: { network: string; paymentSourceType: string; smartContractAddress: string; policyId: string };
  SmartContractWallet: { id: string; walletVkey: string };
  CurrentTransaction?: Tx & { txHash?: string };
  TransactionHistory?: (Tx & { txHash?: string })[];
}

export const confirmedState = (p: Payment, expected: string) =>
  (p.CurrentTransaction?.status === 'Confirmed' && p.CurrentTransaction?.newOnChainState === expected) ||
  (p.TransactionHistory ?? []).some((t) => t.status === 'Confirmed' && t.newOnChainState === expected);

export const purchasePayload = (payment: Payment, nonce: string, reg: Registration) => {
  if (payment.sellerReturnAddress != null || payment.forceLayer != null) throw new Error('Core Task events cannot carry sellerReturnAddress or forceLayer');
  if (payment.PaymentSource?.network !== 'Preprod' || payment.PaymentSource?.paymentSourceType !== 'Web3CardanoV2') throw new Error('Payment source is not Preprod Web3CardanoV2');
  if (payment.SmartContractWallet?.id !== reg.walletId) throw new Error('Payment wallet differs from the registered seller wallet');
  if (payment.RequestedFunds.length !== 1 || payment.RequestedFunds[0]!.unit !== USDM || payment.RequestedFunds[0]!.amount !== PRICE_ATOMIC) throw new Error('Signed quote differs from 1 tUSDM');
  return {
    blockchainIdentifier: payment.blockchainIdentifier,
    agentIdentifier: payment.agentIdentifier,
    sellerVkey: payment.SmartContractWallet.walletVkey,
    submitResultTime: payment.submitResultTime,
    payByTime: payment.payByTime,
    unlockTime: payment.unlockTime,
    externalDisputeUnlockTime: payment.externalDisputeUnlockTime,
    inputHash: payment.inputHash,
    identifierFromPurchaser: nonce,
    paymentSourceType: 'Web3CardanoV2',
    supportedPaymentSourceIndex: reg.supportedPaymentSourceIndex,
    Amounts: payment.RequestedFunds.map(({ amount, unit }) => ({ amount, unit })),
    PaymentSource: { network: 'Preprod', smartContractAddress: payment.PaymentSource.smartContractAddress, policyId: payment.PaymentSource.policyId },
  };
};

export interface PaidState {
  stage?: string;
  nonce?: string;
  payment?: Payment;
  observed?: Payment;
  result?: string;
  resultHash?: string;
  checkResultHash?: string;
  eventId?: string;
}

export interface PaidDeps {
  core: () => Promise<CoreClient>;
  mps: (path: string, body: unknown) => Promise<any>;
  registration: () => Registration;
  // Runs the check; returns the text delivered to the buyer and SecondSource's own keccak result hash.
  run: (input: string, deadline: number) => Promise<{ text: string; checkResultHash?: string }>;
  save: (state: PaidState) => void;
}

export const createMps = (url = process.env.MPS_URL, token = process.env.MPS_RUNTIME_TOKEN) => async (path: string, body: unknown) => {
  if (!url || !token) throw new Error('Set MPS_URL and MPS_RUNTIME_TOKEN in .env');
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
    headers: { 'Content-Type': 'application/json', token },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { status?: string; data?: unknown };
  if (!res.ok || data.status !== 'success') throw new Error(`MPS ${path} failed with HTTP ${res.status}. Inspect saved state before retrying.`);
  return data.data;
};

// Moves one paid Task forward by at most one stage per call. The worker calls it on every poll.
export const advancePaid = async (taskId: string, input: string, p: PaidState, d: PaidDeps): Promise<PaidState> => {
  const reg = d.registration();
  const persist = (next: PaidState) => {
    d.save(next);
    return next;
  };

  if (!p.stage) {
    const nonce = randomBytes(10).toString('hex');
    const now = Date.now();
    const body = {
      network: 'Preprod',
      agentIdentifier: reg.agentIdentifier,
      paymentSourceType: 'Web3CardanoV2',
      supportedPaymentSourceIndex: reg.supportedPaymentSourceIndex,
      inputHash: sha256(input),
      identifierFromPurchaser: nonce,
      RequestedFunds: [{ amount: PRICE_ATOMIC, unit: USDM }],
      payByTime: new Date(now + 5 * MINUTE).toISOString(),
      submitResultTime: new Date(now + 20 * MINUTE).toISOString(),
      unlockTime: new Date(now + 36 * MINUTE).toISOString(),
      externalDisputeUnlockTime: new Date(now + 52 * MINUTE).toISOString(),
      metadata: JSON.stringify({ taskId }),
    };
    persist({ stage: 'terms-pending', nonce });
    const payment = (await d.mps('/api/v1/payment', body)) as Payment;
    return persist({ stage: 'terms-saved', nonce, payment });
  }

  if (p.stage === 'terms-saved') {
    const payload = purchasePayload(p.payment!, p.nonce!, reg);
    if (Date.now() >= Number(p.payment!.payByTime)) throw new Error('The signed payment deadline expired');
    persist({ ...p, stage: 'purchase-pending' });
    const res = await (await d.core()).post(`/v1/tasks/${encodeURIComponent(taskId)}/events`, {
      comment: 'Payment requested: 1 test USDM for a SecondSource check.',
      masumiPayment: payload,
    });
    return persist({ ...p, stage: 'awaiting-escrow', eventId: res.data.id });
  }

  if (p.stage === 'awaiting-escrow' || p.stage === 'awaiting-result') {
    const observed = (await d.mps('/api/v1/payment/resolve-blockchain-identifier', {
      network: 'Preprod',
      blockchainIdentifier: p.payment!.blockchainIdentifier,
      includeHistory: 'true',
    })) as Payment;
    p = persist({ ...p, observed });
    if (p.stage === 'awaiting-escrow') {
      if (observed.onChainState !== 'FundsLocked' || !confirmedState(observed, 'FundsLocked')) return p;
      const deadline = Number(p.payment!.submitResultTime);
      if (Date.now() >= deadline) throw new Error('The result deadline passed before the check ran');
      persist({ ...p, stage: 'check-pending' });
      const { text, checkResultHash } = await d.run(input, deadline);
      if (!text.trim()) throw new Error('The check returned nothing');
      return persist({ ...p, stage: 'result-saved', result: text, resultHash: sha256(text), checkResultHash });
    }
    if (observed.onChainState === 'ResultSubmitted' && observed.resultHash === p.resultHash && confirmedState(observed, 'ResultSubmitted')) {
      return persist({ ...p, stage: 'complete-ready' });
    }
    return p;
  }

  if (p.stage === 'result-saved') {
    if (Date.now() >= Number(p.payment!.submitResultTime)) throw new Error('The result deadline passed before submission');
    persist({ ...p, stage: 'submit-pending' });
    await d.mps('/api/v1/payment/submit-result', { network: 'Preprod', blockchainIdentifier: p.payment!.blockchainIdentifier, submitResultHash: p.resultHash });
    return persist({ ...p, stage: 'awaiting-result' });
  }

  if (p.stage === 'complete-ready') {
    persist({ ...p, stage: 'complete-pending' });
    await (await d.core()).post(`/v1/tasks/${encodeURIComponent(taskId)}/events`, { status: 'COMPLETED', comment: p.result });
    return persist({ ...p, stage: 'completed' });
  }

  if (p.stage?.endsWith('-pending')) throw new Error(`Uncertain stage ${p.stage}. Inspect the Task and MPS before recovering; no automatic retry.`);
  return p;
};
