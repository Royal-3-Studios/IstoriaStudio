// "use client";

// import { useEffect } from "react";
// import { useAuthStore } from "@/store/auth";

// let loadingStarted = false;

// export function useAuthInit() {
//   const setUser = useAuthStore((s) => s.setUser);
//   const setLoading = useAuthStore((s) => s.setLoading);

//   useEffect(() => {
//     if (loadingStarted) return;
//     loadingStarted = true;

//     const loadUser = async () => {
//       try {
//         const res = await fetch("http://localhost:8000/api/auth/keycloak/me", {
//           credentials: "include",
//         });

//         if (res.status === 401) {
//           const loggedIn = document.cookie.includes("logged_in=true");
//           if (!loggedIn) {
//             setUser(null);
//             return;
//           }

//           const refreshRes = await fetch(
//             "http://localhost:8000/api/auth/refresh",
//             {
//               method: "POST",
//               credentials: "include",
//             }
//           );

//           if (!refreshRes.ok) {
//             console.warn("Refresh failed: probably expired session");
//             setUser(null);
//             return;
//           }

//           const retryRes = await fetch(
//             "http://localhost:8000/api/auth/keycloak/me",
//             {
//               credentials: "include",
//             }
//           );

//           if (!retryRes.ok)
//             throw new Error("Still not authorized after refresh");

//           const user = await retryRes.json();
//           setUser(user);
//         } else if (res.ok) {
//           const user = await res.json();
//           setUser(user);
//         } else {
//           setUser(null);
//         }
//       } catch (err) {
//         console.error("Auth init failed:", err);
//         setUser(null);
//       } finally {
//         setLoading(false);
//       }
//     };

//     loadUser();
//   }, [setUser, setLoading]);
// }

"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/auth";

// Prevent multiple inits
let loadingStarted = false;

export function useAuthInit() {
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);

  useEffect(() => {
    if (loadingStarted) return;
    loadingStarted = true;

    let refreshInterval: NodeJS.Timeout;

    const loadUser = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/auth/keycloak/me", {
          credentials: "include",
        });

        if (res.status === 401) {
          const loggedIn = document.cookie.includes("logged_in=true");

          if (!loggedIn) {
            setUser(null);
            return;
          }

          // Try refresh
          const refreshRes = await fetch(
            "http://localhost:8000/api/auth/refresh",
            {
              method: "POST",
              credentials: "include",
            }
          );

          if (!refreshRes.ok) {
            console.warn("Token refresh failed.");
            setUser(null);
            return;
          }

          // Retry fetch user after refresh
          const retryRes = await fetch(
            "http://localhost:8000/api/auth/keycloak/me",
            {
              credentials: "include",
            }
          );

          if (!retryRes.ok) throw new Error("Unauthorized after refresh");

          const user = await retryRes.json();
          setUser(user);
        } else if (res.ok) {
          const user = await res.json();
          setUser(user);
        } else {
          setUser(null);
        }

        // 🕒 Refresh every 5 minutes
        refreshInterval = setInterval(
          async () => {
            const refresh = await fetch(
              "http://localhost:8000/api/auth/refresh",
              {
                method: "POST",
                credentials: "include",
              }
            );

            if (!refresh.ok) {
              console.warn("Auto-refresh failed, logging out");
              setUser(null);
              return;
            }

            const userRes = await fetch(
              "http://localhost:8000/api/auth/keycloak/me",
              {
                credentials: "include",
              }
            );

            if (userRes.ok) {
              const user = await userRes.json();
              setUser(user);
            }
          },
          5 * 60 * 1000
        ); // 5 minutes
      } catch (err) {
        console.error("Auth init failed:", err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadUser();

    return () => clearInterval(refreshInterval); // Cleanup interval on unmount
  }, [setUser, setLoading]);
}
