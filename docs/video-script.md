# Demo video (≤ 2:30)

Record in light mode at 1920×1080. Prepare everything in `docs/booth-setup.md` first. Two takes need waiting time: the
x402 job (about 60 to 90 s) and the agent's trade (about 20 s). Record those beforehand and cut them to their beginning
and end, or speed them up and show a visible timer.

## 0:00 to 0:20, the problem and the user
**Screen:** https://secondsource-two.vercel.app, the DENIED stamp landing on the headline.

> "7 April 2025, 10:12 New York: 'Hassett: Trump considering a 90-day tariff pause.' The Dow swings 800 points. Twenty
> minutes later the White House says it's fake, and the rally fades. Trading agents that bought the headline lost money.
> SecondSource is the coworker those agents hire first."

## 0:20 to 0:45, two questions, two verdicts
**Screen:** tab `/check?replay=binance-hack-2026-10-31`: the plan grouped by source, the signed receipts ticking in,
the green CONFIRMED card with CNBC, Cointelegraph and The Independent as cards.
> "Ask in plain words. 'Was Binance hacked recently?' The agent plans where to look, and the plan itself is signed. It
> buys evidence over x402 on API3's AirnodeHub: Binance's own accounts, X, the newswires, newsrooms through LunarCrush
> and Finnhub. Every answer is signed by its Airnode and checked. Confirmed: independent newsrooms report it, and no
> Binance account disputes it."

**Screen:** tab `/check?replay=hassett-agent-2025-04-07`, the red DENIED stamp.
> "Same agent, the tariff headline: denied, citing the White House's own signed posts. 'Wrong. Fake News.' An
> official denial beats any number of outlets repeating a story."

## 0:45 to 1:15, a paid question on Cardano, start to finish
**Screen:** `/check`, wallet bar: "Connect Cardano wallet" (Eternl on preprod), the address and tADA balance appear.
Type a question, "Ask and pay 2 tADA", sign in Eternl. Cut the wait. Show the payment receipt: 2 tADA, from, to,
Cardano Preprod, the transaction link, "Paid", then the verdict below it. Click the Cardanoscan link.
(Pre-recorded fallback: `pnpm x402:buy --question "Is it true that Binance was hacked recently?"`, which settled
`30a21c79…` on 31 Oct.)
> "Connect a wallet, ask, sign once. The payment is verified up front but settles only after the verdict exists, so
> you pay for delivered work, and here's the receipt with the transaction on Cardano. Inside that one job SecondSource
> paid seven data sources over x402 itself: agents paying agents."

**Screen:** `/receipts`, "A paid Sokosumi task": escrow locked, result hash, payout.
> "The same job through Sokosumi: escrow funded, result hash on Cardano, then payout to SecondSource."

## 1:15 to 1:50, the contract checks the primary source itself
**Screen:** terminal (pre-recorded take).
```sh
pnpm vault:act public/runs/shipbuilding-2025-04-09.json
```
Show: `DONE: executeTrade on CONFIRMED citing @WhiteHouse post …`, then open the BaseScan link and its logs.
> "Our Guarded Vault trades only with three proofs: a fresh Nodary price, a post by a primary account signed by the
> TwitterAPI.io Airnode, with the request hash rebuilt on chain from the post id, and our verdict citing that post. We
> can misjudge, but we can't invent a White House post."

**Screen:** BaseScan, the `haltOnDenial` transaction's `TradingHaltedBy` event, with the text ".@PressSec: Reports that
@POTUS is considering a 90-day pause on tariffs are FAKE NEWS".
> "And a signed denial halts the vault for every agent. Our watchdog does that on its own, cycle after cycle."

## 1:50 to 2:20, proof: the tamper test
**Screen:** `/vault?run` (or `pnpm tamper-test` in the terminal).
> "API3's tamper test, against the deployed contract. A valid, fresh response: accepted. One value edited:
> SignatureMismatch. Too old: PriceResponseTooOld. A response to a different request: WrongRequest. Signed by another
> key: UnexpectedAirnode. One accepted, four rejected, four reasons."

## 2:20 to 2:30, what's next
**Screen:** home page.
> "Next: more primary sources on AirnodeHub, per-market vaults, and a public watchdog. SecondSource: trust the primary
> source, not the headline."
