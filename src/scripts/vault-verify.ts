import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { SignedResponse } from '../airnode/airnode-v2.ts';
import { VAULT_ADDRESS } from '../vault/deployment.generated.ts';
import { fetchSignedPrice } from '../vault/nodary.ts';
import { verifyPostOnChain, verifyPriceOnChain } from '../vault/onchain.ts';

// pnpm vault:verify <response.json>            check a Nodary ETH/USD response with the deployed vault
// pnpm vault:verify --fresh                    fetch a fresh signed price from the Nodary Airnode and check it
// pnpm vault:verify <response.json> --post ID  check a TwitterAPI.io post response (tweetsByIds, projected)
// The file is the response exactly as AirnodeHub returns it: airnode, requestHash, timestamp, data, signature.
// Read-only (eth_call): no gas, no keys.
const { positionals, values } = parseArgs({ allowPositionals: true, options: { fresh: { type: 'boolean', default: false }, post: { type: 'string' } } });
let response: SignedResponse;
if (values.fresh) {
  response = await fetchSignedPrice('ETH/USD');
  console.log(`Fresh response from the Nodary Airnode:\n${JSON.stringify(response, null, 2)}\n`);
} else if (positionals[0]) {
  const raw = JSON.parse(readFileSync(positionals[0], 'utf8'));
  response = (raw.response ?? raw) as SignedResponse;
} else {
  throw new Error('Usage: pnpm vault:verify <response.json> [--post ID] | pnpm vault:verify --fresh');
}
const o = values.post ? await verifyPostOnChain(values.post, response) : await verifyPriceOnChain(response);
console.log(`GuardedVault ${VAULT_ADDRESS} on Base Sepolia (${values.post ? 'verifyPrimarySource' : 'verifyPrice'}):`);
console.log(o.accepted ? `ACCEPTED: ${o.detail}` : `REVERTED ${o.error}(${o.args}): ${o.reason}`);
process.exitCode = o.accepted ? 0 : 1;
