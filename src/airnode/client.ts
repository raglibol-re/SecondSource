import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { isHex, type Hex } from 'viem';
import type { AirnodeV2Request, SignedResponse } from './airnode-v2.ts';
import { AIRNODES, type AirnodeName } from './registry.ts';
import { verifyAttestation, type VerifyOptions } from './verify.ts';
import { createPayingFetch, readPaymentSettlement } from './x402.ts';

// One piece of evidence: what we asked, the signed answer, and the x402 settlement that paid for it. It has been
// verified against the signer pinned in the registry before it is returned.
export interface Attestation {
  source: AirnodeName;
  request: AirnodeV2Request;
  response: SignedResponse;
  paymentTx?: string;
}

export const createPayer = (): typeof fetch => {
  const key = process.env.PAYER_PRIVATE_KEY;
  if (!key || !isHex(key)) throw new Error('Set PAYER_PRIVATE_KEY in .env (pnpm wallet:new) and fund it with aUSD');
  return createPayingFetch(key as Hex);
};

const TX_LOG = 'docs/transactions.md';
export const logTransaction = (network: string, url: string, description: string) => {
  if (!existsSync(TX_LOG)) writeFileSync(TX_LOG, '# Transactions\n\n| When (UTC) | Network | Link | What |\n|---|---|---|---|\n');
  appendFileSync(TX_LOG, `| ${new Date().toISOString()} | ${network} | ${url} | ${description} |\n`);
};

// POSTs one operation (paying over x402 if it is priced), then verifies the attestation before handing it back.
export const callAirnode = async (
  source: AirnodeName,
  request: AirnodeV2Request,
  fetchFunction: typeof fetch,
  verifyOptions: VerifyOptions = {}
): Promise<Attestation> => {
  const { url, address } = AIRNODES[source];
  const res = await fetchFunction(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const settlement = readPaymentSettlement(res);
  let paymentTx: string | undefined;
  if (settlement?.success && settlement.transaction) {
    paymentTx = settlement.transaction;
    logTransaction('Base Sepolia', `https://sepolia.basescan.org/tx/${paymentTx}`, `x402 payment: ${source}.${request.operation}`);
  }
  if (!res.ok) throw new Error(`${source}.${request.operation} answered ${res.status}: ${await res.text()}`);
  const response = (await res.json()) as SignedResponse;
  await verifyAttestation(response, request, address, verifyOptions);
  return { source, request, response, paymentTx };
};
