// src/lib/api.ts
export const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

type JsonValue = unknown;

type FetchOpts = Omit<RequestInit, "headers" | "body"> & {
  /** If true (default), parse JSON and return T; if false, return Response */
  asJson?: boolean;
  /** Optional headers to merge */
  headers?: Record<string, string>;
  /** Body may be an object (auto-JSON) or a string/Blob/etc (passed through).
   *  NOTE: When present, it must be non-undefined under exactOptionalPropertyTypes. */
  body?: BodyInit | Record<string, unknown> | null;
};

function resolveUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const base = BACKEND.replace(/\/+$/, "");
  const tail = path.startsWith("/") ? path : `/${path}`;
  return `${base}${tail}`;
}

/** Normalize object bodies to JSON and ensure we return a body suitable for fetch: BodyInit|null (never undefined). */
function normalizeBodyAndHeaders(
  body: BodyInit | Record<string, unknown> | null | undefined,
  headersIn: Record<string, string> | undefined
): { body: BodyInit | null; headers: Record<string, string> } {
  const headers: Record<string, string> = { ...(headersIn ?? {}) };

  if (
    body != null &&
    typeof body === "object" &&
    !(body instanceof Blob) &&
    !(body instanceof FormData) &&
    !(body instanceof ArrayBuffer) &&
    !(body instanceof URLSearchParams)
  ) {
    if (!("Content-Type" in headers) && !("content-type" in headers)) {
      headers["Content-Type"] = "application/json";
    }
    return { body: JSON.stringify(body), headers };
  }

  // convert undefined → null for fetch()
  return { body: (body as BodyInit | null | undefined) ?? null, headers };
}

/**
 * Core fetch wrapper.
 * - Includes cookies
 * - Auto JSON-serialize object bodies
 * - Throws on !res.ok with response text
 */
export async function apiFetch<T = JsonValue>(
  path: string,
  opts: FetchOpts = {}
): Promise<T | Response> {
  const url = resolveUrl(path);

  // peel off custom fields so we don't spread them into fetch()
  const { asJson = true, headers: hdrsIn, body, ...init } = opts;

  const { body: normalizedBody, headers } = normalizeBodyAndHeaders(
    body,
    hdrsIn
  );

  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers,
    body: normalizedBody, // BodyInit | null (never undefined)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }

  return asJson ? ((await res.json()) as T) : res;
}

/* --------------------------- convenience helpers --------------------------- */

export function apiGet<T = JsonValue>(
  path: string,
  opts: Omit<FetchOpts, "method" | "body"> = {}
) {
  return apiFetch<T>(path, { ...opts, method: "GET" });
}

export function apiPost<T = JsonValue>(
  path: string,
  body?: FetchOpts["body"],
  opts: Omit<FetchOpts, "method" | "body"> = {}
) {
  // only include `body` when it’s not undefined (avoids the exactOptionalPropertyTypes error)
  return apiFetch<T>(path, {
    ...opts,
    method: "POST",
    ...(body !== undefined ? { body } : {}),
  });
}

export function apiPatch<T = JsonValue>(
  path: string,
  body?: FetchOpts["body"],
  opts: Omit<FetchOpts, "method" | "body"> = {}
) {
  return apiFetch<T>(path, {
    ...opts,
    method: "PATCH",
    ...(body !== undefined ? { body } : {}),
  });
}

export function apiPut<T = JsonValue>(
  path: string,
  body?: FetchOpts["body"],
  opts: Omit<FetchOpts, "method" | "body"> = {}
) {
  return apiFetch<T>(path, {
    ...opts,
    method: "PUT",
    ...(body !== undefined ? { body } : {}),
  });
}

export function apiDelete<T = JsonValue>(
  path: string,
  opts: Omit<FetchOpts, "method" | "body"> = {}
) {
  return apiFetch<T>(path, { ...opts, method: "DELETE" });
}
