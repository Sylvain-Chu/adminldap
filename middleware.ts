import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Don't protect the login page itself
  if (path === "/admin/login") {
    return NextResponse.next()
  }

  // Protect all other /admin routes
  if (path.startsWith("/admin")) {
    const authCookie = request.cookies.get("admin-auth")
    
    // Check if authenticated (simple cookie check)
    if (!authCookie || authCookie.value !== "authenticated") {
      // Redirect to login page
      return NextResponse.redirect(new URL("/admin/login", request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/admin/:path*"],
}
