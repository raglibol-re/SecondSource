// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {AirnodeV2Attestation} from "./AirnodeV2Attestation.sol";
import {ProjectedJson} from "./ProjectedJson.sol";

/// @title A vault that trades on a headline only when the primary sources back it
/// @notice Executes a mock ETH buy only with two proofs, both checked on chain:
/// (a) an ETH/USD price that the Nodary Airnode v2 signed less than a minute ago, and
/// (b) a SecondSource verdict for the headline, signed by the SecondSource coworker key, that says CONFIRMED.
/// Anything else reverts, so an agent wired to this vault cannot trade on a denied or unchecked headline.
contract GuardedVault {
    enum Verdict {
        None,
        Confirmed,
        Unconfirmed,
        Denied
    }

    struct SignedPrice {
        uint256 timestamp;
        bytes data; // {"price":...,"updatedAt":...} exactly as the Airnode signed it
        bytes signature;
    }

    struct SignedVerdict {
        bytes32 resultHash; // keccak256 of the full SecondSource result, with every attestation it cites
        Verdict verdict;
        uint256 signedAt;
        bytes signature;
    }

    /// @notice Address the Nodary Airnode v2 signs with, from https://airnode-nodary.fly.dev/ (x-airnode.address)
    address public constant NODARY_AIRNODE = 0xE70f1e8b22a21e4Bb5188918a3033341b281E4c0;
    uint256 public constant MAX_PRICE_RESPONSE_AGE = 60 seconds;
    uint256 public constant MAX_VERDICT_AGE = 1 hours;
    bytes32 public constant VERDICT_TAG = keccak256("SecondSource.Verdict.v1");

    /// @notice Hash of the one Nodary request this vault accepts: latestFeeds ETH/USD projected to price and updatedAt
    bytes32 public immutable priceRequestHash;
    /// @notice Key the SecondSource coworker signs verdicts with
    address public immutable secondSource;

    mapping(bytes32 resultHash => bool) public verdictUsed;
    uint256 public trades;
    uint256 public ethBought; // 18 decimals, mock position

    event TradeExecuted(bytes32 indexed resultHash, uint256 ethUsdPrice, uint256 priceTimestamp, uint256 notionalUsd, uint256 ethAmount);

    error PriceResponseTooOld(uint256 timestamp);
    error VerdictNotSignedBySecondSource(address signer);
    error VerdictNotConfirmed(Verdict verdict);
    error VerdictTooOld(uint256 signedAt);
    error VerdictAlreadyUsed(bytes32 resultHash);

    constructor(bytes32 priceRequestHash_, address secondSource_) {
        priceRequestHash = priceRequestHash_;
        secondSource = secondSource_;
    }

    /// @notice The digest the coworker signs (EIP-191) for a verdict. Bound to this chain and this vault.
    function verdictDigest(bytes32 resultHash, Verdict verdict, uint256 signedAt) public view returns (bytes32) {
        return keccak256(abi.encode(VERDICT_TAG, block.chainid, address(this), resultHash, verdict, signedAt));
    }

    /// @notice Buys `notionalUsd` (18 decimals) of mock ETH if, and only if, both proofs hold
    function executeTrade(SignedPrice calldata price, SignedVerdict calldata verdict, uint256 notionalUsd)
        external
        returns (uint256 ethAmount)
    {
        // (a) Price: right signer, right request (the stored hash is in the digest), fresh.
        AirnodeV2Attestation.verify(NODARY_AIRNODE, priceRequestHash, price.timestamp, price.data, price.signature);
        if (price.timestamp + MAX_PRICE_RESPONSE_AGE < block.timestamp) revert PriceResponseTooOld(price.timestamp);
        uint256 ethUsd = ProjectedJson.readUint(price.data, "price", 18);
        uint256 priceTimestamp = ProjectedJson.readUint(price.data, "updatedAt", 0) / 1000;

        // (b) Verdict: signed by SecondSource for this vault, CONFIRMED, recent, used once.
        address signer = ECDSA.recover(
            MessageHashUtils.toEthSignedMessageHash(verdictDigest(verdict.resultHash, verdict.verdict, verdict.signedAt)),
            verdict.signature
        );
        if (signer != secondSource) revert VerdictNotSignedBySecondSource(signer);
        if (verdict.verdict != Verdict.Confirmed) revert VerdictNotConfirmed(verdict.verdict);
        if (verdict.signedAt + MAX_VERDICT_AGE < block.timestamp) revert VerdictTooOld(verdict.signedAt);
        if (verdictUsed[verdict.resultHash]) revert VerdictAlreadyUsed(verdict.resultHash);
        verdictUsed[verdict.resultHash] = true;

        ethAmount = (notionalUsd * 1e18) / ethUsd;
        ethBought += ethAmount;
        trades += 1;
        emit TradeExecuted(verdict.resultHash, ethUsd, priceTimestamp, notionalUsd, ethAmount);
    }
}
