import type { Attestation } from './airnode/client.ts';
import type { AirnodeV2Request } from './airnode/airnode-v2.ts';
import type { AirnodeName } from './airnode/registry.ts';

export interface CheckInput {
  headline: string;
  // Who the headline attributes the claim to, as an X handle (with or without @), e.g. "RapidResponse47".
  claimedSource?: string;
  // Market instrument as "assetClass/symbol", e.g. "indices/US30" or "stocks/US:AAPL".
  asset?: string;
  // When the headline ran (ISO 8601). Defaults to now.
  publishedAt?: string;
  // Override the search words; otherwise taken from the headline.
  keywords?: string[];
  // Accounts whose word counts as primary for this claim. Defaults to the White House accounts.
  officialAccounts?: string[];
}

export type Verdict = 'CONFIRMED' | 'UNCONFIRMED' | 'DENIED';

// A short, model-readable line of evidence, tied back to the attestation it came from.
export interface EvidenceItem {
  id: string; // E1, E2, ...
  attestation: number; // index into attestations[]
  kind: 'tweet' | 'news' | 'market';
  at?: string;
  author?: string;
  text: string;
  url?: string;
}

export interface CheckStep {
  label: string;
  source: AirnodeName;
  status: 'ok' | 'failed';
  attestation?: number;
  error?: string;
}

export interface CheckResult {
  input: CheckInput;
  window: { since: string; until: string };
  verdict: Verdict;
  confidence: number;
  reasoning: string;
  citations: string[];
  evidence: EvidenceItem[];
  attestations: Attestation[];
  steps: CheckStep[];
  // signed: the judgment came back through the OpenRouter Airnode; false means the fixed-rules fallback ran.
  judge: { model: string; attestation?: number; signed: boolean } | null;
  costAusd: string;
  checkedAt: string;
  resultHash?: string;
}

// The one function every evidence source uses to buy a signed, verified answer. Injected so tests can use fixtures.
export type Caller = (source: AirnodeName, request: AirnodeV2Request) => Promise<Attestation>;
