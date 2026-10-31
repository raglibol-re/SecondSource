# Demo script (2 minutes)

Before going on stage:

- Open these tabs in light mode (the toggle is in the top bar):
  1. https://secondsource-two.vercel.app
  2. https://secondsource-two.vercel.app/check?replay=hassett-2025-04-07 (reload it right before showing; it plays itself)
  3. https://secondsource-two.vercel.app/verify
  4. https://secondsource-two.vercel.app/receipts
- Open a terminal in the repo with `.env` in place.
- Check the evidence wallet: `pnpm wallet:balance` should show at least 0.2 aUSD.

## 0:00 to 0:20, the loss

Tab 1. Let the DENIED stamp land on the headline.

> "7 April 2025, 10:12 New York. This headline hits the wires. The Dow swings about 800 points. About twenty minutes
> later the White House says it's wrong, and the rally fades. Agents that bought the headline are holding the loss."

## 0:20 to 0:35, the naive agent

Terminal:

```sh
pnpm agent "Hassett: Trump considering 90-day tariff pause" --naive
```

> "This agent reads the headline and buys. Nothing between the news and the order."

## 0:35 to 1:15, the same agent hires SecondSource

Tab 2 plays the recorded check: four receipts arrive, then the stamp.

> "Now the agent hires SecondSource first. It pays per call over x402 on AirnodeHub: X posts from the White House
> accounts, the Benzinga newswire, the Dow's price bars. Each answer is signed by the Airnode that served it, and
> SecondSource checks every signature before using it."

Scroll to the evidence and point at the three cited posts, 14:38 to 14:41 UTC.

> "Twenty-six minutes after the headline, the White House's own account: 'Wrong. Fake News.' Signed, timestamped,
> paid for. Verdict: denied by the primary source, for eight cents of evidence."

## 1:15 to 1:35, don't trust us

Tab 3: Use my last check, then Verify signatures: VALID. Load a real example, Tamper with it, Verify: INVALID.

> "Anyone can check these receipts. Change one character and the signature fails."

## 1:35 to 2:00, the vault and the money

Terminal:

```sh
pnpm agent "Hassett: Trump considering 90-day tariff pause" --asset indices/US30 --at 2025-04-07T14:12:00Z
```

It takes about 20 seconds and ends with `BLOCKED: the vault refused: VerdictNotConfirmed(3)` and a Base Sepolia link.

> "If the agent tries to trade anyway, the vault refuses on chain: it needs a fresh Nodary price signed by its Airnode
> and a CONFIRMED verdict signed by SecondSource."

Tab 4, On chain section: the vault, the Masumi registration, and the paid Sokosumi task with its escrow and result-hash
transactions on Cardano.

> "SecondSource is a Masumi Coworker that gets paid in escrow on Cardano and pays for its own signed evidence on API3.
> Every step has a receipt."

## Questions you may get

- **Why is the judgment not signed?** The OpenRouter Airnode returned an upstream 403 for every model during the
  hackathon, and it is the only language-model listing. Failed calls are not charged. SecondSource then applies fixed,
  published rules (`src/judge/rules.ts`) to the signed evidence and says so in the result. With OpenRouter back, the
  model's signed judgment is used automatically.
- **Why is the real pause on 9 April UNCONFIRMED?** It was announced on Truth Social, which no AirnodeHub listing
  covers, and the White House X accounts only discussed it. Repetition is not confirmation, so SecondSource stays
  cautious. That check is on /check too.
- **What did a paid task look like?** /receipts, "A paid Sokosumi task": 1 tUSDM locked, result hash submitted on
  Cardano, task completed.

## If something breaks

- No network or no aUSD: stay on tab 2. Replays are free and the receipts still verify.
- The vault call is slow: show the earlier allowed and refused vault transactions on /receipts.
