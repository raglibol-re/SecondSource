# Submission checklist

Source: https://hackathon.tum-blockchain.com/prizes (fetched 31 Oct 2026, morning), merged with the team briefing.
Where they differ, the website wins; differences are listed at the end. Tracks: **Cardano** and **API3** (2 of the
3 allowed partner tracks). The **TUM Blockchain Track** is judged automatically and does not count toward the 3.

Status: DONE, PARTIAL, MISSING. "You" marks steps that need a person (browser, recording, Devfolio).

## All submissions (Devfolio)

| Requirement | Source | Status | Evidence / next step |
|---|---|---|---|
| Project name and tagline | briefing | MISSING | `docs/devfolio.md` to write |
| Cover image or screenshots | briefing | MISSING | Screenshots of the live site to generate into `docs/screenshots/` |
| "The problem it solves" | briefing | PARTIAL | Content exists in `docs/usage-and-value.md`; copy-ready text goes in `docs/devfolio.md` |
| "Challenges we ran into" | briefing | MISSING | `docs/devfolio.md` |
| "Technologies used" | briefing | MISSING | `docs/devfolio.md` |
| Detailed description: problem, what we built, how it works | website | PARTIAL | README + `docs/usage-and-value.md`; consolidate in `docs/devfolio.md` |
| Tracks applied (max 3 partner tracks), all teammates added | both | MISSING (you) | Select Cardano + API3 on Devfolio; add teammates |
| Demo video, at most 2.5 minutes | both | MISSING (you) | `docs/video-script.md` to write; recording is yours |
| Public GitHub repo, made public before the deadline | both | MISSING (you) | `raglibol-re/SecondSource` is private. History scanned: no secrets. Flipping it was blocked for me |
| README: what it does, setup, run | both | PARTIAL | `README.md` has all three; needs the new contract address, the tamper test, a "Limits" section and a fresh-clone check |
| Live demo link | briefing | DONE | https://secondsource-two.vercel.app |

## Cardano: Agentic Commerce on Cardano

| Requirement | Source | Status | Evidence / next step |
|---|---|---|---|
| Working agent or service completing at least one paid job (Masumi) or paid request (x402) on preprod | website | DONE | Masumi: two paid Sokosumi tasks. x402: paid requests to `POST /api/x402/check` (2 tADA) |
| Transaction hash of a paid job or request, in README and `docs/transactions.md` | both | DONE | Escrow locked [b74e743b…](https://preprod.cardanoscan.io/transaction/b74e743b2848b4919a73c99a814ad92471f5971d4aba15bd1e0ad3cd5fa086f3), result hash on chain [721423f3…](https://preprod.cardanoscan.io/transaction/721423f3f8809c86bd7ae6a3b0127c8454ef1ef1384d89899716b3808ece4879), x402 payment [7616f0a5…](https://preprod.cardanoscan.io/transaction/7616f0a56d346e068d7af71f167ef8cbee8e12dc63eef3acec5cd8d0ba29cc44) |
| Payout status of the paid job (seller collected) | briefing | PARTIAL | Escrow reached ResultSubmitted; the seller withdrawal after the unlock time is not yet checked or recorded |
| Video: who it is for, the problem, the business case, one paid job start to finish | both | MISSING (you) | Script to write; the Masumi flow takes several minutes, so the video uses the x402 job live (about 60 s) and shows the escrow job's transactions |
| Description: how it works, Cardano tools used, how it runs in real use | website | PARTIAL | `docs/usage-and-value.md`; to go into `docs/devfolio.md` |
| README: setup steps and limits | website | PARTIAL | Setup is there; limits are scattered; add a "Limits" section |

## API3: Any API in your contract

| Requirement | Source | Status | Evidence / next step |
|---|---|---|---|
| AirnodeHub essential to a core feature; removing it impairs the app | website | DONE | Every check buys signed evidence from 5 listings; the vault needs a Nodary attestation |
| Deployed contract checks expected signer, intended request and freshness before acting | website | PARTIAL | `GuardedVault` at `0x20b22351f91612015417965c8f43d22e85174ea8` (Base Sepolia) checks all three, but modified data, wrong signer and wrong request all revert with the same `NotSignedByAirnode` error |
| Uses `AirnodeV2Attestation` from the API3 starter | briefing | DONE | `contracts/src/AirnodeV2Attestation.sol`, unmodified from the starter |
| A value bound to the exact signed response drives an on-chain action, with duplicate protection | website | DONE | ETH amount computed from the signed price; each verdict usable once (`VerdictAlreadyUsed`) |
| Deployed contract address and network | both | DONE, changes | v1 above; a v2 deployment (next row) gets a new address |
| Judges can submit their own responses, via the app or a documented script | both | MISSING | Page and CLI to build |
| Tamper test: 1 valid, then rejected: edited value, too old, different request, wrong key | both | PARTIAL | 13 Foundry tests cover all four, with real Nodary fixtures; no `tamper-test` script yet; reasons not distinct |
| Each rejection shows a distinct, readable reason; screen-recordable in under 30 s | briefing | MISSING | Needs contract v2 (below) and the script |
| Video shows the tamper test | website | MISSING (you) | In `docs/video-script.md` |
| Description: who relies on the data, what goes wrong if forged, data wanted but not on AirnodeHub | website | MISSING | `docs/devfolio.md`. Not on AirnodeHub: Truth Social posts, official press-release feeds (whitehouse.gov), SEC filings with timestamps |
| Autonomous agent selecting data, paying via x402, acting on chain over repeated cycles | website (adds value) | PARTIAL | `pnpm agent` does one cycle; a `--watch` loop would cover "repeated cycles" |

## TUM Blockchain Track (audit-worthiness, judged from the submission)

| Requirement | Source | Status | Evidence / next step |
|---|---|---|---|
| Serious project that deserves an audit | website | PARTIAL | The website gives no checklist; the items below are the briefing's |
| NatSpec comments on the contract | briefing | PARTIAL | `GuardedVault.sol` has contract-level and most function NatSpec; complete in v2 |
| Explicit custom errors | briefing | DONE | 5 custom errors in `GuardedVault.sol` |
| No unchecked external calls | briefing | DONE | The vault makes no external calls |
| Tests for every revert path | briefing | PARTIAL | All current errors tested (13 tests); v2 errors to add |
| `SECURITY.md`: threat model, trust assumptions, known limitations | briefing | MISSING | To write |

## Differences between the website and the briefing

1. **TUM track:** the website has no technical checklist. It picks "the three most serious projects" that "most
   deserve a security audit". NatSpec, `SECURITY.md` and revert-path tests are the briefing's way of showing that,
   not stated rules.
2. **Cardano:** the website accepts **either** a Masumi job **or** an x402 request. "Decision hash on chain" and
   "payout status" are the briefing's extras. The website requires the video to cover who it is for, the problem and
   the business case, besides the paid job.
3. **API3, tamper cases:** the website's wording is "a real response with one value edited", "a real response that is
   too old", "a real response to a different request" and "a response signed by a key that is not the expected
   Airnode's". Distinct reasons per case, under 30 seconds and the script name are briefing requirements. The website
   allows "the app **or** a documented script" for judges.
4. **API3, description:** the website also asks for "what data you wanted but could not find on AirnodeHub". The
   briefing doesn't list it.
5. **Repository:** the website says explicitly "Make the repository public before the deadline".

## Build plan (pending your go-ahead)

1. **GuardedVault v2** (redeploy on Base Sepolia). Takes the AirnodeHub response as pasted (`airnode, requestHash,
   timestamp, data, signature`) and checks in this order, each with its own error:
   `WrongRequest(requestHash)` → `SignatureMismatch(recovered)` (data or timestamp edited) →
   `UnexpectedAirnode(signer)` (valid signature from another key) → `PriceResponseTooOld(timestamp, age)`.
   Recovery and the final check use `AirnodeV2Attestation` from the starter. A public `verifyPrice` view runs the same
   checks without a verdict, so judges can test responses without gas; `executeTrade` stays the action.
2. `pnpm tamper-test`: one real signed Nodary response, the four tampered variants, all sent to the deployed contract
   (eth_call, no gas), printing ACCEPTED or REVERTED with the decoded reason, in about 10 seconds. `--send` broadcasts
   the valid case as a real trade. Matching Foundry tests.
3. Judge page `/vault` and `pnpm vault:verify <file.json>`: paste a response, or fetch a fresh one, and see the deployed
   contract's verdict.
4. Record the Masumi payout status. Write README "Limits", `SECURITY.md`, the artifacts in `docs/`, an offline mode
   from fixtures, then do a fresh-clone run.
