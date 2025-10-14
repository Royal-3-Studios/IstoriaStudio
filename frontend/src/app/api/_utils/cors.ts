// FILE: src/app/api/_utils/cors.ts
import { NextResponse, type NextRequest } from "next/server";

type CorsRules = {
  /** Allowed origins (exact match). */
  origin: string[];
  /** Allowed methods. */
  methods?: string[];
  /** Allowed request headers. */
  headers?: string[];
  /** Preflight cache time (seconds). */
  maxAgeSec?: number;
  /** If true, allow credentials and echo a specific origin. */
  credentials?: boolean;
};

const DEFAULT_RULES: Required<CorsRules> = {
  origin: [process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  headers: ["Content-Type", "Authorization"],
  maxAgeSec: 600,
  credentials: true,
};

function normalizeRules(rules: Partial<CorsRules> = {}): Required<CorsRules> {
  return {
    origin:
      rules.origin && rules.origin.length > 0
        ? rules.origin
        : DEFAULT_RULES.origin,
    methods: rules.methods ?? DEFAULT_RULES.methods,
    headers: rules.headers ?? DEFAULT_RULES.headers,
    maxAgeSec: rules.maxAgeSec ?? DEFAULT_RULES.maxAgeSec,
    credentials: rules.credentials ?? DEFAULT_RULES.credentials,
  };
}

function matchOrigin(
  reqOrigin: string | null,
  allowed: string[]
): string | null {
  if (!reqOrigin) return null;
  return allowed.includes(reqOrigin) ? reqOrigin : null;
}

/** Build CORS headers for a given request + rule set. */
export function corsHeaders(
  req: NextRequest,
  rules: Partial<CorsRules> = {}
): Headers {
  const merged = normalizeRules(rules);
  const reqOrigin = req.headers.get("origin");
  const matched = matchOrigin(reqOrigin, merged.origin);

  // When credentials=true, we must return a concrete origin (not "*")
  const primaryOrigin =
    merged.origin.length > 0 ? merged.origin[0]! : DEFAULT_RULES.origin[0]!;
  const allowOrigin: string = merged.credentials
    ? matched ?? primaryOrigin
    : matched ?? "*";

  const h = new Headers();
  // Helpful for caches/CDNs when Origin varies
  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Origin", allowOrigin);
  h.set("Access-Control-Allow-Methods", merged.methods.join(", "));
  h.set("Access-Control-Allow-Headers", merged.headers.join(", "));
  h.set("Access-Control-Max-Age", String(merged.maxAgeSec));
  if (merged.credentials) h.set("Access-Control-Allow-Credentials", "true");
  return h;
}

/** Quick preflight handler for OPTIONS requests. */
export function handleOptions(
  req: NextRequest,
  rules?: Partial<CorsRules>
): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req, rules),
  });
}

/** Attach CORS headers to a JSON/stream/file response. */
export function withCors<T extends NextResponse>(
  resp: T,
  req: NextRequest,
  rules?: Partial<CorsRules>
): T {
  const h = corsHeaders(req, rules);
  h.forEach((v, k) => resp.headers.set(k, v));
  return resp;
}
