// src/app/api/project/[project_id]/route.ts
import { NextRequest, NextResponse } from "next/server";

const NEXT_PUBLIC_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function DELETE(
  req: NextRequest,
  ctx: { params: { project_id: string } }
) {
  const { project_id } = ctx.params;
  const cascade =
    new URL(req.url).searchParams.get("cascade") ?? "project_only";

  const resp = await fetch(
    `${NEXT_PUBLIC_BACKEND_URL}/api/project/${project_id}?cascade=${encodeURIComponent(cascade)}`,
    {
      method: "DELETE",
      headers: {
        cookie: req.headers.get("cookie") ?? "",
        accept: "application/json",
      },
      cache: "no-store",
    }
  );

  const text = await resp.text();
  return new NextResponse(text, {
    status: resp.status,
    headers: {
      "content-type": resp.headers.get("content-type") || "application/json",
    },
  });
}
