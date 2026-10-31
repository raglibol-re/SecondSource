// A newline-delimited JSON stream for long investigations. Two things keep it reliable:
// - a heartbeat line every few seconds, because proxies and HTTP/1.1 connections drop a response that sends nothing for
//   a while, and one slow evidence source can keep the agent quiet for a minute (the browser then reports
//   "network error" while reading);
// - `isOpen()`, so a paid route can see that the buyer has gone and skip settling the payment.
export const HEARTBEAT_MS = 5000;

export const ndjsonStream = (work: (send: (o: unknown) => void, isOpen: () => boolean) => Promise<void>): Response => {
  const enc = new TextEncoder();
  let open = true;
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(enc.encode(JSON.stringify(o) + '\n'));
        } catch {
          open = false;
        }
      };
      timer = setInterval(() => send({ type: 'ping', at: Date.now() }), HEARTBEAT_MS);
      try {
        await work(send, () => open);
      } finally {
        clearInterval(timer);
        if (open) {
          open = false;
          try {
            controller.close();
          } catch {}
        }
      }
    },
    cancel() {
      // The client went away.
      open = false;
      clearInterval(timer);
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
};
