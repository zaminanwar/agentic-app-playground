// Same-origin BFF proxy for the LangGraph Agent Server (decision D3).
//
// The browser-side LangGraph SDK (@langchain/langgraph-sdk) and useStream hook
// are pointed at a SAME-ORIGIN base path (`/api/agent`). This route handler
// forwards every SDK request to the PRIVATE agent Cloud Run service, read from
// the server-side `AGENT_URL` env var (NOT a NEXT_PUBLIC_* build arg, so the
// web image stays env-agnostic and promotable dev -> prod).
//
// Because the agent runs with allow_unauthenticated=false, the proxy mints a
// GCP-issued OIDC ID token (audience = AGENT_URL) via the metadata server /
// Application Default Credentials and attaches it as `Authorization: Bearer`.
// The web runtime service account is granted roles/run.invoker on the agent
// (Terraform). Locally (AGENT_URL=http://localhost:2024) no token is minted.
//
// SSE / chunked streaming is preserved: the upstream ReadableStream body is
// passed straight through with no buffering, and streaming headers
// (Content-Type: text/event-stream, etc.) are forwarded verbatim.

import { GoogleAuth } from "google-auth-library";
import { NextRequest } from "next/server";

// Always run on the Node.js runtime (google-auth-library + metadata server
// access are not supported on the Edge runtime) and never cache proxied calls.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reuse a single GoogleAuth instance + per-audience ID token client across
// invocations (module scope survives within a warm Cloud Run instance).
const auth = new GoogleAuth();
const idTokenClientCache = new Map<
  string,
  ReturnType<GoogleAuth["getIdTokenClient"]>
>();

function getAgentBaseUrl(): string {
  const url = process.env.AGENT_URL;
  if (!url) {
    throw new Error(
      "AGENT_URL is not set. The web service must receive the agent's " +
        "internal Cloud Run URL as a server-side runtime env var.",
    );
  }
  // Normalize: strip any trailing slash so we can join with a leading-slash path.
  return url.replace(/\/+$/, "");
}

// Returns an OIDC ID token (audience = agent URL) for calling the private
// Cloud Run agent, or null when targeting a local/non-GCP agent for which no
// auth is needed (e.g. http://localhost:2024 during `langgraph dev`).
async function getAuthorizationHeader(
  audience: string,
): Promise<string | null> {
  // Only attach a GCP ID token when calling an https Cloud Run URL. A local
  // dev server (http://localhost:...) neither needs nor accepts one.
  if (!audience.startsWith("https://")) {
    return null;
  }

  try {
    let clientPromise = idTokenClientCache.get(audience);
    if (!clientPromise) {
      clientPromise = auth.getIdTokenClient(audience);
      idTokenClientCache.set(audience, clientPromise);
    }
    const client = await clientPromise;
    // getRequestHeaders() returns a Headers instance in google-auth-library v9+,
    // but older shapes returned a plain object. Handle both defensively.
    const headers: unknown = await client.getRequestHeaders();
    if (headers instanceof Headers) {
      return headers.get("authorization");
    }
    const record = headers as Record<string, string | undefined>;
    return record.Authorization ?? record.authorization ?? null;
  } catch (err) {
    // If token minting fails (e.g. cache went stale), drop it from the cache so
    // the next request rebuilds the client, and surface the error to the caller.
    idTokenClientCache.delete(audience);
    throw err;
  }
}

// Hop-by-hop / host-specific request headers we must NOT forward upstream.
const STRIPPED_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "keep-alive",
  "upgrade",
  // Drop the browser's accept-encoding so the upstream returns an identity
  // (unencoded) stream we can pass through without re-compressing.
  "accept-encoding",
]);

// Hop-by-hop response headers we must NOT forward back to the browser.
const STRIPPED_RESPONSE_HEADERS = new Set([
  "connection",
  "transfer-encoding",
  "keep-alive",
  "content-encoding",
  "content-length",
]);

async function proxy(
  request: NextRequest,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  let agentBaseUrl: string;
  try {
    agentBaseUrl = getAgentBaseUrl();
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const { path } = await ctx.params;
  const subPath = (path ?? []).map(encodeURIComponent).join("/");

  // Rebuild the upstream URL: <AGENT_URL>/<subPath><original query string>.
  const search = request.nextUrl.search; // includes leading "?" or ""
  const upstreamUrl = `${agentBaseUrl}/${subPath}${search}`;

  // Clone + sanitize request headers for the upstream call.
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  // Attach the GCP OIDC ID token (audience = agent URL) for the private agent.
  let authorization: string | null;
  try {
    authorization = await getAuthorizationHeader(agentBaseUrl);
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Failed to obtain OIDC ID token for the agent service",
        detail: (err as Error).message,
      }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
  if (authorization) {
    headers.set("authorization", authorization);
  }

  // Forward method + body. GET/HEAD must not carry a body. For other methods
  // stream the request body through (duplex: "half" is required when sending a
  // ReadableStream body with fetch).
  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers,
    redirect: "manual",
  };
  if (hasBody) {
    init.body = request.body;
    init.duplex = "half";
  }

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstreamUrl, init);
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Failed to reach the agent service",
        detail: (err as Error).message,
      }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  // Forward response headers (minus hop-by-hop), preserving Content-Type so SSE
  // (text/event-stream) and chunked responses keep working in the browser.
  const responseHeaders = new Headers();
  upstreamResponse.headers.forEach((value, key) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });
  // Discourage any intermediary from buffering the streamed response.
  responseHeaders.set("cache-control", "no-cache, no-transform");

  // Pass the upstream body straight through as a stream (no buffering): this is
  // what makes SSE / chunked streaming work end-to-end.
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
export const HEAD = proxy;
