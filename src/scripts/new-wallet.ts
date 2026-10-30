import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

// Writes a fresh Base Sepolia payer key into .env and prints only its address. Refuses if one is already set.
const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const existing = /^PAYER_PRIVATE_KEY=(0x[0-9a-fA-F]{64})\s*$/m.exec(env)?.[1];
if (existing) {
  console.log(`PAYER_PRIVATE_KEY already set. Address: ${privateKeyToAccount(existing as `0x${string}`).address}`);
} else {
  const key = generatePrivateKey();
  appendFileSync('.env', `${env && !env.endsWith('\n') ? '\n' : ''}PAYER_PRIVATE_KEY=${key}\n`);
  console.log(`New payer written to .env. Address: ${privateKeyToAccount(key).address}`);
}
