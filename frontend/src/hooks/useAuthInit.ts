// src/hooks/useAuthInit.ts
"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/auth";
import { BACKEND } from "@/lib/config";

const VISIBLE_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export function useAuthInit(): void {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    const fetchJSON = async (url: string, init?: RequestInit) => {
      const res = await fetch(url, {
        ...init,
        credentials: "include",
        headers: {
          "content-type": "application/json",
          ...(init?.headers || {}),
        },
      });
      if (!res.ok)
        throw Object.assign(new Error(`HTTP ${res.status}`), {
          status: res.status,
        });
      const ct = res.headers.get("content-type") || "";
      return ct.includes("application/json") ? res.json() : null;
    };

    const getMe = () => fetchJSON(`${BACKEND}/api/auth/keycloak/me`);
    const refresh = () =>
      fetchJSON(`${BACKEND}/api/auth/refresh`, { method: "POST" });

    const setUserSafe = (u: unknown | null) => {
      if (mountedRef.current) setUser(u as any);
    };

    const setLoadingSafe = (v: boolean) => {
      if (mountedRef.current) setLoading(v);
    };

    const loadUser = async () => {
      setLoadingSafe(true);
      try {
        try {
          const user = await getMe();
          setUserSafe(user);
        } catch (e: any) {
          if (e?.status === 401) {
            try {
              await refresh();
              const user = await getMe();
              setUserSafe(user);
            } catch {
              setUserSafe(null);
            }
          } else {
            setUserSafe(null);
          }
        }
      } finally {
        setLoadingSafe(false);
      }
    };

    const maybeKeepAlive = async () => {
      // Only refresh when the page is visible to avoid background churn.
      if (document.visibilityState === "visible") {
        try {
          await refresh();
          // Optionally re-pull user if your backend can rotate claims/roles
          // const user = await getMe();
          // setUserSafe(user);
        } catch {
          // If refresh fails, drop user (tokens likely expired/cleared)
          setUserSafe(null);
        }
      }
    };

    // 1) Initial user load
    void loadUser();

    // 2) Refresh when the user returns to the tab (cheap, very effective)
    const onFocus = () => {
      void maybeKeepAlive();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void maybeKeepAlive();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    // 3) Optional periodic keep-alive while visible
    timerRef.current = setInterval(maybeKeepAlive, VISIBLE_REFRESH_MS);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [setUser, setLoading]);
}
