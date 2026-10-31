# Usage and value

## The problem

Markets now move on headlines faster than people can read them, and more of that reading is done by AI agents. An agent
that acts on a headline inherits every error in it: a misquote, a misattribution, a rumour reported as fact. The
correction usually comes from the primary source, the person or office the headline quotes, and it comes minutes later.

On 7 April 2025 a headline attributed a 90-day tariff pause to Kevin Hassett. The Dow swung about 800 points. About
twenty minutes later the White House said the report was wrong and the rally faded. The information needed to avoid the
loss existed; nothing was checking it before the trade.

## What SecondSource does

Given a headline, SecondSource:

1. buys evidence from primary and near-primary sources: what the official and attributed accounts posted on X, what the
   Benzinga newswire carried, and what the market did around the headline time;
2. checks the signature on every answer before using it;
3. asks a language model to judge only that evidence, through an Airnode, so the judgment is signed as well;
4. returns CONFIRMED, UNCONFIRMED or DENIED, a confidence, short reasoning, the cited evidence and every attestation.

## Who uses it and how

| User | How they use it |
|---|---|
| **Agent builders** | Hire SecondSource as a Sokosumi Coworker, or call the check endpoint, before any order a headline triggered. Act only on CONFIRMED. Keep the result as the audit record. |
| **Trading desks** | Put the check between the news feed and execution. Wire execution to a contract like the Guarded Vault, which refuses to trade without a signed CONFIRMED verdict and a fresh signed price. |
| **Newsrooms** | Check what a quoted account actually posted before running a story, and keep proof even if the post is edited or deleted later. |

## Why signed data is essential here

A fact-check is only as good as its evidence, and the people who most need to rely on it are not in the room when it
is made.

- **Posts disappear.** A tweet is edited or deleted, and a screenshot proves nothing. A TwitterAPI.io response signed by
  its Airnode says what the platform returned, and when.
- **Agents can't take our word for it.** A buyer agent can check every attestation itself: recover the signer, compare
  it with the address in the API's spec, and recompute the request hash from the question. No trust in SecondSource is
  needed for the evidence.
- **Contracts can check it too.** The Guarded Vault verifies a Nodary price attestation on chain with
  `AirnodeV2Attestation.verify`, and checks that SecondSource signed a CONFIRMED verdict. A denied headline cannot
  reach execution, whatever the agent upstream decided.
- **The judgment is a receipt too.** The model's answer comes back through the OpenRouter Airnode, so even the reasoning
  step is attributable and timestamped.

## Value for Cardano, Masumi and Sokosumi

- A real, paid Coworker with a clear unit of work: one check, 1 tUSDM, settled through Masumi escrow.
- The result hash is submitted on Cardano, so a buyer can later prove which verdict it paid for and that it was not
  changed afterwards.
- It composes: other Coworkers, such as trading or research agents, can hire SecondSource as a step in their own Tasks.

## Value for API3 and AirnodeHub

- Five listings used in one product: TwitterAPI.io, Benzinga, TickerLayer, OpenRouter and Nodary.
- Pay-per-call over x402 fits the workload: each check buys only the five answers it needs, for about 0.13 aUSD.
- It shows why signatures matter beyond price feeds: social posts, newswire stories and model output all become
  evidence a third party can verify, on chain or off.
- It is an autonomous agent that discovers, pays for and verifies data by itself.

## Shown working on testnets

- **The pitch case, for real.** Checking "Hassett: Trump considering 90-day tariff pause" at 14:12 UTC on 7 April 2025
  returns DENIED, citing three signed @RapidResponse47 posts from 14:38 to 14:41 UTC, including "Reports that @POTUS
  is considering a 90-day pause on tariffs are FAKE NEWS". Evidence cost: 0.08 aUSD.
- **Cautious when it should be.** The real pause two days later was announced on Truth Social, which no listing covers;
  SecondSource says UNCONFIRMED rather than treating news repetition as confirmation.
- **Paid as a Coworker.** A Sokosumi task paid 1 tUSDM into Masumi escrow, SecondSource ran the check, and the result
  hash was submitted on Cardano Preprod before the task completed.
- **Enforced on chain.** The Guarded Vault on Base Sepolia executed a trade with a CONFIRMED verdict and reverted with
  `VerdictNotConfirmed` on the DENIED Hassett verdict.

Every transaction is listed in [transactions.md](transactions.md) and on https://secondsource-two.vercel.app/receipts.
