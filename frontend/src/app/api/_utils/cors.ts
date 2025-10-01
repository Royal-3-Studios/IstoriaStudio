// FILE: src/app/api/_utils/cors.ts
import { NextResponse, type NextRequest } from "next/server";

type CorsRules = {
  origin: string[];
  methods?: string[];
  headers?: string[];
  maxAgeSec?: number;
  credentials?: boolean;
};

const DEFAULT_RULES: CorsRules = {
  origin: [process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  headers: ["Content-Type", "Authorization"],
  maxAgeSec: 600,
  credentials: true,
};

function matchOrigin(
  reqOrigin: string | null,
  allowed: string[]
): string | null {
  if (!reqOrigin) return null;
  // Exact match or wildcard “*” (only when credentials=false)
  return allowed.includes(reqOrigin) ? reqOrigin : null;
}

export function corsHeaders(req: NextRequest, rules: Partial<CorsRules> = {}) {
  const merged: CorsRules = { ...DEFAULT_RULES, ...rules };
  const reqOrigin = req.headers.get("origin");
  const matched = matchOrigin(reqOrigin, merged.origin);
  const allowOrigin = merged.credentials
    ? matched ?? merged.origin[0]
    : matched ?? "*";

  const h = new Headers();
  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Origin", allowOrigin);
  h.set("Access-Control-Allow-Methods", merged.methods!.join(", "));
  h.set("Access-Control-Allow-Headers", merged.headers!.join(", "));
  h.set("Access-Control-Max-Age", String(merged.maxAgeSec));
  if (merged.credentials) h.set("Access-Control-Allow-Credentials", "true");
  return h;
}

export function handleOptions(req: NextRequest, rules?: Partial<CorsRules>) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req, rules),
  });
}

export function withCors(
  resp: NextResponse,
  req: NextRequest,
  rules?: Partial<CorsRules>
) {
  const h = corsHeaders(req, rules);
  h.forEach((v, k) => resp.headers.set(k, v));
  return resp;
}
