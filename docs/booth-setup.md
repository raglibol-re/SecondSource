# Booth setup (do this before reaching the front of the queue)

Setup time counts against the 2:30, so everything below is open and loaded before you start.

## Browser, light mode (toggle in the top bar), in this order
1. https://secondsource-two.vercel.app (home, stamp)
2. https://secondsource-two.vercel.app/check?replay=hassett-2025-04-07 (reload right before you show it; it plays itself)
3. https://secondsource-two.vercel.app/vault?run (reload right before you show it; it runs the tamper test)
4. https://secondsource-two.vercel.app/receipts (On chain section, then transactions)
5. BaseScan, the trade on a White House post:
   https://sepolia.basescan.org/tx/0x0cd73b4e626ef8b67573b9bb02883cbb7db849b088d9e7daaadc16a4e83913ed (Logs tab)
6. BaseScan, the halt with the "FAKE NEWS" post:
   https://sepolia.basescan.org/tx/0x5c63424838f7ba6c39907eca6fa8c4986fd61f99d90dd31554b5df4643fb9617 (Logs tab)
7. Cardanoscan, the paid job's escrow, result hash and payout (links in the README "For judges")

## Terminals, in the repo, font size up
- **Terminal A:** `pnpm agent "Hassett: Trump considering 90-day tariff pause" --naive` typed, not run.
- **Terminal B:** `pnpm tamper-test` typed, not run (1 to 2 s, the backup for tab 3).
- **Terminal C:** the output of an earlier `pnpm x402:buy …` and `pnpm vault:act …` run, scrolled to the result.
  Both take longer than a booth slot allows live.

## Checks one hour before
```sh
pnpm wallet:balance           # aUSD above 0.5, ETH above 0.001
pnpm tamper-test              # PASS
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://secondsource-two.vercel.app/api/x402/check -H 'content-type: application/json' -d '{"headline":"Hassett: Trump considering 90-day tariff pause"}'   # 402
```
The vault halt from a test lasts an hour. If you want to show a live trade, check `haltedUntil` on the vault's BaseScan
"Read contract" tab first.

## If the venue Wi-Fi fails
- `pnpm site:local`, then open http://127.0.0.1:4021: the recorded checks replay and receipts verify with no network.
- `pnpm tamper-test --offline` runs the same five tamper cases as Foundry tests on saved real signed responses.
- `pnpm contracts:test` runs all 30 contract tests offline.
- Explorer links won't load offline. Screenshots are in `docs/screenshots/`.
