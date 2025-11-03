import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const body = await req.json()
  const { password } = body
  
  // Simple password check - in production use proper auth
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123"
  
  if (password === adminPassword) {
    const response = NextResponse.json({ ok: true })
    
    // Set secure cookie
    response.cookies.set("admin-auth", "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
    })
    
    return response
  }
  
  return new NextResponse("Invalid password", { status: 401 })
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete("admin-auth")
  return response
}
