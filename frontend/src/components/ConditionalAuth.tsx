"use client";

import { usePathname } from "next/navigation";
import { LoginMenu } from "@/components/LoginMenu";
import { AuthInitProvider } from "@/components/AuthInitProvider";

export function ConditionalAuth() {
  const pathname = usePathname();
  const isCallback = pathname.startsWith("/login/callback");

  if (isCallback) return null;

  return (
    <>
      <LoginMenu />
      <AuthInitProvider />
    </>
  );
}
