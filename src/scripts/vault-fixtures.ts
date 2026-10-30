import { writeFileSync } from 'node:fs';
import { fetchSignedPrice, priceRequestHash } from '../vault/nodary.ts';
for (const [feed, file] of [['ETH/USD', 'nodary-eth-usd'], ['BTC/USD', 'nodary-btc-usd']] as const) {
  const r = await fetchSignedPrice(feed);
  writeFileSync(`contracts/test/fixtures/${file}.json`, JSON.stringify(r, null, 2) + '\n');
  console.log(feed, priceRequestHash(feed), r.data);
}
