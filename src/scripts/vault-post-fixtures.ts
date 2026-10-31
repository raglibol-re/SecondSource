import { writeFileSync } from 'node:fs';
import { fetchSignedPost, primarySourceRequestHash } from '../vault/evidence.ts';

// Saves real signed TwitterAPI.io posts (projected) as Foundry fixtures for the Guarded Vault tests.
for (const [postId, name] of [
  ['1909255140671984072', 'post-rapidresponse-denial'],
  ['1910100697980285041', 'post-whitehouse-shipbuilding'],
  ['1910097536024469773', 'post-not-primary'],
] as const) {
  const a = await fetchSignedPost(postId);
  writeFileSync(`contracts/test/fixtures/${name}.json`, JSON.stringify({ postId, ...a.response }, null, 2) + '\n');
  console.log(name, primarySourceRequestHash(postId) === a.response.requestHash ? 'hash ok' : 'HASH MISMATCH', a.response.data);
}
