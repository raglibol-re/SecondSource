import { createPublicClient, createWalletClient, formatUnits, http, parseAbi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { logTransaction } from '../airnode/client.ts';
import { AUSD_ADDRESS } from '../airnode/x402.ts';

// Mints whatever the aUSD faucet still allows this account, via mintFromFaucet(uint256). Needs Base Sepolia ETH for gas.
const abi = parseAbi([
  'function mintFromFaucet(uint256 amount)',
  'function faucetLimit() view returns (uint256)',
  'function faucetMintedAmount(address account) view returns (uint256)',
]);
const account = privateKeyToAccount(process.env.PAYER_PRIVATE_KEY as Hex);
const transport = http(process.env.BASE_SEPOLIA_RPC_URL);
const pub = createPublicClient({ chain: baseSepolia, transport });
const wallet = createWalletClient({ chain: baseSepolia, transport, account });
const [limit, minted] = await Promise.all([
  pub.readContract({ address: AUSD_ADDRESS, abi, functionName: 'faucetLimit' }),
  pub.readContract({ address: AUSD_ADDRESS, abi, functionName: 'faucetMintedAmount', args: [account.address] }),
]);
const amount = limit - minted;
console.log(`faucetLimit ${formatUnits(limit, 6)} aUSD, already minted ${formatUnits(minted, 6)}`);
if (amount <= 0n) process.exit(0);
const hash = await wallet.writeContract({ address: AUSD_ADDRESS, abi, functionName: 'mintFromFaucet', args: [amount] });
const receipt = await pub.waitForTransactionReceipt({ hash });
console.log(`Minted ${formatUnits(amount, 6)} aUSD: ${receipt.status} https://sepolia.basescan.org/tx/${hash}`);
logTransaction('Base Sepolia', `https://sepolia.basescan.org/tx/${hash}`, `Mint ${formatUnits(amount, 6)} aUSD from faucet`);
