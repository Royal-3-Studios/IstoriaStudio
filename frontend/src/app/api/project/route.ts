// src/app/api/project/route.ts
import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
const TARGET = `${BACKEND}/api/project`;

export const dynamic = "force-dynamic"; // ensure no static caching
export const revalidate = 0; // and no ISR caching
export const runtime = "nodejs"; // avoid edge fetch quirks

function forwardHeaders(req: NextRequest): Headers {
  const h = new Headers();
  const cookie = req.headers.get("cookie");
  const auth = req.headers.get("authorization");
  if (cookie) h.set("cookie", cookie);
  if (auth) h.set("authorization", auth);
  // Don't set content-type here for GET; POST will set JSON below.
  return h;
}

function passthroughSetCookie(from: Response, to: NextResponse) {
  // Node fetch can return multiple Set-Cookie headers; forward them all.
  const setCookies = from.headers.getSetCookie?.() ?? [];
  if (setCookies.length) {
    for (const sc of setCookies) to.headers.append("set-cookie", sc);
  } else {
    const single = from.headers.get("set-cookie");
    if (single) to.headers.set("set-cookie", single);
  }
}

export async function GET(req: NextRequest) {
  // preserve query string (?page=..., ?status=..., etc.)
  const url = new URL(req.url);
  const qs = url.search ?? "";

  const res = await fetch(`${TARGET}${qs}`, {
    method: "GET",
    headers: forwardHeaders(req),
    // credentials: 'include' is not needed server->server, cookies are in headers
    cache: "no-store",
  });

  const text = await res.text(); // pass through exactly what FastAPI sent
  const out = new NextResponse(text, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
    },
  });
  passthroughSetCookie(res, out);
  return out;
}

export async function POST(req: NextRequest) {
  const body = await req.text(); // don’t double-parse/re-stringify
  const headers = forwardHeaders(req);
  headers.set(
    "content-type",
    req.headers.get("content-type") ?? "application/json"
  );

  const res = await fetch(`${TARGET}/`, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });

  const text = await res.text();
  const out = new NextResponse(text, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
    },
  });
  passthroughSetCookie(res, out);
  return out;
}

// Optional, but nice to have if a browser ever preflights to this route
export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
