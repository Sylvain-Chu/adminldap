import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";

type NewUser = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const LDIF_DIR = path.join(DATA_DIR, "ldif");
const GROUPS_FILE = path.join(DATA_DIR, "groups.json");

async function ensureDirs() {
  await fs.mkdir(LDIF_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function generateUid(firstName: string, lastName: string) {
  const fn = firstName.replace(/\s+/g, "").toLowerCase();
  const ln = (lastName || "").trim().toLowerCase();
  const uid = fn + (ln ? ln[0] : "");
  return uid;
}

// Hash password with SSHA (Salted SHA-1)
function hashPasswordSSHA(password: string): string {
  const salt = crypto.randomBytes(4);
  const hash = crypto.createHash("sha1");
  hash.update(password);
  hash.update(salt);
  const digest = hash.digest();
  const ssha = Buffer.concat([digest, salt]).toString("base64");
  return `{SSHA}${ssha}`;
}

async function getNextUidNumber() {
  const start = Number(process.env.UIDNUMBER_START ?? 3000);
  try {
    await fs.mkdir(LDIF_DIR, { recursive: true });
    const files = await fs.readdir(LDIF_DIR);
    let max = start - 1;
    for (const f of files) {
      if (!f.endsWith(".ldif")) continue;
      try {
        const txt = await fs.readFile(path.join(LDIF_DIR, f), "utf-8");
        const m = txt.match(/uidnumber:\s*(\d+)/i);
        if (m) max = Math.max(max, Number(m[1]));
      } catch {}
    }
    return max + 1;
  } catch (e) {
    return start;
  }
}

async function getNextGidNumber(): Promise<number> {
  const start = Number(process.env.GIDNUMBER_START ?? 3000);
  let max = start - 1;

  // Check existing groups in groups.json
  try {
    const raw = await fs.readFile(GROUPS_FILE, "utf-8");
    const groups = JSON.parse(raw);
    for (const g of groups) {
      if (g.gidnumber) max = Math.max(max, Number(g.gidnumber));
    }
  } catch {}

  // Also check LDIF files for user gidnumbers
  try {
    const files = await fs.readdir(LDIF_DIR);
    for (const f of files) {
      if (!f.endsWith(".ldif")) continue;
      try {
        const txt = await fs.readFile(path.join(LDIF_DIR, f), "utf-8");
        const m = txt.match(/gidnumber:\s*(\d+)/i);
        if (m) max = Math.max(max, Number(m[1]));
      } catch {}
    }
  } catch {}

  return max + 1;
}

async function createPersonalGroup(uid: string, gidNumber: number) {
  // Add group to groups.json
  try {
    let groups: any[] = [];
    try {
      const raw = await fs.readFile(GROUPS_FILE, "utf-8");
      groups = JSON.parse(raw);
    } catch {}

    // Check if group already exists
    if (!groups.find((g) => g.cn === uid)) {
      groups.push({ cn: uid, gidnumber: gidNumber, memberuid: [uid] });
      await fs.writeFile(GROUPS_FILE, JSON.stringify(groups, null, 2));
    }
  } catch (e) {
    console.error("Failed to create personal group in groups.json:", e);
  }

  // Create LDIF for the group
  const baseDn = process.env.LDAP_BASE_DN ?? "dc=homelab,dc=churlet,dc=eu";
  const groupDn = `cn=${uid},ou=groups,${baseDn}`;

  const groupLines = [];
  groupLines.push(`dn: ${groupDn}`);
  groupLines.push(`cn: ${uid}`);
  groupLines.push(`gidnumber: ${gidNumber}`);
  groupLines.push(`memberuid: ${uid}`);
  groupLines.push(`objectclass: posixGroup`);
  groupLines.push(`objectclass: top`);

  const groupContent = groupLines.join("\n") + "\n";
  const groupFilePath = path.join(LDIF_DIR, `group_${uid}.ldif`);
  await fs.writeFile(groupFilePath, groupContent);

  return { groupDn, groupFile: groupFilePath };
}

export async function addUserToLdap(user: NewUser) {
  await ensureDirs();
  const uid = generateUid(user.firstName, user.lastName);
  const uidNumber = await getNextUidNumber();
  const gidNumber = await getNextGidNumber(); // Use personal group GID
  const baseDn = process.env.LDAP_BASE_DN ?? "dc=homelab,dc=churlet,dc=eu";
  const homeBase = process.env.HOMEDIR_BASE ?? "/mnt/pool/users";
  const dn = `uid=${uid},ou=people,${baseDn}`;
  const hashedPassword = hashPasswordSSHA(user.password);

  // Create personal group first
  const groupResult = await createPersonalGroup(uid, gidNumber);

  const entry = {
    cn: `${user.firstName} ${user.lastName}`,
    sn: user.lastName,
    uid: uid,
    uidNumber: String(uidNumber),
    gidNumber: String(gidNumber),
    homeDirectory: `${homeBase}/${uid}`,
    loginShell: process.env.DEFAULT_SHELL ?? "/usr/sbin/nologin",
    mail: user.email,
    objectClass: ["inetOrgPerson", "posixAccount", "person", "top"],
    userPassword: hashedPassword,
  };

  // If LDAP configured, try to add.
  // We dynamically import `ldapts` to avoid build-time failures when the
  // dependency isn't installed (useful for local dev without LDAP).
  const ldapUrl = process.env.LDAP_URL;
  const bindDn = process.env.LDAP_BIND_DN;
  const bindPw = process.env.LDAP_BIND_PW;

  if (ldapUrl && bindDn && bindPw) {
    try {
      const mod = await import("ldapts");
      const Client = mod.Client;

      // Optionally provide TLS options (CA) when connecting to LDAPS.
      // If LDAP_CA_FILE is set, read the CA and pass it to ldapts via tlsOptions.
      const tlsOptions: any = {};
      const caFile = process.env.LDAP_CA_FILE;
      if (caFile) {
        try {
          // Resolve relative paths relative to the process cwd so env values like
          // ./data/certs/homelab-ca.crt work regardless of where the code is
          // imported from.
          const caPath = path.isAbsolute(caFile)
            ? caFile
            : path.resolve(process.cwd(), caFile);
          const ca = fsSync.readFileSync(caPath);
          // ldapts/tls accepts an array of PEM certs as Buffer
          tlsOptions.ca = [ca];
          console.info("Loaded LDAP CA from:", caPath);
        } catch (e) {
          console.error("Failed to read LDAP_CA_FILE:", caFile, e);
        }
      }

      // Allow an explicit insecure/test mode if needed (not for production):
      // set LDAP_INSECURE=true to disable cert verification temporarily.
      const insecure =
        String(process.env.LDAP_INSECURE ?? "").toLowerCase() === "true";
      if (insecure) {
        tlsOptions.rejectUnauthorized = false;
        console.warn(
          "LDAP_INSECURE=true: certificate verification is disabled (testing only)"
        );
      }

      const clientOptions: any = { url: ldapUrl };
      if (Object.keys(tlsOptions).length) clientOptions.tlsOptions = tlsOptions;

      const client = new Client(clientOptions);
      await client.bind(bindDn, bindPw);

      // Add group first
      await client.add(groupResult.groupDn, {
        cn: uid,
        gidNumber: String(gidNumber),
        memberUid: uid,
        objectClass: ["posixGroup", "top"],
      });

      // Then add user
      await client.add(dn, entry);
      await client.unbind();
      return { ok: true, via: "ldap", dn, groupDn: groupResult.groupDn };
    } catch (e: any) {
      // fallthrough to LDIF file + save error for inspection
      try {
        await fs.writeFile(path.join(LDIF_DIR, `${uid}.error.txt`), String(e));
      } catch {}
    }
  }

  // Fallback: generate LDIF file so admin can import later
  const lines = [];
  lines.push(`dn: ${dn}`);
  lines.push(`cn: ${entry.cn}`);
  lines.push(`sn: ${entry.sn}`);
  lines.push(`uid: ${entry.uid}`);
  lines.push(`uidnumber: ${entry.uidNumber}`);
  lines.push(`gidnumber: ${entry.gidNumber}`);
  lines.push(`homedirectory: ${entry.homeDirectory}`);
  lines.push(`loginshell: ${entry.loginShell}`);
  lines.push(`mail: ${entry.mail}`);
  lines.push(`objectclass: inetOrgPerson`);
  lines.push(`objectclass: posixAccount`);
  lines.push(`objectclass: person`);
  lines.push(`objectclass: top`);
  lines.push(`userpassword: ${entry.userPassword}`);
  const content = lines.join("\n") + "\n";
  const filePath = path.join(LDIF_DIR, `${uid}.ldif`);
  await fs.writeFile(filePath, content);
  return {
    ok: true,
    via: "ldif",
    file: filePath,
    groupFile: groupResult.groupFile,
    dn,
    groupDn: groupResult.groupDn,
  };
}
