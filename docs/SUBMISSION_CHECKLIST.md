# Submission checklist

Source: https://hackathon.tum-blockchain.com/prizes (fetched 31 Oct 2026), merged with the team briefing. Where they
differ, the website wins. Tracks: **Cardano** and **API3**, 2 of the 3 allowed partner tracks. The **TUM Blockchain
Track** is judged automatically and does not count toward the 3. Status as of 31 Oct, about 12:30 CET.

"You" marks the steps that need a person: Devfolio, recording, repo settings.

## All submissions (Devfolio)

| Requirement | Status | Evidence / next step |
|---|---|---|
| Project name and tagline | DONE | `docs/devfolio.md`: "Trust the primary source, not the headline." |
| Cover image or screenshots | DONE | `docs/screenshots/` (cover, chat with the agent, tamper test, on chain, check replay) |
| "The problem it solves" | DONE | `docs/devfolio.md` |
| "Challenges we ran into" | DONE | `docs/devfolio.md` |
| "Technologies used" | DONE | `docs/devfolio.md` |
| Detailed description | DONE | `docs/devfolio.md`, README |
| Tracks applied, teammates added | YOU | Select Cardano + API3 on Devfolio, add teammates |
| Demo video, at most 2.5 minutes | YOU | Script ready: `docs/video-script.md` |
| Public GitHub repo before the deadline | YOU | `raglibol-re/SecondSource` is still private. History scanned: no secrets. I'm not allowed to flip it |
| README: what it does, setup, run | DONE | `README.md` (badges, two verdicts, how it works, trust table). Fresh-clone check re-run before 14:30 |
| Live demo link | DONE | https://secondsource-two.vercel.app |

## Cardano: Agentic Commerce on Cardano

| Requirement | Status | Evidence |
|---|---|---|
| Agent completes a paid job (Masumi) or paid request (x402) on preprod | DONE | Two paid Sokosumi tasks; x402 requests paid in tADA (CLI, and a browser button for Eternl or Lace) |
| Transaction hash in README and `docs/transactions.md` | DONE | Escrow `b74e743b…`, result hash `721423f3…`, payout `665cf3d5…`; x402 `7616f0a5…`, `cc72cd2d…` |
| Payout status | DONE | Both paid tasks are `Withdrawn`: `665cf3d5…`, `89162f82…` (`pnpm masumi:payout`) |
| Payment tied to the result | DONE | x402 settles only after success; Masumi escrow refunds without a result hash |
| Agents hiring agents | DONE | The buyer agent hires SecondSource over x402, and SecondSource pays up to 7 AirnodeHub listings itself (X, Benzinga, LunarCrush, Finnhub incl. SEC filings, TickerLayer, OpenRouter, Nodary) |
| Video: customer, problem, business case, one paid job start to finish | YOU | `docs/video-script.md`, `docs/pitch-cardano.md` |
| Description: how it works, Cardano tools, real use | DONE | `docs/devfolio.md` ("Cardano tools used", "How it runs in real use") |
| README: setup steps and limits | DONE | README "Run it", "Limits"; `docs/setup-human-steps.md` |
| Judges can pay from their own Cardano wallet | DONE (test once yourself) | Wallet bar on `/check` (Eternl, Lace); payment receipt shown for every payment. Live buyer-agent run settled `30a21c79…` |

## API3: Any API in your contract

| Requirement | Status | Evidence |
|---|---|---|
| AirnodeHub essential to the core workflow | DONE | Every investigation buys 5 to 10 signed answers, including newsrooms and SEC filings; the vault needs two Airnodes on chain |
| Deployed contract checks signer, request and freshness before acting | DONE | GuardedVault v2 `0x0e9128f550254ed3389330e8134cea8cb09f46b6`, Base Sepolia |
| Uses `AirnodeV2Attestation` from the starter | DONE | `contracts/src/AirnodeV2Attestation.sol`, unmodified |
| Signed value drives an on-chain action, with duplicate protection | DONE | Price sizes the trade; the post's author gates it; verdicts are single-use. Trade `0x0cd73b4e…`, halt `0x5c634248…` |
| Contract address and network | DONE | README, `contracts/deployments.json` |
| Judges submit their own responses | DONE | `/vault` page, `POST /api/vault/verify`, `pnpm vault:verify` |
| Tamper test: 1 valid, 4 rejected (edited, too old, other request, wrong key) | DONE | `pnpm tamper-test` PASS in about 1.3 s against the deployed contract; `/vault?run`; Foundry `GuardedVaultTamperTest` |
| Distinct, readable reasons, under 30 s | DONE | `SignatureMismatch`, `PriceResponseTooOld`, `WrongRequest`, `UnexpectedAirnode` |
| Video shows the tamper test | YOU | `docs/video-script.md` 1:50 to 2:20 |
| Description: who relies on the data, what goes wrong if forged, data not on AirnodeHub | DONE | `docs/devfolio.md` |
| Autonomous agent: selects data, pays x402, acts on chain repeatedly | DONE | The planning agent picks sources per question; `pnpm watchdog` loops, pays and halted the vault on chain (`0xd3d341d8…`) |

## TUM Blockchain Track

| Requirement | Status | Evidence |
|---|---|---|
| NatSpec | DONE | Every function, struct, event and error in `GuardedVault.sol` |
| Explicit custom errors | DONE | 14 custom errors |
| No unchecked external calls | DONE | No external calls, no owner, immutable configuration |
| Tests for every revert path | DONE | 30 Foundry tests on real signed fixtures, plus 8 property tests (256 random runs each) |
| Coverage | DONE | `GuardedVault.sol`: 100% lines, statements, branches, functions (`forge coverage`) |
| Static analysis | DONE | Slither 0.11.6: 9 results (timestamp, constructor zero-checks), each answered in `SECURITY.md` |
| CI | DONE | `.github/workflows/ci.yml`: typecheck, 40 TS tests, Foundry build and tests; green |
| `SECURITY.md` | DONE | Threat model, trust assumptions, known limitations |

## Differences between the website and the briefing

1. **TUM track:** the website has no technical checklist. It picks the three "most serious" projects, those that "most
   deserve a security audit".
2. **Cardano:** a Masumi job **or** an x402 request qualifies. "Decision hash on chain" and "payout status" are the
   briefing's extras, and both are done.
3. **API3:** distinct reasons, under 30 s and the script name come from the briefing. The website allows "the app or a
   documented script"; we have both.
4. **API3:** the website also asks for "data you wanted but could not find on AirnodeHub". It's answered in
   `docs/devfolio.md`.
5. **Repository:** "Make the repository public before the deadline". Only you can do that.
