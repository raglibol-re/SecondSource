import { writeFileSync } from 'node:fs';
import { logTransaction } from '../airnode/client.ts';
import { artifact, clients, DEPLOYMENTS } from './chain.ts';
import { priceRequestHash } from './nodary.ts';
import { coworkerSigner } from './verdict.ts';

// Deploys GuardedVault to Base Sepolia with the ETH/USD Nodary request hash and the coworker's verdict key.
const { abi, bytecode } = artifact();
const { pub, wallet } = clients();
const args = [priceRequestHash('ETH/USD'), coworkerSigner().address] as const;
const hash = await wallet.deployContract({ abi, bytecode, args });
const receipt = await pub.waitForTransactionReceipt({ hash });
if (!receipt.contractAddress) throw new Error(`Deployment failed: ${hash}`);
writeFileSync(
  DEPLOYMENTS,
  JSON.stringify({ baseSepolia: { GuardedVault: receipt.contractAddress, deployTx: hash, priceRequestHash: args[0], secondSource: args[1] } }, null, 2) + '\n'
);
logTransaction('Base Sepolia', `https://sepolia.basescan.org/tx/${hash}`, `Deploy GuardedVault at ${receipt.contractAddress}`);
console.log(`GuardedVault ${receipt.contractAddress}\n  tx https://sepolia.basescan.org/tx/${hash}\n  priceRequestHash ${args[0]}\n  secondSource ${args[1]}`);
