// FILE: src/app/api/_utils/cookies.ts
import { cookies } from "next/headers";

type SetCookieOpts = {
  name: string;
  value: string;
  // default security: HttpOnly, Secure (in prod), SameSite=Lax
  maxAgeSec?: number;
  path?: string;
  sameSite?: "lax" | "strict" | "none";
  httpOnly?: boolean;
  secure?: boolean;
};

export async function setServerCookie({
  name,
  value,
  maxAgeSec,
  path = "/",
  sameSite = "lax",
  httpOnly = true,
  secure = process.env.NODE_ENV === "production",
}: SetCookieOpts): Promise<void> {
  const jar = await cookies(); // ✅ async in your setup
  jar.set({
    name,
    value,
    path,
    httpOnly,
    secure,
    sameSite,
    ...(maxAgeSec != null ? { maxAge: maxAgeSec } : {}),
  });
}

export async function clearServerCookie(
  name: string,
  path = "/"
): Promise<void> {
  const jar = await cookies(); // ✅ async
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
