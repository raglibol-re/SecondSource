import { existsSync, readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, type Abi, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

export const DEPLOYMENTS = 'contracts/deployments.json';
const ARTIFACT = 'contracts/out/GuardedVault.sol/GuardedVault.json';

export const artifact = () => {
  if (!existsSync(ARTIFACT)) throw new Error('Build the contracts first: cd contracts && forge build');
  const a = JSON.parse(readFileSync(ARTIFACT, 'utf8')) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: a.abi, bytecode: a.bytecode.object };
};

export const vaultAddress = (): Address => {
  if (!existsSync(DEPLOYMENTS)) throw new Error('No vault deployed yet: pnpm vault:deploy');
  return (JSON.parse(readFileSync(DEPLOYMENTS, 'utf8')) as { baseSepolia: { GuardedVault: Address } }).baseSepolia.GuardedVault;
};

// The payer wallet also deploys and trades, so one Base Sepolia account needs ETH for gas.
export const clients = () => {
  const account = privateKeyToAccount(process.env.PAYER_PRIVATE_KEY as Hex);
  const transport = http(process.env.BASE_SEPOLIA_RPC_URL);
  return {
    account,
    pub: createPublicClient({ chain: baseSepolia, transport }),
    wallet: createWalletClient({ chain: baseSepolia, transport, account }),
  };
};
