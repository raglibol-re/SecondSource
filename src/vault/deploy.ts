import { readFileSync, writeFileSync } from 'node:fs';
import { logTransaction } from '../airnode/client.ts';
import { AIRNODES } from '../airnode/registry.ts';
import { DEFAULT_OFFICIAL_ACCOUNTS } from '../check.ts';
import { artifact, clients, DEPLOYMENTS } from './chain.ts';
import { priceRequestHash } from './nodary.ts';
import { coworkerSigner } from './verdict.ts';

// Deploys GuardedVault v2 to Base Sepolia: the Nodary and TwitterAPI.io Airnode addresses pinned from their specs, the
// ETH/USD price request, the coworker's verdict key and the primary accounts. Keeps the previous deployment as history.
const { abi, bytecode } = artifact();
const { pub, wallet } = clients();
const args = [AIRNODES.nodary.address, AIRNODES.twitter.address, priceRequestHash('ETH/USD'), coworkerSigner().address, DEFAULT_OFFICIAL_ACCOUNTS] as const;
const hash = await wallet.deployContract({ abi, bytecode, args });
const receipt = await pub.waitForTransactionReceipt({ hash });
if (!receipt.contractAddress) throw new Error(`Deployment failed: ${hash}`);
let previous: unknown = null;
try {
  previous = JSON.parse(readFileSync(DEPLOYMENTS, 'utf8')).baseSepolia;
} catch {}
writeFileSync(
  DEPLOYMENTS,
  JSON.stringify(
    {
      baseSepolia: {
        GuardedVault: receipt.contractAddress,
        version: 2,
        deployTx: hash,
        nodaryAirnode: args[0],
        twitterAirnode: args[1],
        priceRequestHash: args[2],
        secondSource: args[3],
        primaryAccounts: args[4],
      },
      history: [previous].filter(Boolean),
    },
    null,
    2
  ) + '\n'
);
logTransaction('Base Sepolia', `https://sepolia.basescan.org/tx/${hash}`, `Deploy GuardedVault v2 at ${receipt.contractAddress}`);
console.log(`GuardedVault v2 ${receipt.contractAddress}\n  tx https://sepolia.basescan.org/tx/${hash}`);
