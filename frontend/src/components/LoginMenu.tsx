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
import { useTheme } from "next-themes";

export function LoginMenu() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const router = useRouter();
  const { theme } = useTheme();

  const login = () => {
    const themeSuffix = theme === "dark" ? "dark" : "light";
    const loginUrl = new URL(`http://localhost:8000/api/auth/login`);
    loginUrl.searchParams.append("theme", `${themeSuffix}`);

    window.location.href = loginUrl.toString();
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
