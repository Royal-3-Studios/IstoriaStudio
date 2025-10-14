// src/app/api/project/[projectId]/route.ts
import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

function forwardSetCookie(from: Response, to: NextResponse) {
  // Next’s fetch on the server may expose getSetCookie(); fall back to single header.
  const setCookie =
    from.headers.getSetCookie?.() ?? from.headers.get("set-cookie");
  if (!setCookie) return;
  if (Array.isArray(setCookie)) {
    for (const c of setCookie) to.headers.append("set-cookie", c);
  } else {
    to.headers.set("set-cookie", setCookie);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { project_id: string } }
) {
  const projectId = encodeURIComponent(params.project_id);
  const cascade =
    new URL(req.url).searchParams.get("cascade") ?? "project_only";

  try {
    const upstream = await fetch(
      `${BACKEND}/api/project/${projectId}?cascade=${encodeURIComponent(cascade)}`,
      {
        method: "DELETE",
        headers: {
          cookie: req.headers.get("cookie") ?? "",
          authorization: req.headers.get("authorization") ?? "",
          accept: "application/json",
        },
        credentials: "include",
        cache: "no-store",
      }
    );

    // Try JSON first, but don’t throw if body is empty or not JSON.
    const cloned = upstream.clone();
    const contentType = upstream.headers.get("content-type") || "";
    let body: unknown = null;

    if (contentType.includes("application/json")) {
      body = await cloned.json().catch(() => null);
    } else {
      const txt = await cloned.text().catch(() => "");
      // return text as-is if not JSON
      const res = new NextResponse(txt, {
        status: upstream.status,
        headers: { "content-type": contentType || "text/plain" },
      });
      forwardSetCookie(upstream, res);
      return res;
    }

    const res = NextResponse.json(body, { status: upstream.status });
    forwardSetCookie(upstream, res);
    return res;
  } catch {
    return NextResponse.json(
      { error: "Upstream unavailable" },
      { status: 502 }
    );
  }
}
