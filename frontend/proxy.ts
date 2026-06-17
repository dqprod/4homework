import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_TARGET = process.env.API_URL || "http://127.0.0.1:8001";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.rewrite(new URL(`${API_TARGET}${pathname}${search}`));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};