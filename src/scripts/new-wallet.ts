import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

// Writes a fresh key into .env under the given name (default PAYER_PRIVATE_KEY) and prints only its address.
const NAME = process.argv[2] ?? 'PAYER_PRIVATE_KEY';
const env = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
if (!/^[A-Z_]+$/.test(NAME)) throw new Error('Key name must be upper case, e.g. COWORKER_SIGNER_KEY');
const existing = new RegExp(`^${NAME}=(0x[0-9a-fA-F]{64})\\s*$`, 'm').exec(env)?.[1];
if (existing) {
  console.log(`${NAME} already set. Address: ${privateKeyToAccount(existing as `0x${string}`).address}`);
} else {
  const key = generatePrivateKey();
  appendFileSync('.env', `${env && !env.endsWith('\n') ? '\n' : ''}${NAME}=${key}\n`);
  console.log(`New ${NAME} written to .env. Address: ${privateKeyToAccount(key).address}`);
}
