import fs from "fs/promises"
import path from "path"

const DATA_DIR = path.join(process.cwd(), "data")
const LDIF_DIR = path.join(DATA_DIR, "ldif")

export type LdapUser = {
  dn: string
  uid: string
  cn: string
  sn: string
  mail: string
  uidNumber: number
  gidNumber: number
  homeDirectory: string
  loginShell: string
}

export type LdapGroup = {
  dn: string
  cn: string
  gidNumber: number
  memberUid: string[]
}

// Query users from LDAP or fallback to LDIF files
export async function queryUsers(): Promise<LdapUser[]> {
  const ldapUrl = process.env.LDAP_URL
  const bindDn = process.env.LDAP_BIND_DN
  const bindPw = process.env.LDAP_BIND_PW
  const baseDn = process.env.LDAP_BASE_DN ?? "dc=homelab,dc=churlet,dc=eu"

  // Try LDAP first
  if (ldapUrl && bindDn && bindPw) {
    try {
      const mod = await import("ldapts")
      const Client = mod.Client
      const client = new Client({ url: ldapUrl })
      await client.bind(bindDn, bindPw)

      const { searchEntries } = await client.search(`ou=people,${baseDn}`, {
        scope: "sub",
        filter: "(objectClass=posixAccount)",
      })

      await client.unbind()

      return searchEntries.map((entry: any) => ({
        dn: entry.dn,
        uid: entry.uid,
        cn: entry.cn,
        sn: entry.sn,
        mail: entry.mail,
        uidNumber: Number(entry.uidNumber),
        gidNumber: Number(entry.gidNumber),
        homeDirectory: entry.homeDirectory,
        loginShell: entry.loginShell,
      }))
    } catch (e) {
      console.error("LDAP query failed, falling back to LDIF:", e)
    }
  }

  // Fallback: read from LDIF files
  try {
    const files = await fs.readdir(LDIF_DIR)
    const users: LdapUser[] = []

    for (const file of files) {
      if (!file.endsWith(".ldif") || file.startsWith("group_")) continue

      try {
        const content = await fs.readFile(path.join(LDIF_DIR, file), "utf-8")
        const lines = content.split("\n")

        const user: any = {}
        for (const line of lines) {
          const [key, ...valueParts] = line.split(":")
          const value = valueParts.join(":").trim()
          if (key === "dn") user.dn = value
          if (key === "uid") user.uid = value
          if (key === "cn") user.cn = value
          if (key === "sn") user.sn = value
          if (key === "mail") user.mail = value
          if (key === "uidnumber") user.uidNumber = Number(value)
          if (key === "gidnumber") user.gidNumber = Number(value)
          if (key === "homedirectory") user.homeDirectory = value
          if (key === "loginshell") user.loginShell = value
        }

        if (user.uid) users.push(user)
      } catch {}
    }

    return users
  } catch {
    return []
  }
}

// Query groups from LDAP or fallback to groups.json + LDIF
export async function queryGroups(): Promise<LdapGroup[]> {
  const ldapUrl = process.env.LDAP_URL
  const bindDn = process.env.LDAP_BIND_DN
  const bindPw = process.env.LDAP_BIND_PW
  const baseDn = process.env.LDAP_BASE_DN ?? "dc=homelab,dc=churlet,dc=eu"

  // Try LDAP first
  if (ldapUrl && bindDn && bindPw) {
    try {
      const mod = await import("ldapts")
      const Client = mod.Client
      const client = new Client({ url: ldapUrl })
      await client.bind(bindDn, bindPw)

      const { searchEntries } = await client.search(`ou=groups,${baseDn}`, {
        scope: "sub",
        filter: "(objectClass=posixGroup)",
      })

      await client.unbind()

      return searchEntries.map((entry: any) => ({
        dn: entry.dn,
        cn: entry.cn,
        gidNumber: Number(entry.gidNumber),
        memberUid: Array.isArray(entry.memberUid) ? entry.memberUid : entry.memberUid ? [entry.memberUid] : [],
      }))
    } catch (e) {
      console.error("LDAP group query failed, falling back to local:", e)
    }
  }

  // Fallback: read from groups.json and LDIF files
  const groups: LdapGroup[] = []
  const groupsFile = path.join(DATA_DIR, "groups.json")

  try {
    const raw = await fs.readFile(groupsFile, "utf-8")
    const localGroups = JSON.parse(raw)
    for (const g of localGroups) {
      groups.push({
        dn: `cn=${g.cn},ou=groups,${baseDn}`,
        cn: g.cn,
        gidNumber: g.gidnumber,
        memberUid: g.memberuid || [],
      })
    }
  } catch {}

  // Also scan LDIF files for groups
  try {
    const files = await fs.readdir(LDIF_DIR)
    for (const file of files) {
      if (!file.startsWith("group_") || !file.endsWith(".ldif")) continue

      try {
        const content = await fs.readFile(path.join(LDIF_DIR, file), "utf-8")
        const lines = content.split("\n")

        const group: any = { memberUid: [] }
        for (const line of lines) {
          const [key, ...valueParts] = line.split(":")
          const value = valueParts.join(":").trim()
          if (key === "dn") group.dn = value
          if (key === "cn") group.cn = value
          if (key === "gidnumber") group.gidNumber = Number(value)
          if (key === "memberuid") {
            if (!group.memberUid) group.memberUid = []
            group.memberUid.push(value)
          }
        }

        if (group.cn && !groups.find((g) => g.cn === group.cn)) {
          groups.push(group)
        }
      } catch {}
    }
  } catch {}

  return groups
}

// Update user in LDAP
export async function updateUserInLdap(uid: string, updates: Partial<LdapUser>) {
  const ldapUrl = process.env.LDAP_URL
  const bindDn = process.env.LDAP_BIND_DN
  const bindPw = process.env.LDAP_BIND_PW
  const baseDn = process.env.LDAP_BASE_DN ?? "dc=homelab,dc=churlet,dc=eu"

  if (!ldapUrl || !bindDn || !bindPw) {
    throw new Error("LDAP not configured - cannot update user in LDAP directly")
  }

  const mod = await import("ldapts")
  const Client = mod.Client
  const Change = mod.Change
  const client = new Client({ url: ldapUrl })

  await client.bind(bindDn, bindPw)

  const userDn = `uid=${uid},ou=people,${baseDn}`
  const changes: any[] = []

  if (updates.mail) {
    changes.push(new Change({ operation: "replace", modification: { mail: updates.mail } as any }))
  }
  if (updates.loginShell) {
    changes.push(new Change({ operation: "replace", modification: { loginShell: updates.loginShell } as any }))
  }
  if (updates.cn) {
    changes.push(new Change({ operation: "replace", modification: { cn: updates.cn } as any }))
  }

  await client.modify(userDn, changes)
  await client.unbind()

  return { ok: true, dn: userDn }
}

// Delete user from LDAP
export async function deleteUserFromLdap(uid: string) {
  const ldapUrl = process.env.LDAP_URL
  const bindDn = process.env.LDAP_BIND_DN
  const bindPw = process.env.LDAP_BIND_PW
  const baseDn = process.env.LDAP_BASE_DN ?? "dc=homelab,dc=churlet,dc=eu"

  if (!ldapUrl || !bindDn || !bindPw) {
    throw new Error("LDAP not configured")
  }

  const mod = await import("ldapts")
  const Client = mod.Client
  const client = new Client({ url: ldapUrl })

  await client.bind(bindDn, bindPw)
  const userDn = `uid=${uid},ou=people,${baseDn}`
  await client.del(userDn)
  await client.unbind()

  return { ok: true }
}
