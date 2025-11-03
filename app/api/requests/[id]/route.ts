import fs from "fs/promises"
import path from "path"
import { addUserToLdap } from "../../../../lib/ldap"

const DATA_DIR = path.join(process.cwd(), "data")
const REQ_DIR = path.join(DATA_DIR, "requests")

async function readRequestFile(id: string) {
  const file = path.join(REQ_DIR, `${id}.json`)
  const raw = await fs.readFile(file, "utf-8")
  return { file, data: JSON.parse(raw) }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const { file, data } = await readRequestFile(id)
    const body = await req.json()
    const action = body.action
    if (action === "accept") {
      // attempt to add to LDAP (or generate LDIF)
      const res = await addUserToLdap({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        password: data.password,
      })
      data.status = "accepted"
      data.acceptedAt = new Date().toISOString()
      data.ldapResult = res
      await fs.writeFile(file, JSON.stringify(data, null, 2))
      return new Response(JSON.stringify({ ok: true, res }))
    } else if (action === "reject") {
      data.status = "rejected"
      data.rejectedAt = new Date().toISOString()
      await fs.writeFile(file, JSON.stringify(data, null, 2))
      return new Response(JSON.stringify({ ok: true }))
    } else {
      return new Response("Unknown action", { status: 400 })
    }
  } catch (e: any) {
    return new Response(String(e?.message || e), { status: 500 })
  }
}
