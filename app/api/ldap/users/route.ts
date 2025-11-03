import { queryUsers } from "@/lib/ldap-query"

export async function GET() {
  try {
    const users = await queryUsers()
    return new Response(JSON.stringify(users), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
