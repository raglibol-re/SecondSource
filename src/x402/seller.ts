// Sells one route over x402 on Cardano preprod, for Web-standard Request/Response handlers (Vercel functions).
// Follows the Cardano Foundation's x402 Express template (developers.cardano.org/x402) and the @x402/express adapter,
// with the same core calls: processHTTPRequest before the handler, processSettlement after it.
import { ExactCardanoScheme } from '@x402/cardano/exact/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { HTTPFacilitatorClient, x402HTTPResourceServer, x402ResourceServer } from '@x402/core/server';

export const X402_NETWORK = 'cardano:preprod' as const;
// 2 tADA: comfortably above Cardano's min-UTxO; tADA is the asset the template recommends for preprod.
export const X402_PRICE_LOVELACE = process.env.X402_PRICE_LOVELACE ?? '2000000';
// SecondSource's Masumi selling wallet on preprod (public address), so x402 and escrow income land in one place.
export const X402_PAY_TO =
  process.env.X402_PAY_TO ?? 'addr_test1qq53schsdqekjahucft5uaadln9yvlhsgkrtagnl7vkx8kkc0nfmcsyy3knk4z56glq3n3e40kstkx2txl4887ymk3dqf2fnzu';
// Hosted by the Cardano Foundation; the public x402.org facilitator does not support Cardano.
export const X402_FACILITATOR = process.env.X402_FACILITATOR_URL ?? 'https://x402.preprod.dev.ecosyseng.cf-deployments.org';

// Second way to pay: USDC on Base Sepolia from any browser wallet. The x402 "exact" scheme has the wallet sign an
// EIP-3009 transfer authorization, so the buyer pays no gas; the x402.org facilitator settles it.
export const X402_EVM_NETWORK = 'eip155:84532' as const;
export const X402_EVM_PRICE = process.env.X402_EVM_PRICE ?? '$0.10';
export const X402_EVM_PAY_TO = process.env.X402_EVM_PAY_TO ?? '0x40C29519D7D6a5DA160e7a371c9fb506E8aC031e';
export const X402_EVM_FACILITATOR = process.env.X402_EVM_FACILITATOR_URL ?? 'https://x402.org/facilitator';

class WebAdapter {
  private url: URL;
  private req: Request;
  private body: unknown;
  constructor(req: Request, body: unknown) {
    this.req = req;
    this.body = body;
    this.url = new URL(req.url);
  }
  getHeader(name: string) {
    return this.req.headers.get(name) ?? undefined;
  }
  getMethod() {
    return this.req.method;
  }
  getPath() {
    return this.url.pathname;
  }
  getUrl() {
    return this.req.url;
  }
  getAcceptHeader() {
    return this.req.headers.get('accept') ?? '';
  }
  getUserAgent() {
    return this.req.headers.get('user-agent') ?? '';
  }
  getQueryParams() {
    return Object.fromEntries(this.url.searchParams);
  }
  getQueryParam(name: string) {
    return this.url.searchParams.get(name) ?? undefined;
  }
  getBody() {
    return this.body;
  }
}

export interface PaidRoute {
  method: 'GET' | 'POST';
  path: string;
  description: string;
}

// Every paid route, all priced the same: 2 tADA on Cardano preprod or 0.10 USDC on Base Sepolia.
export const PAID_ROUTES: PaidRoute[] = [
  { method: 'POST', path: '/api/x402/check', description: 'SecondSource: check a market headline against signed primary sources' },
  { method: 'POST', path: '/api/x402/investigate', description: 'SecondSource: an agent investigates a headline you describe, streaming each step' },
];

let httpServer: x402HTTPResourceServer | undefined;
let ready: Promise<void> | undefined;
const server = () => {
  if (!httpServer) {
    const resourceServer = new x402ResourceServer([
      new HTTPFacilitatorClient({ url: X402_FACILITATOR }),
      new HTTPFacilitatorClient({ url: X402_EVM_FACILITATOR }),
    ]);
    resourceServer.register(X402_NETWORK, new ExactCardanoScheme());
    resourceServer.register(X402_EVM_NETWORK, new ExactEvmScheme());
    const routes = Object.fromEntries(
      PAID_ROUTES.map((r) => [
        `${r.method} ${r.path}`,
        {
          accepts: [
            { scheme: 'exact', network: X402_NETWORK, price: { amount: X402_PRICE_LOVELACE, asset: 'lovelace' }, payTo: X402_PAY_TO },
            { scheme: 'exact', network: X402_EVM_NETWORK, price: X402_EVM_PRICE, payTo: X402_EVM_PAY_TO },
          ],
          description: r.description,
          mimeType: 'application/json',
        },
      ])
    );
    httpServer = new x402HTTPResourceServer(resourceServer, routes as never);
    ready = httpServer.initialize();
  }
  return { http: httpServer, ready: ready! };
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

type Settle = (responseBody: Buffer) => Promise<{ ok: true; headers: Record<string, string> } | { ok: false; status: number; body: unknown; headers: Record<string, string> }>;

// Verifies the payment on a request. Returns the response to send (402 or an error), or a `settle` function to call
// once the paid work succeeded. Not calling it means the buyer is not charged.
// The terms the buyer's verified payment was made under, for the buyer's receipt.
export interface PaymentTerms {
  scheme?: string;
  network?: string;
  amount?: string;
  asset?: string;
  payTo?: string;
}

export const verifyX402Payment = async (req: Request, body: unknown): Promise<{ respond: Response } | { settle: Settle; terms: PaymentTerms }> => {
  const { http, ready } = server();
  const adapter = new WebAdapter(req, body);
  const path = new URL(req.url).pathname;
  const context = {
    adapter,
    path,
    decodedPath: decodeURIComponent(path),
    method: req.method,
    paymentHeader: adapter.getHeader('payment-signature') ?? adapter.getHeader('x-payment'),
  };
  try {
    await ready;
  } catch (e) {
    return { respond: json(503, { error: `The x402 facilitator is unreachable: ${(e as Error).message}` }) };
  }
  const result = await http.processHTTPRequest(context as never);
  if (result.type === 'no-payment-required') return { respond: json(500, { error: 'Route is not priced' }) };
  if (result.type === 'payment-error') {
    const r = result.response;
    const isJson = typeof r.body !== 'string';
    return {
      respond: new Response(isJson ? JSON.stringify(r.body ?? {}) : String(r.body), {
        status: r.status,
        headers: { ...(isJson ? { 'Content-Type': 'application/json' } : {}), ...r.headers },
      }),
    };
  }
  const req0 = result.paymentRequirements as PaymentTerms;
  return {
    terms: { scheme: req0?.scheme, network: req0?.network, amount: req0?.amount, asset: req0?.asset, payTo: req0?.payTo },
    settle: async (responseBody) => {
      const settled = await http.processSettlement(
        result.paymentPayload,
        result.paymentRequirements,
        result.declaredExtensions,
        { request: context, responseBody, responseHeaders: { 'content-type': 'application/json' } } as never,
        undefined,
        result.beforeHandlerSettlement
      );
      if (settled.success) return { ok: true, headers: settled.headers as Record<string, string> };
      return { ok: false, status: settled.response.status, body: settled.response.body ?? { error: 'settlement_failed' }, headers: settled.response.headers as Record<string, string> };
    },
  };
};

// A settlement that failed without a definite answer: the facilitator timed out or returned a server error. On
// 31 Oct 2026 the Cardano facilitator answered 504 after it had already submitted the buyer's 2 tADA (tx 8cf8ad9b…).
// Withholding the verdict then would charge the buyer for nothing, so the work is delivered and SecondSource carries the
// risk of not being paid. A definite rejection (bad signature, insufficient funds) still withholds it.
export const undecidedSettlement = (s: { status?: number; body?: unknown; headers?: Record<string, string> }) => {
  const receipt = settlementFromHeaders(s.headers ?? {}) as { errorReason?: string } | null;
  const reason = `${receipt?.errorReason ?? ''} ${JSON.stringify(s.body ?? '')}`;
  return (s.status ?? 0) >= 500 || /\b50[234]\b|time-?out|timed out|gateway|ECONNRESET|ETIMEDOUT|fetch failed/i.test(reason);
};

// JSON route for agents (e.g. @x402/fetch): runs `handler` after the payment verified, settles only if it succeeded.
export const sellWithX402 = async (
  req: Request,
  body: unknown,
  _route: PaidRoute,
  handler: () => Promise<{ status: number; body: unknown }>
): Promise<Response> => {
  const v = await verifyX402Payment(req, body);
  if ('respond' in v) return v.respond;
  const out = await handler();
  if (out.status >= 400) return json(out.status, out.body); // not settled: the buyer keeps their money
  const responseBody = Buffer.from(JSON.stringify(out.body));
  const s = await v.settle(responseBody);
  if (!s.ok && undecidedSettlement(s)) {
    // The facilitator did not answer (timeout or 5xx); the payment may already be on chain. Deliver the work.
    return new Response(responseBody, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Settlement': 'unconfirmed' } });
  }
  if (!s.ok) return new Response(JSON.stringify(s.body), { status: s.status, headers: { 'Content-Type': 'application/json', ...s.headers } });
  return new Response(responseBody, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', ...s.headers } });
};

// Decodes the settlement receipt the facilitator returned (PAYMENT-RESPONSE header value).
export const settlementFromHeaders = (headers: Record<string, string>) => {
  const h = Object.entries(headers).find(([k]) => k.toLowerCase() === 'payment-response')?.[1];
  if (!h) return null;
  try {
    return JSON.parse(Buffer.from(h, 'base64').toString('utf8')) as { success?: boolean; transaction?: string; network?: string; payer?: string };
  } catch {
    return null;
  }
};
