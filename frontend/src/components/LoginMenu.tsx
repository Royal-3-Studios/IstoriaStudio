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
import { BACKEND } from "@/lib/config";
import { useState } from "react";

export function LoginMenu() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  const login = () => {
    const returnTo = typeof window !== "undefined" ? window.location.href : "/";
    window.location.href = `${BACKEND}/api/auth/login?return_to=${encodeURIComponent(returnTo)}`;
  };

  const logout = async () => {
    // Optimistic UI: clear user immediately
    setLoading(true);
    setUser(null);
    setOpen(false); // close dropdown so the menu re-renders cleanly

    try {
      await fetch(`${BACKEND}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore network issues; user already cleared
    } finally {
      setLoading(false);
      // If you have any Server Components that depend on auth,
      // this helps re-render them; harmless otherwise.
      router.refresh();
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <CircleUser className="h-6 w-6" />
          <span className="sr-only">Open user menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          Toggle theme
        </DropdownMenuItem>
        {user ? (
          <>
            <DropdownMenuItem
              onClick={() => {
                setOpen(false);
                router.push("/settings");
              }}
            >
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
