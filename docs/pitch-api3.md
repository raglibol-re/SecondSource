# Booth pitch: API3 (2:30)

API3 judges look for: authenticated AirnodeHub data at the core of the on-chain workflow, the tamper test (pass/fail),
execution, originality, and an autonomous agent that selects data, pays over x402 and acts on chain over repeated cycles.

## 0:00 to 0:20, why signed data is the core
> "Agents trade on headlines. On 7 April 2025 a fake tariff-pause headline moved the Dow 800 points; the White House's
> own account called it fake 20 minutes later. Our contract won't trade on a headline unless it can verify the
> primary source itself, signed by an Airnode."

## 0:20 to 1:00, the tamper test first, since it's pass/fail
Tab `/vault?run` (or `pnpm tamper-test`).
> "Against our deployed contract on Base Sepolia. A fresh Nodary ETH/USD response: accepted. One value edited:
> SignatureMismatch. Too old: PriceResponseTooOld. A real response to a different request: WrongRequest. Signed by
> another key: UnexpectedAirnode. Four rejections, four reasons. You can paste your own response here or POST it."

## 1:00 to 1:50, what's original: two Airnodes verified on chain
Tab BaseScan, the `executeTrade` and `haltOnDenial` transactions (from `/receipts`).
> "A trade needs three proofs. A fresh Nodary price. A post by a primary account, signed by the TwitterAPI.io Airnode,
> where the contract rebuilds the request hash from the post id, so it knows exactly which post it's reading, and
> reads the author with ProjectedJson. And our verdict, which must commit to that post. Here's the trade on a White House
> post. And here's the halt: the @RapidResponse47 'FAKE NEWS' post, verified on chain, stopping trades for everyone. The
> signed value drives the action: the price sizes the trade, the post's author decides whether it can happen at all."

## 1:50 to 2:20, the autonomous agent
Terminal: `pnpm watchdog "Hassett: Trump considering 90-day tariff pause" --at 2025-04-07T14:12:00Z --cycles 1`.
> "The watchdog runs on its own: each cycle it pays for fresh evidence over x402 from AirnodeHub listings, and the
> moment a primary account denies the rumour it brings the signed post on chain and halts the vault."

## 2:20 to 2:30
> "What we couldn't find on AirnodeHub: Truth Social, press-release feeds, the text of SEC filings. Trust the primary source, not
> the headline."

## Likely questions

| Question | Show |
|---|---|
| Where is the contract and what does it check? | `0x0e9128f550254ed3389330e8134cea8cb09f46b6` on Base Sepolia; `contracts/src/GuardedVault.sol` `verifyPrice`, `verifyPrimarySource`, `_checkSignedResponse` |
| Did you hand-roll the verification? | No: `AirnodeV2Attestation.recoverSigner` and `.verify` from the starter, unmodified (`contracts/src/AirnodeV2Attestation.sol`) |
| How do I send my own response? | `/vault` page; `POST /api/vault/verify` with `{airnode, requestHash, timestamp, data, signature}`; `pnpm vault:verify file.json [--post id]` |
| How do you know which post a signature is about? | `primarySourceRequestHash(postId)` rebuilds the canonical request; Foundry `test_requestHashIsRebuiltOnChain` and TS `test/vault.test.ts` pin it to real signed responses |
| What stops replays and duplicates? | Price under 60 s; post under a day; verdict bound to chain, vault and post, used once (`VerdictAlreadyUsed`); 30 Foundry tests (`pnpm contracts:test`) |
