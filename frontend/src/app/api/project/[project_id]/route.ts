// src/app/api/project/[project_id]/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.API_BASE ?? "http://localhost:8000/api";

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ project_id: string }> } // 👈 params is async
) {
  const { project_id } = await ctx.params; // 👈 await it
  const cascade =
    new URL(req.url).searchParams.get("cascade") ?? "project_only";

  const resp = await fetch(
    `${API_BASE}/project/${project_id}?cascade=${encodeURIComponent(cascade)}`,
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
