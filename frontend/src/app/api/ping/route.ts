// FILE: src/app/api/ping/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { handleOptions, withCors } from "../_utils/cors";
import { setServerCookie } from "../_utils/cookies";

export function OPTIONS(req: NextRequest) {
  // Handles preflight quickly
  return handleOptions(req);
}

export async function GET(req: NextRequest) {
  // Example: set a small cookie to ensure cookies flow
  setServerCookie({ name: "ping", value: "pong", maxAgeSec: 300 });

  const resp = NextResponse.json({ ok: true, ts: Date.now() });
  return withCors(resp, req);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const resp = NextResponse.json({ ok: true, echo: body });
  return withCors(resp, req);
}
