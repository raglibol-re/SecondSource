# Devfolio entry (copy-ready)

## Project name
SecondSource

## Tagline (≤ 10 words)
Trust the primary source, not the headline.

## Tracks
- Cardano: Agentic Commerce on Cardano
- API3: Any API in your contract

(The TUM Blockchain Track is judged automatically.)

## Links
- Live demo: https://secondsource-two.vercel.app
- Tamper test for judges: https://secondsource-two.vercel.app/vault?run
- Repository: https://github.com/raglibol-re/SecondSource
- Guarded Vault v2 (Base Sepolia): 0x0e9128f550254ed3389330e8134cea8cb09f46b6
- Paid Cardano job (Preprod): escrow b74e743b2848b4919a73c99a814ad92471f5971d4aba15bd1e0ad3cd5fa086f3, result hash
  721423f3f8809c86bd7ae6a3b0127c8454ef1ef1384d89899716b3808ece4879, payout
  665cf3d555452c066826138e7dff9969191a4221331572ca9f389c5a717bd877
- Paid x402 request on Cardano Preprod: 7616f0a56d346e068d7af71f167ef8cbee8e12dc63eef3acec5cd8d0ba29cc44
- Demo video: (add link)

## The problem it solves

On 7 April 2025 at 10:12 New York, a headline said Trump was considering a 90-day tariff pause. The Dow swung about 800
points in minutes. About twenty minutes later the White House's own account said "Wrong. Fake News.", and the rally
faded. Trading agents that bought the headline lost money. The correction existed, on the primary source's account, but
nothing checked it before the order.

AI agents now read and act on news faster than any person, and they inherit every misquote and rumour. SecondSource is
the coworker they hire first. Given a headline, it buys evidence from primary sources, has a model judge only that
evidence, and answers CONFIRMED, UNCONFIRMED or DENIED with a receipt for every step. For the Hassett headline it answers
DENIED, citing three signed posts by @RapidResponse47.

Who uses it:
- **Agent builders** call it before any order a headline triggered, and keep the result as their audit trail.
- **Trading desks** wire execution to a vault that refuses to trade without a verified primary source.
- **Newsrooms** check what a quoted account really posted, with proof that survives deletion.

## What we built and how it works

0. **Plan.** You ask in plain words ("Did Hassett really say Trump is pausing tariffs? 7 April, 10:12 New York"). A model,
   asked through the OpenRouter Airnode so the plan is signed, works out the claim, the time in UTC, the primary
   accounts that would confirm or deny it (for "Apple buying Disney" it chose @Apple, @Disney, @tim_cook and
   @RobertIger), search words and the market to watch. It tells you its plan in the chat.
1. **Buy evidence.** SecondSource pays per call over x402 in aUSD on Base Sepolia for AirnodeHub data. It gets X posts
   from the primary accounts and top posts about the claim (TwitterAPI.io), the Benzinga newswire, and market bars
   (TickerLayer). For news it adds what established newsrooms report (LunarCrush topic news, Finnhub market and company
   news) and, for a US-listed company, its SEC filings. Undated questions ("was Binance hacked recently?") look back a
   week. Every answer is signed by the Airnode that served it, and every signature is verified before use: expected
   signer, exact request, fresh timestamp.
2. **Judge.** A model reads only that evidence, through the OpenRouter Airnode, so the judgment is signed too. Citations
   are enforced, and a verdict without valid citations is downgraded. An official denial beats everything; two or
   more independent newsrooms reporting an event as fact can confirm it, capped at 80%. On 31 Oct, "Was Binance hacked
   recently?" came back CONFIRMED, citing CNBC, Cointelegraph, Fox Business and ABC News.
3. **Get paid on Cardano.** Two ways:
   - a Sokosumi task through Masumi escrow (1 tUSDM): the result hash goes on chain, then SecondSource collects;
   - a direct request over x402 on Cardano Preprod (2 tADA, no account, no key);
   - from the browser: connect Eternl or Lace once in the wallet bar, then "Ask and pay 2 tADA";
   - and for anyone with an EVM wallet: the same endpoint takes 0.10 USDC on Base Sepolia over x402, signed in the
     wallet with no gas ("Connect EVM wallet", then "Ask and pay 0.10 USDC" on the check page).

   Payment is tied to the result. x402 settles only after a successful check, and the escrow refunds if no result is
   delivered. If the payment service times out after the buyer paid, the verdict is still delivered, so a buyer never
   pays without getting the answer. Every payment shows a receipt: amount, from, to, network, transaction, status.
4. **Enforce on chain.** The Guarded Vault on Base Sepolia trades only with three proofs:
   - a Nodary ETH/USD price signed in the last 60 seconds;
   - a post by a primary account, signed by the TwitterAPI.io Airnode, whose request hash the contract **rebuilds from
     the post id**;
   - a CONFIRMED verdict that commits to that post.

   SecondSource can misjudge, but it can't invent a White House post. Anyone holding a signed primary-source denial
   can halt the vault for an hour, so one agent's check protects every agent. An autonomous watchdog does exactly that:
   it pays for evidence each cycle and halts the vault when a primary account denies a rumour.

**Who relies on the data, and what goes wrong if it is forged.** Trading agents and the vault rely on the posts and the
price. A forged post would let a rumour trade as fact or freeze trading for everyone. A forged or stale price would
mis-size the trade. The vault rejects all of these on chain: edited value, stale response, response to a different
request, wrong signer. The tamper test on our site shows each one with its own revert reason.

**Data we wanted but could not find on AirnodeHub.** Truth Social posts (the real 90-day pause was announced there),
official press-release feeds such as whitehouse.gov, the text of SEC filings (Finnhub gives only metadata and links), and intraday minute bars for older dates.

**How it runs in real use.** Agents call the x402 endpoint per headline (about 13 cents of evidence, 60 to 90 seconds
including Cardano settlement), or hire SecondSource on Sokosumi. Desks point execution at a vault like ours with their
own primary-account list. The watchdog runs continuously next to the vault.

## Challenges we ran into
- **The OpenRouter Airnode returned an upstream 403 for every paid model.** We found that free models still worked
  through the same Airnode, so the judgment stays signed. We built a model fallback list, plus fixed published rules as
  a last resort that mark the judgment as unsigned.
- **Historical data.** Benzinga's topic filter didn't filter (it returned the whole feed), so we buy the day's newswire
  and select stories locally. TickerLayer keeps only hourly bars for April 2025.
- **Proving the primary source on chain.** Rebuilding the AirnodeHub request hash in Solidity, from canonical JSON,
  sorted entries and the projection, had to match the Airnode byte for byte. Foundry and TypeScript tests pin it to real
  signed responses.
- **Distinct tamper reasons.** A signature only says "not this key". We order the checks (request, then claimed signer,
  then expected signer, then age) so every tamper case reverts with its own error.
- **Cardano x402 on serverless.** We adapted the Cardano Foundation's Express x402 template to Vercel's Web Request
  handlers, settling only after the check succeeds.
- **Masumi setup details.** Placeholder values in the payment service's example config broke seeding. Empty
  collection addresses made the payment service reject quotes. Sokosumi needs an organization workspace before a vendor
  exists.

## Technologies used
TypeScript, Node.js 24, Solidity, Foundry, viem, OpenZeppelin, Solady, API3 AirnodeHub (Airnode v2 attestations,
`AirnodeV2Attestation`, `ProjectedJson`), x402 (`@x402/fetch`, `@x402/evm`, `@x402/cardano`, `@x402/core`), Base
Sepolia, Cardano Preprod, Masumi (Payment Service, registry, escrow), Sokosumi (CLI, coworker runtime), Blockfrost,
Cardano Foundation x402 facilitator, Evolution SDK, OpenRouter, TwitterAPI.io, Benzinga, TickerLayer, Nodary,
Coinbase CDP faucet, Vercel, Docker, PostgreSQL.

## Cardano tools used
Masumi Payment Service (escrow, registry, result-hash submission), Sokosumi (coworker, tasks, runtime), `@x402/cardano`
with the Cardano Foundation facilitator, Evolution SDK wallets, Blockfrost, the Masumi dispenser.

## What's next
- More primary sources as AirnodeHub listings: press-release feeds, regulators, company investor-relations accounts.
- Per-market vaults with their own primary-account lists, and halts scoped per asset.
- Hosting the Sokosumi worker and the payment service, plus a public watchdog that any vault can subscribe to.
