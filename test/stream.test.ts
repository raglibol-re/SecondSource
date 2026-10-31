import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ndjsonStream } from '../src/x402/stream.ts';

test('the stream delivers each event as one JSON line', async () => {
  const res = ndjsonStream(async (send) => {
    send({ type: 'plan' });
    send({ type: 'result', ok: true });
  });
  const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.type), ['plan', 'result']);
  assert.equal(res.headers.get('content-type'), 'application/x-ndjson');
});

test('when the buyer disconnects, the work sees it and must not settle', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let openAfterCancel: boolean | undefined;
  const done = new Promise<void>((resolve) => {
    const res = ndjsonStream(async (send, isOpen) => {
      send({ type: 'plan' });
      await gate;
      openAfterCancel = isOpen();
      resolve();
    });
    const reader = res.body!.getReader();
    reader.read().then(() => reader.cancel()).then(() => release());
  });
  await done;
  assert.equal(openAfterCancel, false);
});
