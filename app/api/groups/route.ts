import fs from "fs/promises"
import path from "path"

const DATA_DIR = path.join(process.cwd(), "data")
const GROUPS_FILE = path.join(DATA_DIR, "groups.json")
const LDIF_DIR = path.join(DATA_DIR, "ldif")

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

// Get next available GID by checking both groups.json and LDIF files
async function getNextGidNumber(existingGroups: any[]): Promise<number> {
  const start = Number(process.env.GIDNUMBER_START ?? 3000)
  let max = start - 1
  
  // Check existing groups in groups.json
  for (const g of existingGroups) {
    if (g.gidnumber) max = Math.max(max, Number(g.gidnumber))
  }
  
  // Also check LDIF files for user gidnumbers
  try {
    const files = await fs.readdir(LDIF_DIR)
    for (const f of files) {
      if (!f.endsWith(".ldif")) continue
      try {
        const txt = await fs.readFile(path.join(LDIF_DIR, f), "utf-8")
        const m = txt.match(/gidnumber:\s*(\d+)/i)
        if (m) max = Math.max(max, Number(m[1]))
      } catch {}
    }
  } catch {}
  
  return max + 1
}

export async function GET() {
  await ensureDir()
  try {
    const raw = await fs.readFile(GROUPS_FILE, "utf-8")
    return new Response(raw)
  } catch (e) {
    return new Response(JSON.stringify([]))
  }
}

export async function POST(req: Request) {
  const body = await req.json()
  const { cn, gidnumber } = body
  if (!cn) return new Response("cn required", { status: 400 })
  await ensureDir()
  let groups: any[] = []
  try {
    const raw = await fs.readFile(GROUPS_FILE, "utf-8")
    groups = JSON.parse(raw)
  } catch (e) {
    groups = []
  }
  if (groups.find((g) => g.cn === cn)) return new Response("Group exists", { status: 400 })
  
  const nextGid = gidnumber ?? await getNextGidNumber(groups)
  groups.push({ cn, gidnumber: nextGid, memberuid: [] })
  await fs.writeFile(GROUPS_FILE, JSON.stringify(groups, null, 2))
  return new Response(JSON.stringify({ ok: true }))
}

export async function DELETE(req: Request) {
  await ensureDir()
  const u = new URL(req.url)
  const cn = u.searchParams.get("cn")
  if (!cn) return new Response("cn query required", { status: 400 })
  try {
    const raw = await fs.readFile(GROUPS_FILE, "utf-8")
    let groups = JSON.parse(raw)
    groups = groups.filter((g: any) => g.cn !== cn)
    await fs.writeFile(GROUPS_FILE, JSON.stringify(groups, null, 2))
    return new Response(JSON.stringify({ ok: true }))
  } catch (e) {
    return new Response(String(e), { status: 500 })
  }
}
