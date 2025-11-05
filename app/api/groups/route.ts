import fs from "fs/promises";
import path from "path";
import { addGroupToLdap } from "@/lib/ldap";

const DATA_DIR = path.join(process.cwd(), "data");
const GROUPS_FILE = path.join(DATA_DIR, "groups.json");

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function GET() {
  await ensureDir();
  try {
    const raw = await fs.readFile(GROUPS_FILE, "utf-8");
    return new Response(raw);
  } catch {
    return new Response(JSON.stringify([]));
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { cn, gidnumber, memberuid } = body;
  if (!cn) return new Response("cn required", { status: 400 });

  try {
    // Use the addGroupToLdap function which handles both LDAP and local storage
    const result = await addGroupToLdap({
      cn,
      gidNumber: gidnumber,
      memberUid: memberuid || [],
    });

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function DELETE(req: Request) {
  await ensureDir();
  const u = new URL(req.url);
  const cn = u.searchParams.get("cn");
  if (!cn) return new Response("cn query required", { status: 400 });
  try {
    const raw = await fs.readFile(GROUPS_FILE, "utf-8");
    let groups: Array<{ cn: string; gidnumber: number; memberuid: string[] }> =
      JSON.parse(raw);
    groups = groups.filter((g) => g.cn !== cn);
    await fs.writeFile(GROUPS_FILE, JSON.stringify(groups, null, 2));
    return new Response(JSON.stringify({ ok: true }));
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
}
