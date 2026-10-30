# Demo script (2 minutes)

Open https://secondsource-two.vercel.app in light mode (toggle in the top bar), with the /check, /verify and /receipts
pages ready in other tabs, and a terminal in the repo.

## 0:00 to 0:20, the loss

Home page. Let the DENIED stamp land on the headline.

> "7 April 2025, 10:12 New York. This headline hits the wires. The Dow swings about 800 points. About twenty minutes later
> the White House says it's wrong, and the rally fades. Agents that bought the headline are holding the loss."

## 0:20 to 0:40, the naive agent

Terminal: `pnpm agent "Hassett: Trump considering 90-day tariff pause" --naive`

> "This agent reads the headline and buys. Nothing between the news and the order."

## 0:40 to 1:20, the same agent hires SecondSource

/check, Recorded checks tab, replay the Hassett check. Or, with the demo key, run it live with the Hassett preset.

> "Now the agent hires SecondSource first. It pays per call over x402 on AirnodeHub: X posts from the White House
> accounts, the Benzinga newswire, the Dow's 5-minute bars. Each answer is signed by the Airnode that served it, and
> SecondSource checks every signature before using it. A model judges the evidence, also through an Airnode, so the
> judgment is signed too."

Point at a receipt: signer, payment link on Base Sepolia, then at the verdict and the cited post.

> "Verdict: denied by the primary source. Thirteen cents of evidence."

## 1:20 to 1:40, don't trust us

/verify, Use my last check, Verify signatures: all VALID. Load the example, Tamper with it, Verify: INVALID.

> "Anyone can check these receipts. Change one character and the signature fails."

## 1:40 to 2:00, the vault and the money

Terminal:

```sh
pnpm vault:trade runs/hassett.json --send-anyway
```

> "And if the agent tries to trade anyway, the vault refuses on chain: it needs a fresh Nodary price signed by its
> Airnode and a CONFIRMED verdict signed by SecondSource."

/receipts: the x402 payments, the vault transactions, and the Masumi escrow and result hash on Cardano.

> "SecondSource is a Masumi Coworker that gets paid in escrow on Cardano, and pays for its own signed evidence on API3.
> Every step has a receipt."

## If something breaks

- No aUSD or network trouble: use Recorded checks. Replays are free and the receipts still verify.
- Vault transaction slow: show the earlier allowed and blocked transactions on /receipts.
