# Human steps

Everything below needs a browser, an account or a faucet. Code and config for the rest is already in the repo.
Run commands from the repo root unless a step says otherwise.

## 1. Fund the evidence wallet (unblocks every paid call)

The payer wallet is `0x40C29519D7D6a5DA160e7a371c9fb506E8aC031e` on Base Sepolia. It pays for evidence and also
deploys and calls the Guarded Vault.

1. Create a CDP secret API key at https://portal.cdp.coinbase.com/api-keys/secret and add `CDP_API_KEY_ID` and
   `CDP_API_KEY_SECRET` to `.env`. Then `pnpm faucet` claims Base Sepolia ETH for gas by itself. Alternatively send
   about 0.02 Base Sepolia ETH from any faucet or wallet.
2. Mint aUSD and run the feasibility probe:

   ```sh
   pnpm faucet
   pnpm mint
   pnpm probe
   ```

## 2. Turn on live checks on the website

The site works without this, in replay mode. For live checks, Vercel needs the payer key and a demo key. Run these
yourself; each one prompts for the value, so nothing lands in shell history:

```sh
vercel env add PAYER_PRIVATE_KEY production --sensitive
vercel env add DEMO_KEY production --sensitive
vercel deploy --prod
```

Use the `PAYER_PRIVATE_KEY` value from `.env`. Pick any `DEMO_KEY` and type it into the demo key box on /check.
Anyone with the demo key can spend the wallet's test aUSD, about 0.13 per check.

## 3. Masumi Payment Service (local)

The service is cloned and installed next to this repo in `../masumi-payment-service`, and its `.env` already has a
database URL, an encryption key and an admin key.

1. Start Docker Desktop, then start Postgres:

   ```sh
   docker compose -f masumi/docker-compose.yml up -d
   ```

2. Create a free Preprod project at https://blockfrost.io and copy its key into **both** files:
   - `../masumi-payment-service/.env` as `BLOCKFROST_API_KEY_PREPROD="..."`
   - `.env` as `BLOCKFROST_API_KEY_PREPROD=...`
3. Migrate, seed and start the service:

   ```sh
   cd ../masumi-payment-service
   pnpm run prisma:migrate
   pnpm run prisma:seed
   pnpm run dev
   ```

   The seed prints new wallet mnemonics once. Store them in a password manager, not in the repo.
4. In a second terminal, back in this repo, list the IDs and paste the two lines it prints into `.env`:

   ```sh
   pnpm masumi ids
   ```

5. Fund the selling wallet address that `pnpm masumi ids` printed with test ADA from https://dispenser.masumi.network.
6. Register SecondSource and wait for confirmation. Registration is an on-chain transaction, so it takes a few minutes:

   ```sh
   pnpm masumi register
   pnpm masumi status
   pnpm masumi key
   ```

   Repeat `pnpm masumi status` until it says `RegistrationConfirmed`. The transaction is logged in `docs/transactions.md`.

## 4. Sokosumi Coworker

1. Sign up at https://preprod.sokosumi.com/signup, then log the CLI in. This opens a browser:

   ```sh
   sokosumi --preprod auth login
   sokosumi --preprod auth whoami --json
   ```

2. Create the vendor and the coworker, and connect it to your personal workspace. Keep the IDs each command returns:

   ```sh
   sokosumi --preprod vendors create --name "SecondSource" --slug secondsource-tum26 --json
   sokosumi --preprod coworkers register --vendor-id VENDOR_ID --name "SecondSource" --capability tasks --personal --json
   sokosumi --preprod coworkers connect COWORKER_ID --vendor-id VENDOR_ID --personal --json
   sokosumi --preprod coworkers api-key COWORKER_ID --json | sokosumi --preprod runtime key-import --coworker-id COWORKER_ID --api-key-stdin
   ```

3. Add `COWORKER_ID=...` to `.env`.
4. Add test credits to the workspace at https://preprod.sokosumi.com/billing?tab=credits with the Stripe test card
   4242 4242 4242 4242.

## 5. Run a paid Task end to end

```sh
# in .env: PAID_TASKS_ENABLED=true
pnpm worker
```

In another terminal, create the Task as a buyer would:

```sh
sokosumi --preprod tasks create --personal --coworker-id COWORKER_ID --name "Check a headline" --description "Hassett: Trump considering 90-day tariff pause
asset: indices/US30
at: 2025-04-07T14:12:00Z" --status READY --json
```

The worker quotes 1 tUSDM, waits for escrow, runs the check, submits the result hash on Cardano and completes the
Task. Escrow and result transactions are logged in `docs/transactions.md`.

## 6. Guarded Vault on Base Sepolia (after step 1)

```sh
pnpm vault:deploy
pnpm check "HEADLINE THAT IS TRUE" --out runs/confirmed.json
pnpm vault:trade runs/confirmed.json
pnpm vault:trade runs/hassett.json --send-anyway
```

The first trade goes through. The second, with a DENIED verdict, is refused, and `--send-anyway` puts the revert on chain
so judges can see it.
