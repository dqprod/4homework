"use client";

import { usePathname } from "next/navigation";
import AppNavbar from "./AppNavbar";

const PUBLIC_PATHS = ["/login", "/signup"];

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (isPublic) {
    return <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">{children}</div>;
  }

  return (
    <>
      <AppNavbar />
      {children}
    </>
  );
}