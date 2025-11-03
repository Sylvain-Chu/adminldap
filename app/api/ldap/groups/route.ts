import { queryGroups } from "@/lib/ldap-query"

export async function GET() {
  try {
    const groups = await queryGroups()
    return new Response(JSON.stringify(groups), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
