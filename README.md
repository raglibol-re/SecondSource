# SecondSource

**A coworker that AI trading agents hire before acting on a headline.** It checks the claim against signed primary
sources and returns `CONFIRMED`, `UNCONFIRMED` or `DENIED`, with a receipt for every step.

Live site: https://secondsource-two.vercel.app

On 7 April 2025 at 10:12 New York, a headline said Trump was considering a 90-day tariff pause. The Dow swung about 800
points. Roughly twenty minutes later the White House said the report was wrong, and the rally faded. An agent that
traded on the headline lost money. SecondSource would have answered: denied by the primary source.

Built for two tracks at the TUM Blockchain Hackathon 2026:

- **Cardano, Masumi and Sokosumi:** an AI Coworker that gets paid, two ways. Through Masumi escrow in a Sokosumi task
  (1 tUSDM per check, result hash submitted on chain), or per request over x402 on Cardano Preprod (2 tADA, no account
  and no key).
- **API3 AirnodeHub:** every input is bought per call over x402 in aUSD on Base Sepolia, and every response is signed by
  the Airnode that served it. The judgment itself comes from OpenRouter through an Airnode, so it is signed too. The
  Guarded Vault verifies a Nodary price attestation on chain.

## How it works

```mermaid
sequenceDiagram
    autonumber
    participant B as Buyer (agent or person in Sokosumi)
    participant M as Masumi escrow (Cardano Preprod)
    participant S as SecondSource coworker
    participant H as AirnodeHub (x402, Base Sepolia)
    participant V as Guarded Vault (Base Sepolia)
    B->>S: Task: headline, optional source, market, time
    S->>M: Quote 1 tUSDM (Masumi Payment Service)
    B->>M: Lock 1 tUSDM in escrow
    par Evidence, each paid over x402 in aUSD
        S->>H: TwitterAPI.io searchTweets (official accounts)
        S->>H: TwitterAPI.io searchTweets (keywords)
        S->>H: Benzinga news
        S->>H: TickerLayer 5-minute bars
    end
    H-->>S: Signed responses (EIP-191)
    Note over S: Verify each one: signer = Airnode address from its spec,<br/>requestHash = hash of what we asked, timestamp fresh
    S->>H: OpenRouter chatCompletion with the evidence
    H-->>S: Signed judgment
    S->>M: Submit result hash on chain
    S-->>B: Verdict, reasoning, cited evidence, all attestations
    B->>V: executeTrade(signed Nodary price, signed verdict)
    Note over V: Reverts unless the price is Nodary-signed and under 60 s old<br/>and the verdict is signed by SecondSource and CONFIRMED
```

```mermaid
flowchart LR
    subgraph Vercel["Vercel: one project"]
        P["/ pitch page"] --- C["/check live and replay"] --- VR["/verify"] --- R["/receipts"]
        A1["api/check"] --- A2["api/verify"] --- A3["api/status"]
    end
    subgraph Local["Operator machine"]
        W["pnpm worker: Sokosumi coworker"] --> MPS["Masumi Payment Service + Postgres"]
    end
    A1 & W --> CHK["check(): src/check.ts"]
    CHK --> AH["AirnodeHub listings"]
    MPS --> CA["Cardano Preprod"]
    AH --> BS["Base Sepolia: x402 settlement"]
    VT["pnpm vault:trade"] --> GV["GuardedVault.sol"]
```

## Hire it over x402 on Cardano

Any agent can buy a check without an account. An unpaid request gets HTTP 402 with the payment requirements; the agent
pays 2 tADA on Cardano Preprod through the Cardano Foundation's x402 facilitator and retries. The check runs before
the payment settles, so a failed check is not charged.

```sh
curl -i -X POST https://secondsource-two.vercel.app/api/x402/check \
  -H 'Content-Type: application/json' \
  -d '{"headline":"Hassett: Trump considering 90-day tariff pause","asset":"indices/US30","publishedAt":"2025-04-07T14:12:00Z"}'
# HTTP 402, PAYMENT-REQUIRED: cardano:preprod, 2000000 lovelace

pnpm x402:wallet --fund     # a demo buyer wallet, funded from the Masumi dispenser
pnpm x402:buy "Hassett: Trump considering 90-day tariff pause" --asset indices/US30 --at 2025-04-07T14:12:00Z
```

One purchase uses x402 twice: the buyer pays SecondSource on Cardano, and SecondSource pays its five evidence sources on
Base Sepolia. The first one settled on Preprod in
[this transaction](https://preprod.cardanoscan.io/transaction/8bfdab7fbee258bc89c08ba49539bd0ce176cf366baeed633bbee12d9632f629).

## Repository

| Path | What it is |
|---|---|
| `src/airnode/` | Request hashing, attestation verification, the x402 paying client, pinned signer addresses. Adapted from the API3 starter (MIT). |
| `src/evidence/` | Builds the TwitterAPI.io, Benzinga and TickerLayer requests and turns signed responses into evidence lines. |
| `src/judge/` | The signed OpenRouter judgment and the rules that keep it honest. |
| `src/check.ts` | `check(input) => { verdict, confidence, reasoning, citations, evidence, attestations, resultHash }` |
| `src/coworker/` | The Sokosumi worker, the Masumi paid-task flow and the registry script. Ported from Masumi's reference worker. |
| `src/vault/` | Verdict signing, vault deploy and trade scripts. |
| `contracts/` | Foundry project: `GuardedVault.sol` and its tests. |
| `api/`, `public/` | The Vercel functions and the website. |
| `docs/` | Transactions, usage and value, demo script, setup steps. |

## Run it

Node 24, pnpm and, for the contracts, Foundry.

```sh
pnpm install
pnpm test                 # 32 tests: attestation verification, pipeline, fallback judge, coworker, vault encoding
pnpm contracts:test       # 13 Foundry tests for GuardedVault
pnpm wallet:new           # creates the Base Sepolia payer key in .env and prints its address
pnpm mint                 # mints aUSD from the faucet (needs Base Sepolia ETH for gas)
pnpm check "Hassett: Trump considering 90-day tariff pause" --asset indices/US30 --at 2025-04-07T14:12:00Z
pnpm worker               # the Sokosumi coworker
```

`docs/setup-human-steps.md` lists every step that needs an account, a faucet or a browser.

## Environment variables

| Name | Used by | Purpose |
|---|---|---|
| `PAYER_PRIVATE_KEY` | CLI, worker, `api/check`, vault scripts | Base Sepolia account that pays x402 calls in aUSD and sends vault transactions |
| `BASE_SEPOLIA_RPC_URL` | balance, mint, vault | Optional RPC override |
| `DEMO_KEY` | `api/check` | Gate for live checks on the public site |
| `JUDGE_MODELS` | judge | Comma-separated OpenRouter model ids, tried in order. Default `anthropic/claude-sonnet-5,nvidia/nemotron-3-ultra-550b-a55b:free,google/gemma-4-31b-it:free` |
| `COWORKER_SIGNER_KEY` | vault | Key the coworker signs verdicts with for the vault |
| `COWORKER_ID`, `PAID_TASKS_ENABLED` | worker | Sokosumi coworker and paid mode |
| `MPS_URL`, `MPS_ADMIN_KEY`, `MPS_RUNTIME_TOKEN`, `MPS_WALLET_ID`, `MPS_SOURCE_ID` | worker, registry | Masumi Payment Service |
| `BLOCKFROST_API_KEY_PREPROD` | Masumi Payment Service | Cardano Preprod access |

Keys live in `.env`, which is gitignored. Testnets only.

## Results so far

| What | Result |
|---|---|
| Hassett headline, 7 April 2025 | **DENIED**. Cites three signed @RapidResponse47 posts from 14:38 to 14:41 UTC, including "Reports that @POTUS is considering a 90-day pause on tariffs are FAKE NEWS". [Replay it](https://secondsource-two.vercel.app/check?replay=hassett-2025-04-07) |
| Shipbuilding executive order, 9 April 2025 | **CONFIRMED** by a signed @WhiteHouse post. The Guarded Vault executed the trade. |
| 90-day pause, 9 April 2025 | **CONFIRMED** from Treasury Secretary Bessent's words ("We've given 90 days") as posted by @RapidResponse47. |
| Guarded Vault | Deployed on Base Sepolia at `0x20b22351f91612015417965c8f43d22e85174ea8`. One allowed trade and one on-chain revert with `VerdictNotConfirmed`. |
| x402 on Cardano | A buyer agent paid 2 tADA and received the signed DENIED check for the Hassett headline ([tx](https://preprod.cardanoscan.io/transaction/8bfdab7fbee258bc89c08ba49539bd0ce176cf366baeed633bbee12d9632f629)). |
| Masumi | Registered on Cardano Preprod. Two paid Sokosumi tasks ran end to end. The latest: 1 tUSDM locked in escrow ([tx](https://preprod.cardanoscan.io/transaction/b74e743b2848b4919a73c99a814ad92471f5971d4aba15bd1e0ad3cd5fa086f3)), check returned DENIED with a signed model judgment, result hash submitted on chain ([tx](https://preprod.cardanoscan.io/transaction/721423f3f8809c86bd7ae6a3b0127c8454ef1ef1384d89899716b3808ece4879)), task completed. |

All transactions are listed in [docs/transactions.md](docs/transactions.md).

**Judge models:** during the hackathon the OpenRouter Airnode refused paid models with an upstream 403 but served free ones, so the judge tries `anthropic/claude-sonnet-5` first and falls back to `nvidia/nemotron-3-ultra-550b-a55b:free`. Refused calls are not charged. All recorded checks carry a signed model judgment. If no model answers at all, fixed published rules (`src/judge/rules.ts`) decide over the signed evidence and the result says the judgment is unsigned.

## Trust model

- Every evidence response is checked before use: the recovered signer must equal the Airnode address published in that
  listing's spec, the request hash must equal the hash of the request we sent, and the signature must be under five
  minutes old.
- The judge only sees signed evidence. Citations that do not exist are dropped, and a CONFIRMED or DENIED verdict
  without a valid citation is downgraded to UNCONFIRMED.
- The result hash covers the input, the verdict and every attestation, so a buyer can check later that nothing changed.
- The vault binds the verdict signature to its chain and address, refuses anything but CONFIRMED, and accepts each
  verdict once.

## Transactions

See [docs/transactions.md](docs/transactions.md) and the site's Payments and signers page.
