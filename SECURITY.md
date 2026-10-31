# Security

Scope: `contracts/src/GuardedVault.sol` (deployed on Base Sepolia at `0x0e9128f550254ed3389330e8134cea8cb09f46b6`), the
off-chain verifier in `src/airnode/`, the verdict signer in `src/vault/verdict.ts`, and the paid endpoints. Testnets
only. The vault holds no real funds; its "trade" is a mock position.

## What the contract guarantees

`executeTrade` changes state only if all of these hold, checked in this order:

1. Trading is not halted (`TradingHalted`).
2. **Price** (`verifyPrice`): the response answers the stored Nodary ETH/USD request (`WrongRequest`). Its signature
   recovers to the address the response claims (`SignatureMismatch`), and that address is the Nodary Airnode
   (`UnexpectedAirnode`). It was signed at most 60 s ago (`PriceResponseTooOld`), and Nodary took the price at most
   60 s ago (`PriceDataTooOld`).
3. **Primary source** (`verifyPrimarySource`): the contract rebuilds the request hash of
   `tweetsByIds {tweet_ids: postId}` itself, after checking the post id is decimal (`InvalidPostId`). The same three
   signature checks run against the TwitterAPI.io Airnode. The response was signed at most a day ago
   (`EvidenceTooOld`). The signed `id` equals the requested one (`PostIdMismatch`), and the author is one of the
   primary accounts fixed at deployment (`NotPrimarySource`).
4. **Verdict**: signed by the SecondSource key over
   `(tag, chainId, vault, resultHash, verdict, signedAt, evidenceRequestHash)` (`VerdictNotSignedBySecondSource`). It
   is CONFIRMED (`UnexpectedVerdict`), at most an hour old (`VerdictTooOld`) and not used before
   (`VerdictAlreadyUsed`).

`haltOnDenial` needs checks 3 and 4 with a DENIED verdict, and halts `executeTrade` for one hour.

Signature recovery and the final binding check use `AirnodeV2Attestation` from the API3 starter, unmodified
(`contracts/src/AirnodeV2Attestation.sol`). OpenZeppelin `ECDSA` rejects malleable and malformed signatures.

## Threat model

| Threat | Mitigation | Test |
|---|---|---|
| Forged or edited price, post text or timestamp | Signature must recover to the claimed and expected Airnode | `test_2_editedValueIsRejected`, `test_revertsWhenPostTextIsEdited` |
| Response from another Airnode or key | Expected signer is immutable, set at deployment from each listing's spec | `test_5_…AnotherKey…`, `test_revertsWhenPostSignedByAnotherKey` |
| Real response to a different request (other pair, other post) | Request hash stored (price) or rebuilt on chain from the post id | `test_4_…AnotherRequest…`, `test_revertsWhenPostIsForAnotherId` |
| Replay of an old price | 60 s limit on signing time and on Nodary's own timestamp | `test_3_staleResponseIsRejected`, `test_revertsWhenPriceDataIsOld` |
| Post id injection into the rebuilt request | Post id restricted to 1 to 25 decimal digits | `test_revertsOnMalformedPostId` |
| Evidence from a non-primary account | Author allowlist fixed at deployment | `test_revertsWhenPostIsNotByAPrimaryAccount`, `test_tradeNeedsAPrimarySource` |
| Verdict replay, cross-vault or cross-chain reuse | Digest binds chain id and vault address; `verdictUsed` | `test_revertsWhenVerdictWasForAnotherVault`, `test_revertsWhenVerdictIsReused` |
| Verdict reused with different evidence | Digest binds the evidence request hash | `test_revertsWhenVerdictCitesAnotherPost` |
| Verdict flipped after signing | Verdict value is inside the digest | `test_revertsWhenVerdictIsFlippedAfterSigning` |
| Acting on DENIED or UNCONFIRMED | Trade requires CONFIRMED, halt requires DENIED | `test_revertsTradeOn…Verdict`, `test_haltNeedsADeniedVerdict` |
| Griefing with halts | A halt needs a signed primary-source post **and** a DENIED verdict from SecondSource; each verdict halts once | `test_haltNeedsAPrimarySource`, `test_haltVerdictCannotBeReused` |
| Reentrancy, external call failures | The contract makes no external calls and holds no tokens | — |

30 Foundry tests in `contracts/test/GuardedVault.t.sol` cover every custom error. They use real signed responses saved
from AirnodeHub (`contracts/test/fixtures/`). `pnpm tamper-test` runs the five API3 tamper cases against the deployed
contract.

## Trust assumptions

- **Airnode keys.** We trust that the Nodary and TwitterAPI.io Airnode keys are held by their operators. A signature
  proves the Airnode served this response for this request at this time. It does not prove the underlying claim; in
  particular, a post proves that the account posted it, not that it is true.
- **TwitterAPI.io.** The Airnode attests what TwitterAPI.io returned, a third-party reading of X. It is not X itself.
- **The SecondSource verdict key** (`COWORKER_SIGNER_KEY`) is trusted to judge honestly. Its power is limited. It
  cannot invent evidence, because the contract verifies the cited post. It can only act within one hour of signing, once
  per result. A compromised key could confirm a trade by citing a real but irrelevant primary post, or halt trading by
  citing a real primary post as a denial. Rotating it needs a new deployment.
- **The model.** The judgment comes from a model through the OpenRouter Airnode, so its answer is signed. Models make
  mistakes; the vault limits the damage by requiring a primary-source post.
- **The primary-account list** (RapidResponse47, WhiteHouse, PressSec) is fixed at deployment. It fits US policy
  headlines, not every market.

## Known limitations

- **Relevance is not checked on chain.** The contract checks that the cited post is authentic and from a primary
  account, not that it is about the headline. That judgment is SecondSource's, and it is signed.
- **No trusted time.** The Airnode timestamp is the signing time. A post's own `createdAt` is not compared with the
  headline time on chain.
- **The halt is global and lasts an hour.** It is not scoped per asset or per headline.
- **Model choice.** During the hackathon the OpenRouter Airnode refused paid models upstream (HTTP 403). SecondSource
  falls back to a free model, and if no model answers, to fixed published rules. The result then says the judgment is
  unsigned.
- **Coverage.** No AirnodeHub listing covers Truth Social, official press-release feeds or timestamped SEC filings.
- **Operator keys.** The off-chain payer and verdict keys live in a local `.env` and in Vercel environment variables.
  Not production key management.
- **Not audited.** This is hackathon code on testnets.

## Reporting

Open an issue on https://github.com/raglibol-re/SecondSource.
