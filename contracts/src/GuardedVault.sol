// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {AirnodeV2Attestation} from "./AirnodeV2Attestation.sol";
import {ProjectedJson} from "./ProjectedJson.sol";

/// @title GuardedVault: trades on a headline only when the primary source backs it, checked on chain
/// @notice A mock ETH vault for trading agents. A trade needs three proofs, all verified here:
/// (1) an ETH/USD price signed by the Nodary Airnode less than a minute ago,
/// (2) a post by an official primary account, signed by the TwitterAPI.io Airnode, whose request this contract
///     rebuilds itself from the post id, and
/// (3) a CONFIRMED verdict signed by the SecondSource coworker that commits to exactly that post.
/// SecondSource can misjudge, but it cannot invent a primary-source post. Anyone holding a signed denial by a primary
/// account plus a matching DENIED verdict can halt trading for everyone (`haltOnDenial`).
/// @dev No owner, no upgrade path, no external calls. All configuration is fixed at deployment.
contract GuardedVault {
    /// @notice SecondSource's answer about a headline
    enum Verdict {
        None,
        Confirmed,
        Unconfirmed,
        Denied
    }

    /// @notice A response exactly as an AirnodeHub listing returns it
    /// @param airnode Address the response claims to be signed by
    /// @param requestHash Hash of the request the response answers
    /// @param timestamp Unix time in seconds at which the Airnode signed
    /// @param data The signed JSON, as bytes, byte for byte as received
    /// @param signature 65-byte EIP-191 signature over keccak256(requestHash, timestamp, data)
    struct AirnodeResponse {
        address airnode;
        bytes32 requestHash;
        uint256 timestamp;
        bytes data;
        bytes signature;
    }

    /// @notice A SecondSource verdict, signed by the coworker key for this chain and this vault
    /// @param resultHash keccak256 of the full SecondSource result with every attestation it used
    /// @param verdict The answer
    /// @param signedAt Unix time in seconds at which the coworker signed
    /// @param signature 65-byte EIP-191 signature over `verdictDigest(...)`
    struct SignedVerdict {
        bytes32 resultHash;
        Verdict verdict;
        uint256 signedAt;
        bytes signature;
    }

    /// @notice Longest time from the Nodary Airnode signing a price to this contract accepting it
    uint256 public constant MAX_PRICE_RESPONSE_AGE = 60 seconds;
    /// @notice Longest time from Nodary taking the price to this contract accepting it
    uint256 public constant MAX_PRICE_AGE = 60 seconds;
    /// @notice Longest time from the TwitterAPI.io Airnode signing a post to this contract accepting it
    uint256 public constant MAX_EVIDENCE_AGE = 1 days;
    /// @notice Longest time from the coworker signing a verdict to this contract accepting it
    uint256 public constant MAX_VERDICT_AGE = 1 hours;
    /// @notice How long a primary-source denial halts trading
    uint256 public constant HALT_DURATION = 1 hours;
    /// @notice Domain tag of the verdict digest
    bytes32 public constant VERDICT_TAG = keccak256("SecondSource.Verdict.v2");

    /// @notice The Nodary Airnode. Deployed with 0xE70f1e8b22a21e4Bb5188918a3033341b281E4c0, from
    /// https://airnode-nodary.fly.dev/ (x-airnode.address)
    address public immutable nodaryAirnode;
    /// @notice The TwitterAPI.io Airnode. Deployed with 0x7B02Fd3324D2dC362f65a9c01e59EC5fDb4E1CCB, from
    /// https://airnode-twitterapi.fly.dev/ (x-airnode.address)
    address public immutable twitterAirnode;
    /// @notice Hash of the only Nodary request accepted: latestFeeds ETH/USD projected to price and updatedAt
    bytes32 public immutable priceRequestHash;
    /// @notice Key the SecondSource coworker signs verdicts with
    address public immutable secondSource;

    /// @notice keccak256 of each X handle that counts as a primary source, fixed at deployment
    mapping(bytes32 handleHash => bool) public isPrimaryAccount;
    /// @notice Verdicts already used for a trade or a halt
    mapping(bytes32 resultHash => bool) public verdictUsed;
    /// @notice Trading is halted until this Unix time
    uint256 public haltedUntil;
    /// @notice Number of executed trades
    uint256 public trades;
    /// @notice Mock ETH position, 18 decimals
    uint256 public ethBought;

    /// @notice A trade went through with all three proofs
    event TradeExecuted(
        bytes32 indexed resultHash,
        string postId,
        string author,
        uint256 ethUsdPrice,
        uint256 notionalUsd,
        uint256 ethAmount
    );
    /// @notice A signed primary-source denial halted trading
    event TradingHaltedBy(bytes32 indexed resultHash, string postId, string author, string text, uint256 until);

    /// @notice The response answers a different request than this contract expects
    error WrongRequest(bytes32 got, bytes32 expected);
    /// @notice The signature does not match the response's own airnode field: data, timestamp or signature changed
    error SignatureMismatch(address recovered, address claimed);
    /// @notice A valid signature, but from a key that is not the expected Airnode
    error UnexpectedAirnode(address signer, address expected);
    /// @notice The price response was signed too long ago
    error PriceResponseTooOld(uint256 timestamp, uint256 age);
    /// @notice Nodary took the price too long ago
    error PriceDataTooOld(uint256 updatedAt);
    /// @notice The signed post was fetched too long ago
    error EvidenceTooOld(uint256 timestamp, uint256 age);
    /// @notice The post id is not a decimal number
    error InvalidPostId(string postId);
    /// @notice The signed post is a different post than the one requested
    error PostIdMismatch(string requested, string returned);
    /// @notice The post's author is not one of the primary accounts
    error NotPrimarySource(string author);
    /// @notice The verdict was not signed by the SecondSource coworker for this chain, vault and post
    error VerdictNotSignedBySecondSource(address signer);
    /// @notice The verdict is not the one this action needs
    error UnexpectedVerdict(Verdict got, Verdict required);
    /// @notice The verdict was signed too long ago
    error VerdictTooOld(uint256 signedAt);
    /// @notice The verdict was already used
    error VerdictAlreadyUsed(bytes32 resultHash);
    /// @notice A primary-source denial halted trading
    error TradingHalted(uint256 until);

    /// @param nodaryAirnode_ Address the Nodary Airnode signs with
    /// @param twitterAirnode_ Address the TwitterAPI.io Airnode signs with
    /// @param priceRequestHash_ Hash of the accepted Nodary request (src/vault/nodary.ts priceRequestHash)
    /// @param secondSource_ Address of the coworker's verdict key
    /// @param primaryAccounts X handles that count as primary sources, without @, exact case
    constructor(
        address nodaryAirnode_,
        address twitterAirnode_,
        bytes32 priceRequestHash_,
        address secondSource_,
        string[] memory primaryAccounts
    ) {
        nodaryAirnode = nodaryAirnode_;
        twitterAirnode = twitterAirnode_;
        priceRequestHash = priceRequestHash_;
        secondSource = secondSource_;
        for (uint256 i = 0; i < primaryAccounts.length; i++) {
            isPrimaryAccount[keccak256(bytes(primaryAccounts[i]))] = true;
        }
    }

    /// @notice Rebuilds the request hash of `tweetsByIds {tweet_ids: postId}` projected to author, createdAt, id and
    /// text, exactly as the Airnode computes it, so the contract knows which post a response is about
    /// @param postId Decimal post id, the last path segment of the post's URL
    function primarySourceRequestHash(string memory postId) public pure returns (bytes32) {
        bytes memory id = bytes(postId);
        if (id.length == 0 || id.length > 25) revert InvalidPostId(postId);
        for (uint256 i = 0; i < id.length; i++) {
            if (id[i] < "0" || id[i] > "9") revert InvalidPostId(postId);
        }
        return keccak256(
            abi.encodePacked(
                '["tweetsByIds",[["tweet_ids","',
                id,
                '"]],[["author","/tweets/0/author/userName"],["createdAt","/tweets/0/createdAt"],',
                '["id","/tweets/0/id"],["text","/tweets/0/text"]]]'
            )
        );
    }

    /// @notice The digest the coworker signs (EIP-191) for a verdict, bound to this chain, this vault and one post
    function verdictDigest(bytes32 resultHash, Verdict verdict, uint256 signedAt, bytes32 evidenceRequestHash)
        public
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(VERDICT_TAG, block.chainid, address(this), resultHash, verdict, signedAt, evidenceRequestHash)
        );
    }

    /// @notice Checks a Nodary ETH/USD response the way a trade would, without trading. Reverts with the reason.
    /// @dev The tamper test calls this: a valid response returns the price; an edited value, a stale response, a
    /// response to another request and one signed by another key each revert with their own error.
    /// @return price ETH/USD with 18 decimals
    /// @return updatedAt Unix time in seconds at which Nodary took the price
    function verifyPrice(AirnodeResponse calldata response) public view returns (uint256 price, uint256 updatedAt) {
        _checkSignedResponse(response, priceRequestHash, nodaryAirnode);
        uint256 age = _age(response.timestamp);
        if (age > MAX_PRICE_RESPONSE_AGE) revert PriceResponseTooOld(response.timestamp, age);
        price = ProjectedJson.readUint(response.data, "price", 18);
        updatedAt = ProjectedJson.readUint(response.data, "updatedAt", 0) / 1000;
        if (_age(updatedAt) > MAX_PRICE_AGE) revert PriceDataTooOld(updatedAt);
    }

    /// @notice Checks a post signed by the TwitterAPI.io Airnode and returns its author and text if the author is a
    /// primary account. Reverts with the reason otherwise.
    /// @param postId The post the response must be about
    function verifyPrimarySource(string calldata postId, AirnodeResponse calldata response)
        public
        view
        returns (string memory author, string memory text)
    {
        _checkSignedResponse(response, primarySourceRequestHash(postId), twitterAirnode);
        uint256 age = _age(response.timestamp);
        if (age > MAX_EVIDENCE_AGE) revert EvidenceTooOld(response.timestamp, age);
        string memory returnedId = ProjectedJson.readString(response.data, "id");
        if (keccak256(bytes(returnedId)) != keccak256(bytes(postId))) revert PostIdMismatch(postId, returnedId);
        author = ProjectedJson.readString(response.data, "author");
        if (!isPrimaryAccount[keccak256(bytes(author))]) revert NotPrimarySource(author);
        text = ProjectedJson.readString(response.data, "text");
    }

    /// @notice Buys `notionalUsd` (18 decimals) of mock ETH if the price, the primary-source post and the CONFIRMED
    /// verdict all hold, and trading is not halted
    /// @return ethAmount Mock ETH bought, 18 decimals
    function executeTrade(
        AirnodeResponse calldata price,
        string calldata postId,
        AirnodeResponse calldata post,
        SignedVerdict calldata verdict,
        uint256 notionalUsd
    ) external returns (uint256 ethAmount) {
        if (block.timestamp < haltedUntil) revert TradingHalted(haltedUntil);
        (uint256 ethUsd,) = verifyPrice(price);
        (string memory author,) = verifyPrimarySource(postId, post);
        _useVerdict(verdict, Verdict.Confirmed, post.requestHash);

        ethAmount = (notionalUsd * 1e18) / ethUsd;
        ethBought += ethAmount;
        trades += 1;
        emit TradeExecuted(verdict.resultHash, postId, author, ethUsd, notionalUsd, ethAmount);
    }

    /// @notice Halts trading for `HALT_DURATION` on a primary-source denial: a signed post by a primary account plus a
    /// DENIED verdict that commits to it. Anyone can call it, so one check protects every agent using the vault.
    function haltOnDenial(string calldata postId, AirnodeResponse calldata post, SignedVerdict calldata verdict) external {
        (string memory author, string memory text) = verifyPrimarySource(postId, post);
        _useVerdict(verdict, Verdict.Denied, post.requestHash);
        uint256 until = block.timestamp + HALT_DURATION;
        if (until > haltedUntil) haltedUntil = until;
        emit TradingHaltedBy(verdict.resultHash, postId, author, text, haltedUntil);
    }

    /// @dev Distinct reasons, in this order: wrong request, then signature not matching the claimed signer (edited
    /// data or timestamp), then a valid signature from another key. Finally the API3 starter's own check.
    function _checkSignedResponse(AirnodeResponse calldata r, bytes32 expectedRequestHash, address expectedAirnode)
        internal
        pure
    {
        if (r.requestHash != expectedRequestHash) revert WrongRequest(r.requestHash, expectedRequestHash);
        address recovered = AirnodeV2Attestation.recoverSigner(expectedRequestHash, r.timestamp, r.data, r.signature);
        if (recovered != r.airnode) revert SignatureMismatch(recovered, r.airnode);
        if (recovered != expectedAirnode) revert UnexpectedAirnode(recovered, expectedAirnode);
        AirnodeV2Attestation.verify(expectedAirnode, expectedRequestHash, r.timestamp, r.data, r.signature);
    }

    /// @dev Checks the coworker's signature, the verdict, its age and single use, then marks it used
    function _useVerdict(SignedVerdict calldata v, Verdict required, bytes32 evidenceRequestHash) internal {
        address signer = ECDSA.recover(
            MessageHashUtils.toEthSignedMessageHash(verdictDigest(v.resultHash, v.verdict, v.signedAt, evidenceRequestHash)),
            v.signature
        );
        if (signer != secondSource) revert VerdictNotSignedBySecondSource(signer);
        if (v.verdict != required) revert UnexpectedVerdict(v.verdict, required);
        if (_age(v.signedAt) > MAX_VERDICT_AGE) revert VerdictTooOld(v.signedAt);
        if (verdictUsed[v.resultHash]) revert VerdictAlreadyUsed(v.resultHash);
        verdictUsed[v.resultHash] = true;
    }

    /// @dev Seconds since `t`; zero for a time in the future, which only a signer could produce
    function _age(uint256 t) internal view returns (uint256) {
        return block.timestamp > t ? block.timestamp - t : 0;
    }
}
