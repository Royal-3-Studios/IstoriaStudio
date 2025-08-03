// "use client";

// import { useAuthStore } from "@/store/auth";
// import { CircleUser } from "lucide-react";
// import { Button } from "@/components/ui/button";
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuTrigger,
// } from "@/components/ui/dropdown-menu";
// import { useRouter } from "next/navigation";

// export function LoginMenu() {
//   const user = useAuthStore((s) => s.user);
//   const loading = useAuthStore((s) => s.loading);
//   const router = useRouter();

//   const login = () => {
//     const loginUrl = new URL(
//       "http://localhost:8080/realms/istoria/protocol/openid-connect/auth"
//     );
//     loginUrl.searchParams.set("client_id", "istoria-frontend");
//     loginUrl.searchParams.set(
//       "redirect_uri",
//       "http://localhost:3000/login/callback"
//     );
//     loginUrl.searchParams.set("response_type", "code");
//     loginUrl.searchParams.set("scope", "openid");

//     window.location.href = loginUrl.toString();
//   };

//   const logout = async () => {
//     const res = await fetch("http://localhost:8000/api/auth/logout", {
//       method: "POST",
//       credentials: "include",
//     });

//     const { redirectUrl } = await res.json();
//     window.location.href = redirectUrl;
//   };

//   if (loading) return null;

//   return (
//     <DropdownMenu>
//       <DropdownMenuTrigger asChild>
//         <Button variant="outline" size="icon" className="rounded-full">
//           <CircleUser
//             className="h-[1.2rem] w-[1.2rem] animated-icon"
//             strokeWidth={2.5}
//           />
//           <span className="sr-only">User menu</span>
//         </Button>
//       </DropdownMenuTrigger>
//       <DropdownMenuContent align="end">
//         {user ? (
//           <>
//             <DropdownMenuItem onClick={() => router.push("/settings")}>
//               Settings
//             </DropdownMenuItem>
//             <DropdownMenuItem onClick={logout}>Logout</DropdownMenuItem>
//           </>
//         ) : (
//           <DropdownMenuItem onClick={login}>Login</DropdownMenuItem>
//         )}
//       </DropdownMenuContent>
//     </DropdownMenu>
//   );
// }

"use client";

import { useAuthStore } from "@/store/auth";
import { CircleUser } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation";

export function LoginMenu() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const router = useRouter();

  const login = () => {
    // 👇 Use FastAPI login redirect, not Keycloak directly
    window.location.href = "http://localhost:8000/api/auth/login";
  };

  const logout = async () => {
    const res = await fetch("http://localhost:8000/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });

    const { redirectUrl } = await res.json();
    window.location.href = redirectUrl;
  };

  if (loading) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-full">
          <CircleUser
            className="h-[1.2rem] w-[1.2rem] animated-icon"
            strokeWidth={2.5}
          />
          <span className="sr-only">User menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {user ? (
          <>
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout}>Logout</DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onClick={login}>Login</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
