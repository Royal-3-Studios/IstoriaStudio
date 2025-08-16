// src/lib/api.ts
export const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

type FetchOpts = RequestInit & { asJson?: boolean };

export async function apiFetch(path: string, opts: FetchOpts = {}) {
  const url = path.startsWith("http") ? path : `${BACKEND}${path}`;
  const res = await fetch(url, {
    credentials: "include",
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }

  return opts.asJson === false ? res : res.json();
}
