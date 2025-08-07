// "use client";

// import { useEffect, useRef } from "react";
// import { useRouter, useSearchParams } from "next/navigation";

// export default function AuthCallbackPage() {
//   const params = useSearchParams();
//   const router = useRouter();
//   const hasRun = useRef(false);

//   console.log("HEYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY");

//   useEffect(() => {
//     if (hasRun.current) return;
//     hasRun.current = true;

//     console.log("hasRun.current:", hasRun.current);

//     const code = params.get("code");
//     if (!code) return;

//     console.log("code:", code);

//     const sendCodeToBackend = async () => {
//       try {
//         console.log("BEFORE FETCHHHHH");
//         const res = await fetch("http://localhost:8000/api/auth/callback", {
//           // const res = await fetch("http://host.docker.internal:8000/api/auth/callback", {
//           method: "POST",
//           credentials: "include", // required to receive cookies
//           headers: {
//             "Content-Type": "application/x-www-form-urlencoded",
//           },
//           body: new URLSearchParams({ code }),
//         });

//         console.log("RESP: ", res);

//         if (!res.ok) {
//           const err = await res.text();
//           console.error("Failed to login:", err);
//           throw new Error(`Failed to login: ${err}`);
//         }

//         // Optionally remove code param from URL
//         window.history.replaceState({}, "", window.location.pathname);

//         router.replace("/");
//       } catch (err) {
//         console.error("OAuth callback failed:", err);
//         router.replace("/login?error=1");
//       }
//     };

//     sendCodeToBackend();
//   }, [params, router]);

//   return <p>Logging you in...</p>;
// }
