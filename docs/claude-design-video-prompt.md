# Prompt for Claude Design: the SecondSource demo video

Paste everything below the line into Claude Design. Attach these files with it:
`public/assets/seal.svg`, `docs/screenshots/chat-binance.png`, `docs/screenshots/payment-receipt.png`,
`docs/screenshots/tamper-test.png`, `docs/screenshots/on-chain.png`, `docs/screenshots/home.png`.

---

Create a 2 minute 30 second animated demo video (16:9, 1920×1080, 30 fps) for **SecondSource**, a hackathon project at
the TUM Blockchain Hackathon 2026. It is judged by the Cardano track (a paid agent with payment tied to the result)
and the API3 track (signed data used on chain, plus a pass/fail tamper test). Build it as a sequence of scenes with
motion, on-screen text and a voiceover script I will record myself. Use only the facts, numbers and transaction ids
below; do not invent any.

## What SecondSource is
The coworker AI trading agents hire before they act on a headline. It reads what the people involved actually posted,
what newsrooms and filings report, and answers CONFIRMED, UNCONFIRMED or DENIED, with a signed receipt for every
source. The buyer pays per question over x402 (2 tADA on Cardano Preprod or 0.10 USDC on Base Sepolia), and the
payment settles only after the verdict is delivered. Tagline: **"Trust the primary source, not the headline."**

## Visual identity (match the live site)
- Look: a newswire on paper. Calm, factual, one loud element per scene: the verdict stamp.
- Colours: paper `#edf1f4`, paper-2 `#e1e7ec`, card `#f8fafb`, ink `#16202e`, secondary ink `#4a5668`, rules
  `#c3ccd6`, wire blue `#2340c8`, DENIED red `#c8102e`, CONFIRMED green `#13784b`, UNCONFIRMED amber `#9a6300`.
- Type: Archivo (variable width; headlines condensed at width 70 to 75, weight 800 to 850), body Archivo 400 to 600.
  IBM Plex Mono only for hashes and addresses.
- Signature element: the verdict stamp, a thick rounded border in the verdict colour, uppercase word, rotated −9°, which
  lands with a quick overshoot (scale 2.4 → 0.94 → 1, about 500 ms).
- Logo: the attached seal.
- Motion: purposeful only. Messages slide up 8 px and fade in; receipts tick in one by one with a small pop on a green
  dot; a confidence bar fills; transaction links get a soft underline sweep. No particles, no gradients, no glitch.
- Use the attached screenshots as the real UI, framed in a simple browser chrome; zoom and pan into the relevant part
  rather than redrawing the interface.

## Scenes and voiceover

**1. The problem (0:00 to 0:20).** A wire-style headline types onto paper: "Hassett: Trump considering 90-day tariff
pause", dateline "7 April 2025, 10:12 New York". A simple Dow line jumps up, then fades back. Then a red DENIED stamp
lands on the headline.
> "7 April 2025, 10:12 New York. A headline says Trump is considering a 90-day tariff pause. The Dow swings about 800
> points. Twenty minutes later the White House says it's fake, and the rally fades. Trading agents that bought the
> headline lost money. SecondSource is the coworker those agents hire first."

**2. Two questions, two verdicts (0:20 to 0:45).** Use `chat-binance.png`. Show the question bubble "Is it true that
Binance was hacked recently?", then the plan grouped by source (primary accounts, search words, newsrooms, time,
market), the receipts ticking in with a "signed" counter, then the green CONFIRMED card with outlet cards (CNBC,
Cointelegraph, The Independent). Then cut to the red DENIED stamp for the tariff headline, with the quoted post
"Wrong. Fake News." by @RapidResponse47.
> "Ask in plain words. The agent plans where to look, and the plan itself is signed. It buys evidence over x402 on
> API3's AirnodeHub: the company's own accounts, X, newswires, and newsrooms through LunarCrush and Finnhub. Every
> answer is signed by its Airnode and checked. Binance: confirmed, independent newsrooms report it and no Binance
> account disputes it. The tariff headline: denied, by the White House's own signed posts. An official denial beats
> any number of outlets repeating a story."

**3. A paid question on Cardano (0:45 to 1:15).** Use `payment-receipt.png`. Show a wallet bar connecting ("Connect
Cardano wallet"), then "Ask and pay 2 tADA", then the payment receipt sliding in like a till slip: 2 tADA, From,
To, Cardano Preprod, transaction `30a21c79…105434`, status "Paid". Then a small diagram: buyer agent → SecondSource →
seven data sources, each arrow labelled "x402".
> "Connect a wallet, ask, sign once. The payment is verified up front but settles only after the verdict exists, so
> you pay for delivered work. Here's the receipt, with the transaction on Cardano. Inside that one job, SecondSource
> paid seven data sources over x402 itself: agents paying agents. Through Sokosumi, the same job runs with Masumi
> escrow: funds locked, the result hash written on Cardano, then the payout."
On-screen for the Masumi line, three small chips: "Escrow locked b74e743b…", "Result hash on chain 721423f3…",
"Payout 665cf3d5…".

**4. The contract checks the source itself (1:15 to 1:50).** Use `on-chain.png`. An animated diagram of the Guarded
Vault on Base Sepolia (`0x0e9128f5…f46b6`) with three locks that open one after another: "Fresh Nodary price, signed
under 60 s ago", "Post by a primary account, signed by the TwitterAPI.io Airnode, request rebuilt on chain from the
post id", "SecondSource verdict that cites that post". Then a fourth state: a signed denial post drops in and a red
"Trading halted for 1 hour" bar slides across.
> "Our Guarded Vault trades only with three proofs: a fresh Nodary price, a post by a primary account signed by the
> TwitterAPI.io Airnode, with the request rebuilt on chain from the post id, and our verdict citing that post. We can
> misjudge, but we can't invent a White House post. And a signed denial halts the vault for every agent."

**5. The tamper test (1:50 to 2:20).** Use `tamper-test.png`. Five rows appear one by one, each with its result in
colour:
1. Valid, fresh response from the Nodary Airnode: ACCEPTED (green)
2. One value edited: REVERTED SignatureMismatch (red)
3. Response too old: REVERTED PriceResponseTooOld (red)
4. Response to a different request: REVERTED WrongRequest (red)
5. Signed by another key: REVERTED UnexpectedAirnode (red)

End on "1 accepted, 4 rejected, 4 distinct reasons: PASS".
> "API3's tamper test, against the deployed contract. A valid, fresh response: accepted. One value edited: signature
> mismatch. Too old: rejected. A different request: rejected. Signed by another key: rejected. One accepted, four
> rejected, four reasons. Every check is also covered by 38 Foundry tests, at 100% coverage."

**6. Close (2:20 to 2:30).** Paper background, the seal, the tagline set large, and three lines below:
"secondsource-two.vercel.app", "github.com/raglibol-re/SecondSource", "Cardano Preprod, Base Sepolia, API3 AirnodeHub".
> "Next: more primary sources on AirnodeHub and per-market vaults. SecondSource: trust the primary source, not the
> headline."

## Deliverables
- The animated scenes, timed to the sections above (total 2:30 at most).
- Burned-in captions of the voiceover, bottom third, ink on a translucent paper band, max two lines.
- A separate list of the voiceover lines with their start times, so I can record them to match.
- Keep all text legible at 1080p: nothing smaller than 28 px on screen.
