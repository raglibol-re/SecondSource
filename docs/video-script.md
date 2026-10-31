# Demo video (≤ 2:30)

Record in light mode at 1920×1080. Prepare everything in `docs/booth-setup.md` first. Two takes need waiting time: the
x402 job (about 60 to 90 s) and the agent's trade (about 20 s). Record those beforehand and cut them to their beginning
and end, or speed them up and show a visible timer.

## 0:00 to 0:20, the problem and the user
**Screen:** https://secondsource-two.vercel.app, the DENIED stamp landing on the headline.

> "7 April 2025, 10:12 New York: 'Hassett: Trump considering a 90-day tariff pause.' The Dow swings 800 points. Twenty
> minutes later the White House says it's fake, and the rally fades. Trading agents that bought the headline lost money.
> SecondSource is the coworker those agents hire first."

## 0:20 to 0:40, the naive agent versus SecondSource
**Screen:** terminal.
```sh
pnpm agent "Hassett: Trump considering 90-day tariff pause" --naive
```
> "This agent buys on the headline. Nothing in between."

**Screen:** tab `/check?replay=hassett-agent-2025-04-07`: the question in plain words, the agent's plan (accounts, search
words, 14:12 UTC), the receipts arriving, then the stamp. (Live alternative: type the question and click "Pay 2 tADA with
a Cardano wallet" in Eternl.)
> "You ask in plain words. The agent plans where the primary source would speak, and the plan itself is signed. It
> buys evidence over x402 on API3's AirnodeHub: posts from the White House accounts, the Benzinga
> newswire, Dow price bars. Each answer is signed by its Airnode and checked. A model judges only that evidence, also
> through an Airnode. Verdict: denied. It cites the White House's own posts: 'Wrong. Fake News.'"

## 0:40 to 1:15, a paid job on Cardano, start to finish
**Screen:** terminal (pre-recorded take, trimmed).
```sh
pnpm x402:buy "Hassett: Trump considering 90-day tariff pause" --asset indices/US30 --at 2025-04-07T14:12:00Z
```
Show: `HTTP 402 Payment Required`, "Paying 2 tADA…", `HTTP 200`, `DENIED (95%)`, `Paid: preprod.cardanoscan.io/…`.
> "Any agent can hire it with no account: a 402, a 2-tADA payment on Cardano Preprod, the signed answer. Payment
> settles only if the check succeeded. Inside that one job, SecondSource paid five Airnodes over x402 itself: agents
> paying agents."

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
