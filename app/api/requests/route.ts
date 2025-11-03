import fs from "fs/promises"
import path from "path"

const DATA_DIR = path.join(process.cwd(), "data")
const REQ_DIR = path.join(DATA_DIR, "requests")

async function ensureDirs() {
  await fs.mkdir(REQ_DIR, { recursive: true })
}

export async function GET() {
  await ensureDirs()
  const files = await fs.readdir(REQ_DIR)
  const requests = await Promise.all(
    files.map(async (f) => {
      try {
        const content = await fs.readFile(path.join(REQ_DIR, f), "utf-8")
        return JSON.parse(content)
      } catch (e) {
        return null
      }
    })
  )
  const filtered = requests.filter(Boolean)
  return new Response(JSON.stringify(filtered))
}

export async function POST(req: Request) {
  const body = await req.json()
  const { firstName, lastName, email, password } = body
  if (!firstName || !lastName || !email || !password) {
    return new Response("Missing fields", { status: 400 })
  }

  await ensureDirs()
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const file = path.join(REQ_DIR, `${id}.json`)
  const obj = { id, firstName, lastName, email, password, status: "pending", createdAt: new Date().toISOString() }
  await fs.writeFile(file, JSON.stringify(obj, null, 2))

  return new Response(JSON.stringify({ ok: true, id }), { status: 201 })
}
