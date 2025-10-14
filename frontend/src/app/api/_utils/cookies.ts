import { cookies } from "next/headers";

type SetCookieOpts = {
  name: string;
  value: string;
  /** Max-Age in seconds (omit for a session cookie). */
  maxAgeSec?: number;
  path?: string;
  sameSite?: "lax" | "strict" | "none";
  httpOnly?: boolean;
  secure?: boolean;
};

/** Set a server cookie with safe defaults (async because `cookies()` is async in your setup). */
export async function setServerCookie({
  name,
  value,
  maxAgeSec,
  path = "/",
  sameSite = "lax",
  httpOnly = true,
  secure = process.env.NODE_ENV === "production",
}: SetCookieOpts): Promise<void> {
  const jar = await cookies(); // <-- async in your environment

  // Browser requirement: SameSite=None must be Secure
  const effectiveSecure = sameSite === "none" ? true : secure;

  jar.set({
    name,
    value,
    path,
    httpOnly,
    secure: effectiveSecure,
    sameSite,
    ...(maxAgeSec != null ? { maxAge: maxAgeSec } : {}),
  });
}

/** Expire a cookie immediately (deletes in browsers). */
export async function clearServerCookie(
  name: string,
  path = "/"
): Promise<void> {
  const jar = await cookies(); // <-- async
  jar.set({
    name,
    value: "",
    path,
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
}
