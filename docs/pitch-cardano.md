# Booth pitch: Cardano (2:30)

Cardano judges look for: a paid workflow from start to finish, technical execution with Cardano tools, user
experience, real-world impact, a clear customer and journey, payment tied to the result, and agents hiring agents.

## 0:00 to 0:25, the customer and the job
> "Our customer is anyone running a trading agent. The job: before acting on a headline, find out whether the primary
> source backs it. On 7 April 2025 a fake tariff-pause headline moved the Dow 800 points; the White House denied it 20
> minutes later. An agent would pay a few cents to know that first."

## 0:25 to 1:30, one paid job, live
Tab `/check`: "Connect Cardano wallet" (Eternl on preprod), type the question, "Ask and pay 2 tADA", or hand the judge
the laptop to pay from theirs. The payment receipt appears with the Cardanoscan link. While the agent works (about 60 to 90 s), switch to `/receipts`, "A paid Sokosumi task".
> "Two ways to hire SecondSource on Cardano. On Sokosumi: the buyer creates a task, Masumi locks 1 tUSDM in escrow, our
> worker runs the check, submits the result hash on chain, completes the task, and collects. Here are all three
> transactions: escrow, result hash, payout."

Click each Cardanoscan link. Then the terminal take of `pnpm x402:buy`:
> "Or any agent, no account: an HTTP 402, a 2-tADA payment on Cardano Preprod through the Cardano Foundation
> facilitator, and the signed answer. It settles only after the check succeeded, so the agent pays only for work that
> passed."

## 1:30 to 2:05, why it matters
> "Inside each job, SecondSource hires up to seven data sources itself and pays them over x402: agents hiring agents. The
> answer is DENIED, with the White House's own posts, each signed by an Airnode. And our vault on Base won't trade
> without that primary source verified on chain."

## Business case (for questions)
- **Who pays:** teams running trading agents and copy-trading bots, per question, with no account: an x402 call.
- **Unit economics:** one investigation buys 7 to 10 signed answers for about 0.20 to 0.30 aUSD of data. The price,
  2 tADA or 0.10 USDC, covers that with margin; data cost falls as more questions share cached primary-source posts.
- **Why pay after delivery matters:** an agent can hire an unknown agent safely. If SecondSource fails, the x402
  payment is never settled and Masumi escrow refunds; the buyer risks nothing for a failed job.
- **Why it's worth it:** one avoided trade on a fake headline (the April 2025 swing was 800 Dow points) pays for
  thousands of checks.

## 2:05 to 2:30, beyond the hackathon
> "It runs as a service today: an x402 endpoint on Vercel, a coworker on Sokosumi, registered on Masumi. Next: more
> primary sources, per-market vaults, and a hosted worker. Trust the primary source, not the headline."

## Likely questions

| Question | Show |
|---|---|
| Where is the paid job's transaction? | README "For judges": escrow `b74e743b…`, result hash `721423f3…`, payout `665cf3d5…`; `masumi/sokosumi.json` |
| How is payment tied to the result? | `src/x402/seller.ts` (`sellWithX402` settles after the handler succeeds); `src/coworker/paid.ts` (result hash before completion; escrow refunds if no result) |
| Which Cardano tools did you use? | Masumi Payment Service, registry (`pnpm masumi status`, tx `c92eccbf…`), Sokosumi CLI and runtime (`src/coworker/worker.ts`), `@x402/cardano` with the CF facilitator, Blockfrost |
| Can I hire it myself now? | `curl -i -X POST https://secondsource-two.vercel.app/api/x402/check …` → HTTP 402 with `cardano:preprod`; then `pnpm x402:buy "…"` |
| What happens if the check fails mid-job? | x402: not settled, so not charged (`api/x402/check.ts` returns 502 without settling). Masumi: no result hash, so the escrow refunds after `submitResultTime` |
