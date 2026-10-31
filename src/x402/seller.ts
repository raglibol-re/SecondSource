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

let httpServer: x402HTTPResourceServer | undefined;
let ready: Promise<void> | undefined;
const server = (route: PaidRoute) => {
  if (!httpServer) {
    const resourceServer = new x402ResourceServer([
      new HTTPFacilitatorClient({ url: X402_FACILITATOR }),
      new HTTPFacilitatorClient({ url: X402_EVM_FACILITATOR }),
    ]);
    resourceServer.register(X402_NETWORK, new ExactCardanoScheme());
    resourceServer.register(X402_EVM_NETWORK, new ExactEvmScheme());
    httpServer = new x402HTTPResourceServer(resourceServer, {
      [`${route.method} ${route.path}`]: {
        accepts: [
          { scheme: 'exact', network: X402_NETWORK, price: { amount: X402_PRICE_LOVELACE, asset: 'lovelace' }, payTo: X402_PAY_TO },
          { scheme: 'exact', network: X402_EVM_NETWORK, price: X402_EVM_PRICE, payTo: X402_EVM_PAY_TO },
        ],
        description: route.description,
        mimeType: 'application/json',
      },
    } as never);
    ready = httpServer.initialize();
  }
  return { http: httpServer, ready: ready! };
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

// Runs `handler` only after the payment verified, and settles only if the handler succeeded, so a failed job is not charged.
export const sellWithX402 = async (
  req: Request,
  body: unknown,
  route: PaidRoute,
  handler: () => Promise<{ status: number; body: unknown }>
): Promise<Response> => {
  const { http, ready } = server(route);
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
    return json(503, { error: `The x402 facilitator is unreachable: ${(e as Error).message}` });
  }
  const result = await http.processHTTPRequest(context as never);
  if (result.type === 'no-payment-required') return json(500, { error: 'Route is not priced' });
  if (result.type === 'payment-error') {
    const r = result.response;
    const isJson = typeof r.body !== 'string';
    return new Response(isJson ? JSON.stringify(r.body ?? {}) : String(r.body), {
      status: r.status,
      headers: { ...(isJson ? { 'Content-Type': 'application/json' } : {}), ...r.headers },
    });
  }
  const out = await handler();
  if (out.status >= 400) return json(out.status, out.body); // not settled: the buyer keeps their money
  const responseBody = Buffer.from(JSON.stringify(out.body));
  const settled = await http.processSettlement(
    result.paymentPayload,
    result.paymentRequirements,
    result.declaredExtensions,
    { request: context, responseBody, responseHeaders: { 'content-type': 'application/json' } } as never,
    undefined,
    result.beforeHandlerSettlement
  );
  if (!settled.success) {
    const r = settled.response;
    return new Response(JSON.stringify(r.body ?? { error: 'settlement_failed' }), { status: r.status, headers: { 'Content-Type': 'application/json', ...r.headers } });
  }
  return new Response(responseBody, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', ...settled.headers } });
};
