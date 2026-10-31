// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {GuardedVault} from "../src/GuardedVault.sol";
import {AirnodeV2Test} from "./utils/AirnodeV2Test.sol";

/// @dev Shared setup: real signed responses from AirnodeHub, saved in test/fixtures.
abstract contract VaultFixtures is AirnodeV2Test {
    // keccak256 of ["latestFeeds", {name: ETH/USD}, {price, updatedAt}], from src/vault/nodary.ts
    bytes32 constant ETH_REQUEST = 0x180eae9387bb66a72380e61ebe0a00d19f8414a716a37ebe1df124b66acfff66;
    address constant NODARY = 0xE70f1e8b22a21e4Bb5188918a3033341b281E4c0;
    address constant TWITTER = 0x7B02Fd3324D2dC362f65a9c01e59EC5fDb4E1CCB;
    uint256 constant COWORKER_KEY = 0xC0FFEE;
    uint256 constant OTHER_KEY = 0xBAD;

    GuardedVault vault;
    GuardedVault.AirnodeResponse ethPrice; // Nodary ETH/USD, signed by the Nodary Airnode
    GuardedVault.AirnodeResponse btcPrice; // Nodary BTC/USD: a real response to a different request
    GuardedVault.AirnodeResponse denialPost; // @RapidResponse47: "...90-day pause on tariffs are FAKE NEWS"
    GuardedVault.AirnodeResponse whiteHousePost; // @WhiteHouse: shipbuilding executive order
    GuardedVault.AirnodeResponse notPrimaryPost; // @HASCRepublicans, not a primary account
    string denialId;
    string whiteHouseId;
    string notPrimaryId;

    function setUp() public virtual {
        string[] memory accounts = new string[](3);
        accounts[0] = "RapidResponse47";
        accounts[1] = "WhiteHouse";
        accounts[2] = "PressSec";
        vault = new GuardedVault(NODARY, TWITTER, ETH_REQUEST, vm.addr(COWORKER_KEY), accounts);
        ethPrice = load("test/fixtures/nodary-eth-usd.json");
        btcPrice = load("test/fixtures/nodary-btc-usd.json");
        denialPost = load("test/fixtures/post-rapidresponse-denial.json");
        whiteHousePost = load("test/fixtures/post-whitehouse-shipbuilding.json");
        notPrimaryPost = load("test/fixtures/post-not-primary.json");
        denialId = vm.parseJsonString(vm.readFile("test/fixtures/post-rapidresponse-denial.json"), ".postId");
        whiteHouseId = vm.parseJsonString(vm.readFile("test/fixtures/post-whitehouse-shipbuilding.json"), ".postId");
        notPrimaryId = vm.parseJsonString(vm.readFile("test/fixtures/post-not-primary.json"), ".postId");
        vm.warp(ethPrice.timestamp + 10);
    }

    function load(string memory path) internal view returns (GuardedVault.AirnodeResponse memory r) {
        string memory json = vm.readFile(path);
        r.airnode = vm.parseJsonAddress(json, ".airnode");
        r.requestHash = vm.parseJsonBytes32(json, ".requestHash");
        r.timestamp = vm.parseUint(vm.parseJsonString(json, ".timestamp"));
        r.data = bytes(vm.parseJsonString(json, ".data"));
        r.signature = vm.parseJsonBytes(json, ".signature");
    }

    function signVerdict(uint256 key, GuardedVault.Verdict v, bytes32 resultHash, uint256 signedAt, address forVault, bytes32 evidence)
        internal
        view
        returns (GuardedVault.SignedVerdict memory s)
    {
        bytes32 digest =
            keccak256(abi.encode(keccak256("SecondSource.Verdict.v2"), block.chainid, forVault, resultHash, v, signedAt, evidence));
        (uint8 v_, bytes32 r, bytes32 s_) = vm.sign(key, MessageHashUtils.toEthSignedMessageHash(digest));
        s = GuardedVault.SignedVerdict(resultHash, v, signedAt, abi.encodePacked(r, s_, v_));
    }

    function confirmed() internal view returns (GuardedVault.SignedVerdict memory) {
        return signVerdict(COWORKER_KEY, GuardedVault.Verdict.Confirmed, keccak256("shipbuilding"), block.timestamp, address(vault), whiteHousePost.requestHash);
    }

    function denied() internal view returns (GuardedVault.SignedVerdict memory) {
        return signVerdict(COWORKER_KEY, GuardedVault.Verdict.Denied, keccak256("hassett"), block.timestamp, address(vault), denialPost.requestHash);
    }
}

/// @notice The API3 tamper test: exactly one valid response accepted, four rejected, each for its own reason.
contract GuardedVaultTamperTest is VaultFixtures {
    function test_1_validResponseIsAccepted() public view {
        (uint256 price, uint256 updatedAt) = vault.verifyPrice(ethPrice);
        assertGt(price, 1000e18);
        assertGt(updatedAt, 0);
    }

    function test_2_editedValueIsRejected() public {
        GuardedVault.AirnodeResponse memory r = ethPrice;
        r.data = bytes(vm.replace(string(r.data), '"price":', '"price":1'));
        vm.expectPartialRevert(GuardedVault.SignatureMismatch.selector);
        vault.verifyPrice(r);
    }

    function test_3_staleResponseIsRejected() public {
        vm.warp(ethPrice.timestamp + 61);
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.PriceResponseTooOld.selector, ethPrice.timestamp, 61));
        vault.verifyPrice(ethPrice);
    }

    function test_4_responseToAnotherRequestIsRejected() public {
        vm.warp(btcPrice.timestamp + 10);
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.WrongRequest.selector, btcPrice.requestHash, ETH_REQUEST));
        vault.verifyPrice(btcPrice);
    }

    function test_5_responseSignedByAnotherKeyIsRejected() public {
        GuardedVault.AirnodeResponse memory r = ethPrice;
        r.airnode = vm.addr(OTHER_KEY);
        r.signature = signResponse(OTHER_KEY, r.requestHash, r.timestamp, r.data);
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.UnexpectedAirnode.selector, vm.addr(OTHER_KEY), vault.nodaryAirnode()));
        vault.verifyPrice(r);
    }
}

/// @notice Every other path: primary-source checks, verdicts, trades and the circuit breaker.
contract GuardedVaultTest is VaultFixtures {
    function test_requestHashIsRebuiltOnChain() public view {
        assertEq(vault.primarySourceRequestHash(denialId), denialPost.requestHash);
        assertEq(vault.primarySourceRequestHash(whiteHouseId), whiteHousePost.requestHash);
    }

    function test_primarySourceIsRead() public view {
        (string memory author, string memory text) = vault.verifyPrimarySource(whiteHouseId, whiteHousePost);
        assertEq(author, "WhiteHouse");
        assertGt(bytes(text).length, 20);
    }

    function test_tradeWithAllThreeProofs() public {
        uint256 eth = vault.executeTrade(ethPrice, whiteHouseId, whiteHousePost, confirmed(), 1000e18);
        assertGt(eth, 0);
        assertEq(vault.trades(), 1);
        assertEq(vault.ethBought(), eth);
    }

    function test_revertsWhenPostIsNotByAPrimaryAccount() public {
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.NotPrimarySource.selector, "HASCRepublicans"));
        vault.verifyPrimarySource(notPrimaryId, notPrimaryPost);
    }

    function test_revertsWhenPostIsForAnotherId() public {
        vm.expectRevert(
            abi.encodeWithSelector(GuardedVault.WrongRequest.selector, denialPost.requestHash, vault.primarySourceRequestHash(whiteHouseId))
        );
        vault.verifyPrimarySource(whiteHouseId, denialPost);
    }

    function test_revertsOnMalformedPostId() public {
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.InvalidPostId.selector, "12a"));
        vault.primarySourceRequestHash("12a");
    }

    function test_revertsWhenPostTextIsEdited() public {
        GuardedVault.AirnodeResponse memory r = denialPost;
        r.data = bytes(vm.replace(string(r.data), "FAKE NEWS", "TRUE NEWS"));
        vm.expectPartialRevert(GuardedVault.SignatureMismatch.selector);
        vault.verifyPrimarySource(denialId, r);
    }

    function test_revertsWhenPostSignedByAnotherKey() public {
        GuardedVault.AirnodeResponse memory r = denialPost;
        r.airnode = vm.addr(OTHER_KEY);
        r.signature = signResponse(OTHER_KEY, r.requestHash, r.timestamp, r.data);
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.UnexpectedAirnode.selector, vm.addr(OTHER_KEY), vault.twitterAirnode()));
        vault.verifyPrimarySource(denialId, r);
    }

    function test_revertsWhenEvidenceIsOld() public {
        vm.warp(denialPost.timestamp + 1 days + 1);
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.EvidenceTooOld.selector, denialPost.timestamp, 1 days + 1));
        vault.verifyPrimarySource(denialId, denialPost);
    }

    function test_revertsWhenPriceDataIsOld() public {
        // A test vault whose Nodary signer is a test key: a freshly signed response carrying a price Nodary took long ago.
        string[] memory none = new string[](0);
        uint256 testNodaryKey = 0x5EED;
        GuardedVault v = new GuardedVault(vm.addr(testNodaryKey), TWITTER, ETH_REQUEST, vm.addr(COWORKER_KEY), none);
        uint256 updatedAt = block.timestamp - 120;
        bytes memory data = abi.encodePacked('{"price":2000.5,"updatedAt":', vm.toString(updatedAt * 1000), "}");
        GuardedVault.AirnodeResponse memory r = GuardedVault.AirnodeResponse(
            vm.addr(testNodaryKey), ETH_REQUEST, block.timestamp, data, signResponse(testNodaryKey, ETH_REQUEST, block.timestamp, data)
        );
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.PriceDataTooOld.selector, updatedAt));
        v.verifyPrice(r);
    }

    function test_revertsWhenSignedPostIsAnotherPost() public {
        // A vault whose TwitterAPI.io signer is a test key: a correctly signed answer to the request for one post that
        // carries a different post id, which a faulty or dishonest upstream could return.
        string[] memory accounts = new string[](1);
        accounts[0] = "WhiteHouse";
        uint256 testTwitterKey = 0x7EE7;
        GuardedVault v = new GuardedVault(NODARY, vm.addr(testTwitterKey), ETH_REQUEST, vm.addr(COWORKER_KEY), accounts);
        bytes32 request = v.primarySourceRequestHash(whiteHouseId);
        bytes memory data = bytes('{"author":"WhiteHouse","createdAt":"Wed Apr 09 22:41:09 +0000 2025","id":"1","text":"x"}');
        GuardedVault.AirnodeResponse memory r = GuardedVault.AirnodeResponse(
            vm.addr(testTwitterKey), request, block.timestamp, data, signResponse(testTwitterKey, request, block.timestamp, data)
        );
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.PostIdMismatch.selector, whiteHouseId, "1"));
        v.verifyPrimarySource(whiteHouseId, r);
    }

    function test_revertsWhenVerdictSignedByAnotherKey() public {
        GuardedVault.SignedVerdict memory v = signVerdict(
            OTHER_KEY, GuardedVault.Verdict.Confirmed, keccak256("x"), block.timestamp, address(vault), whiteHousePost.requestHash
        );
        vm.expectPartialRevert(GuardedVault.VerdictNotSignedBySecondSource.selector);
        vault.executeTrade(ethPrice, whiteHouseId, whiteHousePost, v, 1000e18);
    }

    function test_revertsWhenVerdictWasForAnotherVault() public {
        GuardedVault.SignedVerdict memory v = signVerdict(
            COWORKER_KEY, GuardedVault.Verdict.Confirmed, keccak256("x"), block.timestamp, address(0xBEEF), whiteHousePost.requestHash
        );
        vm.expectPartialRevert(GuardedVault.VerdictNotSignedBySecondSource.selector);
        vault.executeTrade(ethPrice, whiteHouseId, whiteHousePost, v, 1000e18);
    }

    function test_revertsWhenVerdictCitesAnotherPost() public {
        GuardedVault.SignedVerdict memory v = signVerdict(
            COWORKER_KEY, GuardedVault.Verdict.Confirmed, keccak256("x"), block.timestamp, address(vault), denialPost.requestHash
        );
        vm.expectPartialRevert(GuardedVault.VerdictNotSignedBySecondSource.selector);
        vault.executeTrade(ethPrice, whiteHouseId, whiteHousePost, v, 1000e18);
    }

    function test_revertsWhenVerdictIsFlippedAfterSigning() public {
        GuardedVault.SignedVerdict memory v = signVerdict(
            COWORKER_KEY, GuardedVault.Verdict.Denied, keccak256("x"), block.timestamp, address(vault), whiteHousePost.requestHash
        );
        v.verdict = GuardedVault.Verdict.Confirmed;
        vm.expectPartialRevert(GuardedVault.VerdictNotSignedBySecondSource.selector);
        vault.executeTrade(ethPrice, whiteHouseId, whiteHousePost, v, 1000e18);
    }

    function test_revertsTradeOnDeniedVerdict() public {
        GuardedVault.SignedVerdict memory v = signVerdict(
            COWORKER_KEY, GuardedVault.Verdict.Denied, keccak256("x"), block.timestamp, address(vault), whiteHousePost.requestHash
        );
        vm.expectRevert(
            abi.encodeWithSelector(GuardedVault.UnexpectedVerdict.selector, GuardedVault.Verdict.Denied, GuardedVault.Verdict.Confirmed)
        );
        vault.executeTrade(ethPrice, whiteHouseId, whiteHousePost, v, 1000e18);
    }

    function test_revertsTradeOnUnconfirmedVerdict() public {
        GuardedVault.SignedVerdict memory v = signVerdict(
            COWORKER_KEY, GuardedVault.Verdict.Unconfirmed, keccak256("x"), block.timestamp, address(vault), whiteHousePost.requestHash
        );
        vm.expectRevert(
            abi.encodeWithSelector(
                GuardedVault.UnexpectedVerdict.selector, GuardedVault.Verdict.Unconfirmed, GuardedVault.Verdict.Confirmed
            )
        );
        vault.executeTrade(ethPrice, whiteHouseId, whiteHousePost, v, 1000e18);
    }

    function test_revertsOnOldVerdict() public {
        uint256 signedAt = block.timestamp - 2 hours;
        GuardedVault.SignedVerdict memory v = signVerdict(
            COWORKER_KEY, GuardedVault.Verdict.Confirmed, keccak256("x"), signedAt, address(vault), whiteHousePost.requestHash
        );
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.VerdictTooOld.selector, signedAt));
        vault.executeTrade(ethPrice, whiteHouseId, whiteHousePost, v, 1000e18);
    }

    function test_revertsWhenVerdictIsReused() public {
        GuardedVault.SignedVerdict memory v = confirmed();
        vault.executeTrade(ethPrice, whiteHouseId, whiteHousePost, v, 1000e18);
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.VerdictAlreadyUsed.selector, v.resultHash));
        vault.executeTrade(ethPrice, whiteHouseId, whiteHousePost, v, 1000e18);
    }

    function test_tradeNeedsAPrimarySource() public {
        GuardedVault.SignedVerdict memory v = signVerdict(
            COWORKER_KEY, GuardedVault.Verdict.Confirmed, keccak256("x"), block.timestamp, address(vault), notPrimaryPost.requestHash
        );
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.NotPrimarySource.selector, "HASCRepublicans"));
        vault.executeTrade(ethPrice, notPrimaryId, notPrimaryPost, v, 1000e18);
    }

    function test_haltOnDenialStopsTradingForEveryone() public {
        vm.prank(address(0xA11CE)); // anyone can bring the denial
        vault.haltOnDenial(denialId, denialPost, denied());
        assertEq(vault.haltedUntil(), block.timestamp + 1 hours);
        GuardedVault.SignedVerdict memory v = confirmed();
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.TradingHalted.selector, block.timestamp + 1 hours));
        vault.executeTrade(ethPrice, whiteHouseId, whiteHousePost, v, 1000e18);
    }

    function test_haltEndsAfterAnHour() public {
        vault.haltOnDenial(denialId, denialPost, denied());
        vm.warp(block.timestamp + 1 hours);
        // The price fixture is now stale, which proves the halt itself no longer blocks.
        vm.expectPartialRevert(GuardedVault.PriceResponseTooOld.selector);
        vault.executeTrade(ethPrice, whiteHouseId, whiteHousePost, confirmed(), 1000e18);
    }

    function test_haltNeedsADeniedVerdict() public {
        GuardedVault.SignedVerdict memory v = signVerdict(
            COWORKER_KEY, GuardedVault.Verdict.Confirmed, keccak256("x"), block.timestamp, address(vault), denialPost.requestHash
        );
        vm.expectRevert(
            abi.encodeWithSelector(GuardedVault.UnexpectedVerdict.selector, GuardedVault.Verdict.Confirmed, GuardedVault.Verdict.Denied)
        );
        vault.haltOnDenial(denialId, denialPost, v);
    }

    function test_haltNeedsAPrimarySource() public {
        GuardedVault.SignedVerdict memory v = signVerdict(
            COWORKER_KEY, GuardedVault.Verdict.Denied, keccak256("x"), block.timestamp, address(vault), notPrimaryPost.requestHash
        );
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.NotPrimarySource.selector, "HASCRepublicans"));
        vault.haltOnDenial(notPrimaryId, notPrimaryPost, v);
    }

    function test_haltVerdictCannotBeReused() public {
        GuardedVault.SignedVerdict memory v = denied();
        vault.haltOnDenial(denialId, denialPost, v);
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.VerdictAlreadyUsed.selector, v.resultHash));
        vault.haltOnDenial(denialId, denialPost, v);
    }
}

/// @notice Property tests: the guarantees above must hold for every input, not only the fixtures we picked.
contract GuardedVaultFuzzTest is VaultFixtures {
    uint256 constant SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    /// Any single changed byte of a signed price breaks the signature.
    function testFuzz_anyEditedByteIsRejected(uint256 position, uint8 delta) public {
        GuardedVault.AirnodeResponse memory r = ethPrice;
        position = bound(position, 0, r.data.length - 1);
        delta = uint8(bound(delta, 1, 255));
        unchecked {
            r.data[position] = bytes1(uint8(r.data[position]) + delta);
        }
        vm.expectPartialRevert(GuardedVault.SignatureMismatch.selector);
        vault.verifyPrice(r);
    }

    /// Any other timestamp breaks the signature too, so a stale response cannot be made to look fresh.
    function testFuzz_editedTimestampIsRejected(uint256 timestamp) public {
        GuardedVault.AirnodeResponse memory r = ethPrice;
        timestamp = bound(timestamp, 1, block.timestamp);
        vm.assume(timestamp != r.timestamp);
        r.timestamp = timestamp;
        vm.expectPartialRevert(GuardedVault.SignatureMismatch.selector);
        vault.verifyPrice(r);
    }

    /// The same signed price is accepted while fresh and rejected, with its age, once older than 60 seconds.
    function testFuzz_freshnessBoundary(uint256 age) public {
        age = bound(age, 0, 30 days);
        vm.warp(ethPrice.timestamp + age);
        if (age <= 10) {
            (uint256 price,) = vault.verifyPrice(ethPrice);
            assertGt(price, 0);
        } else if (age > 60) {
            vm.expectRevert(abi.encodeWithSelector(GuardedVault.PriceResponseTooOld.selector, ethPrice.timestamp, age));
            vault.verifyPrice(ethPrice);
        }
    }

    /// A correctly signed response from any key other than the Nodary Airnode is refused.
    function testFuzz_anyOtherKeyIsRejected(uint256 key) public {
        key = bound(key, 1, SECP256K1_N - 1);
        address signer = vm.addr(key);
        vm.assume(signer != NODARY);
        GuardedVault.AirnodeResponse memory r = ethPrice;
        r.airnode = signer;
        r.signature = signResponse(key, r.requestHash, r.timestamp, r.data);
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.UnexpectedAirnode.selector, signer, NODARY));
        vault.verifyPrice(r);
    }

    /// A verdict signed for any other vault does not work on this one.
    function testFuzz_verdictIsBoundToThisVault(address otherVault) public {
        vm.assume(otherVault != address(vault));
        GuardedVault.SignedVerdict memory v = signVerdict(
            COWORKER_KEY, GuardedVault.Verdict.Confirmed, keccak256("x"), block.timestamp, otherVault, whiteHousePost.requestHash
        );
        vm.expectPartialRevert(GuardedVault.VerdictNotSignedBySecondSource.selector);
        vault.executeTrade(ethPrice, whiteHouseId, whiteHousePost, v, 1000e18);
    }

    /// Whatever the result hash, a verdict trades once and never again.
    function testFuzz_verdictIsSingleUse(bytes32 resultHash) public {
        GuardedVault.SignedVerdict memory v = signVerdict(
            COWORKER_KEY, GuardedVault.Verdict.Confirmed, resultHash, block.timestamp, address(vault), whiteHousePost.requestHash
        );
        vault.executeTrade(ethPrice, whiteHouseId, whiteHousePost, v, 1000e18);
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.VerdictAlreadyUsed.selector, resultHash));
        vault.executeTrade(ethPrice, whiteHouseId, whiteHousePost, v, 1000e18);
    }

    /// At any moment inside the halt, no trade goes through, whoever sends it.
    function testFuzz_noTradeDuringTheHalt(uint256 elapsed, address caller) public {
        vault.haltOnDenial(denialId, denialPost, denied());
        uint256 until = vault.haltedUntil();
        elapsed = bound(elapsed, 0, 1 hours - 1);
        vm.warp(block.timestamp + elapsed);
        GuardedVault.SignedVerdict memory v = confirmed();
        vm.prank(caller);
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.TradingHalted.selector, until));
        vault.executeTrade(ethPrice, whiteHouseId, whiteHousePost, v, 1000e18);
    }

    /// Any notional buys exactly notional / price of mock ETH, and the books add up.
    function testFuzz_tradeAmountMatchesThePrice(uint96 notional) public {
        vm.assume(notional > 0);
        (uint256 price,) = vault.verifyPrice(ethPrice);
        uint256 bought = vault.executeTrade(ethPrice, whiteHouseId, whiteHousePost, confirmed(), notional);
        assertEq(bought, (uint256(notional) * 1e18) / price);
        assertEq(vault.ethBought(), bought);
        assertEq(vault.trades(), 1);
    }
}
