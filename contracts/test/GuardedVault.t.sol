// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {AirnodeV2Attestation} from "../src/AirnodeV2Attestation.sol";
import {GuardedVault} from "../src/GuardedVault.sol";
import {AirnodeV2Test} from "./utils/AirnodeV2Test.sol";

contract GuardedVaultTest is AirnodeV2Test {
    // keccak256 of ["latestFeeds", {name: ETH/USD}, {price, updatedAt}], from `src/vault/nodary.ts`
    bytes32 constant ETH_REQUEST = 0x180eae9387bb66a72380e61ebe0a00d19f8414a716a37ebe1df124b66acfff66;

    GuardedVault vault;
    uint256 coworkerKey = 0xC0FFEE;
    GuardedVault.SignedPrice ethPrice; // real response signed by the Nodary Airnode
    GuardedVault.SignedPrice btcPrice; // real response to a different request

    function setUp() public {
        vault = new GuardedVault(ETH_REQUEST, vm.addr(coworkerKey));
        ethPrice = load("test/fixtures/nodary-eth-usd.json");
        btcPrice = load("test/fixtures/nodary-btc-usd.json");
        vm.warp(ethPrice.timestamp + 10);
    }

    function load(string memory path) internal view returns (GuardedVault.SignedPrice memory p) {
        string memory json = vm.readFile(path);
        p.timestamp = vm.parseUint(vm.parseJsonString(json, ".timestamp"));
        p.data = bytes(vm.parseJsonString(json, ".data"));
        p.signature = vm.parseJsonBytes(json, ".signature");
    }

    function verdict(uint256 key, GuardedVault.Verdict v, bytes32 resultHash, uint256 signedAt, address forVault)
        internal
        returns (GuardedVault.SignedVerdict memory s)
    {
        bytes32 digest = keccak256(abi.encode(vault.VERDICT_TAG(), block.chainid, forVault, resultHash, v, signedAt));
        (uint8 v_, bytes32 r, bytes32 s_) = vm.sign(key, MessageHashUtils.toEthSignedMessageHash(digest));
        s = GuardedVault.SignedVerdict(resultHash, v, signedAt, abi.encodePacked(r, s_, v_));
    }

    function confirmed() internal returns (GuardedVault.SignedVerdict memory) {
        return verdict(coworkerKey, GuardedVault.Verdict.Confirmed, keccak256("result"), block.timestamp, address(vault));
    }

    function test_validProofsExecuteTheTrade() public {
        uint256 eth = vault.executeTrade(ethPrice, confirmed(), 1000e18);
        // 1000 USD at the signed ETH/USD price
        assertGt(eth, 0);
        assertEq(vault.trades(), 1);
        assertEq(vault.ethBought(), eth);
    }

    function test_digestMatchesTheContract() public view {
        bytes32 h = keccak256("result");
        assertEq(
            vault.verdictDigest(h, GuardedVault.Verdict.Confirmed, 7),
            keccak256(abi.encode(vault.VERDICT_TAG(), block.chainid, address(vault), h, GuardedVault.Verdict.Confirmed, uint256(7)))
        );
    }

    function test_revertsWhenPriceIsSignedByAnotherKey() public {
        GuardedVault.SignedPrice memory fake = ethPrice;
        fake.signature = signResponse(0xBAD, ETH_REQUEST, fake.timestamp, fake.data);
        GuardedVault.SignedVerdict memory v = confirmed();
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        vault.executeTrade(fake, v, 1000e18);
    }

    function test_revertsWhenPriceAnswersAnotherRequest() public {
        vm.warp(btcPrice.timestamp + 10);
        GuardedVault.SignedVerdict memory v = confirmed();
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        vault.executeTrade(btcPrice, v, 1000e18);
    }

    function test_revertsWhenPriceDataIsTampered() public {
        GuardedVault.SignedPrice memory tampered = ethPrice;
        tampered.data = bytes('{"price":1.00,"updatedAt":1793402454211}');
        GuardedVault.SignedVerdict memory v = confirmed();
        vm.expectPartialRevert(AirnodeV2Attestation.NotSignedByAirnode.selector);
        vault.executeTrade(tampered, v, 1000e18);
    }

    function test_revertsWhenPriceIsStale() public {
        vm.warp(ethPrice.timestamp + 61);
        GuardedVault.SignedVerdict memory v = confirmed();
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.PriceResponseTooOld.selector, ethPrice.timestamp));
        vault.executeTrade(ethPrice, v, 1000e18);
    }

    function test_revertsOnDeniedVerdict() public {
        GuardedVault.SignedVerdict memory v =
            verdict(coworkerKey, GuardedVault.Verdict.Denied, keccak256("result"), block.timestamp, address(vault));
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.VerdictNotConfirmed.selector, GuardedVault.Verdict.Denied));
        vault.executeTrade(ethPrice, v, 1000e18);
    }

    function test_revertsOnUnconfirmedVerdict() public {
        GuardedVault.SignedVerdict memory v =
            verdict(coworkerKey, GuardedVault.Verdict.Unconfirmed, keccak256("result"), block.timestamp, address(vault));
        vm.expectRevert(
            abi.encodeWithSelector(GuardedVault.VerdictNotConfirmed.selector, GuardedVault.Verdict.Unconfirmed)
        );
        vault.executeTrade(ethPrice, v, 1000e18);
    }

    function test_revertsWhenVerdictSignedByAnotherKey() public {
        GuardedVault.SignedVerdict memory v =
            verdict(0xBAD, GuardedVault.Verdict.Confirmed, keccak256("result"), block.timestamp, address(vault));
        vm.expectPartialRevert(GuardedVault.VerdictNotSignedBySecondSource.selector);
        vault.executeTrade(ethPrice, v, 1000e18);
    }

    function test_revertsWhenVerdictWasForAnotherVault() public {
        GuardedVault.SignedVerdict memory v =
            verdict(coworkerKey, GuardedVault.Verdict.Confirmed, keccak256("result"), block.timestamp, address(0xBEEF));
        vm.expectPartialRevert(GuardedVault.VerdictNotSignedBySecondSource.selector);
        vault.executeTrade(ethPrice, v, 1000e18);
    }

    function test_revertsWhenVerdictIsFlippedAfterSigning() public {
        GuardedVault.SignedVerdict memory v =
            verdict(coworkerKey, GuardedVault.Verdict.Denied, keccak256("result"), block.timestamp, address(vault));
        v.verdict = GuardedVault.Verdict.Confirmed; // relabel a DENIED signature as CONFIRMED
        vm.expectPartialRevert(GuardedVault.VerdictNotSignedBySecondSource.selector);
        vault.executeTrade(ethPrice, v, 1000e18);
    }

    function test_revertsOnOldVerdict() public {
        uint256 signedAt = block.timestamp;
        GuardedVault.SignedVerdict memory v =
            verdict(coworkerKey, GuardedVault.Verdict.Confirmed, keccak256("result"), signedAt - 2 hours, address(vault));
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.VerdictTooOld.selector, signedAt - 2 hours));
        vault.executeTrade(ethPrice, v, 1000e18);
    }

    function test_revertsWhenVerdictIsReused() public {
        GuardedVault.SignedVerdict memory v = confirmed();
        vault.executeTrade(ethPrice, v, 1000e18);
        vm.expectRevert(abi.encodeWithSelector(GuardedVault.VerdictAlreadyUsed.selector, v.resultHash));
        vault.executeTrade(ethPrice, v, 1000e18);
    }
}
