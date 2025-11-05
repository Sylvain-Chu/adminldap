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

type NewGroup = {
  cn: string;
  gidNumber?: number;
  memberUid?: string[];
};

const DATA_DIR = path.join(process.cwd(), "data");
const LDIF_DIR = path.join(DATA_DIR, "ldif");
const GROUPS_FILE = path.join(DATA_DIR, "groups.json");

async function ensureDirs() {
  await fs.mkdir(LDIF_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
}

/**
 * Helper function to build LDAP client options with TLS and mTLS support
 */
function getLdapClientOptions(): {
  url: string;
  tlsOptions?: Record<string, unknown>;
} {
  const ldapUrl = process.env.LDAP_URL;
  if (!ldapUrl) {
    throw new Error("LDAP_URL is not defined");
  }

  const tlsOptions: Record<string, unknown> = {};

  // 1. Load CA certificate to validate the LDAP server
  const caFile = process.env.LDAP_CA_FILE;
  if (caFile) {
    try {
      const caPath = path.isAbsolute(caFile)
        ? caFile
        : path.resolve(process.cwd(), caFile);
      const ca = fsSync.readFileSync(caPath);
      tlsOptions.ca = [ca];
      console.info("Loaded LDAP CA from:", caPath);
    } catch (e) {
      console.error("Failed to read LDAP_CA_FILE:", caFile, e);
    }
  }

  // 2. Load client certificate for mTLS authentication
  const certFile = process.env.LDAP_CLIENT_CERT_FILE;
  if (certFile) {
    try {
      const certPath = path.isAbsolute(certFile)
        ? certFile
        : path.resolve(process.cwd(), certFile);
      tlsOptions.cert = fsSync.readFileSync(certPath);
      console.info("Loaded LDAP Client Cert from:", certPath);
    } catch (e) {
      console.error("Failed to read LDAP_CLIENT_CERT_FILE:", certFile, e);
    }
  }

  // 3. Load client private key for mTLS authentication
  const keyFile = process.env.LDAP_CLIENT_KEY_FILE;
  if (keyFile) {
    try {
      const keyPath = path.isAbsolute(keyFile)
        ? keyFile
        : path.resolve(process.cwd(), keyFile);
      tlsOptions.key = fsSync.readFileSync(keyPath);
      console.info("Loaded LDAP Client Key from:", keyPath);
    } catch (e) {
      console.error("Failed to read LDAP_CLIENT_KEY_FILE:", keyFile, e);
    }
  }

  // 4. Allow insecure mode for testing (not for production)
  const insecure =
    String(process.env.LDAP_INSECURE ?? "").toLowerCase() === "true";
  if (insecure) {
    tlsOptions.rejectUnauthorized = false;
    console.warn(
      "LDAP_INSECURE=true: certificate verification is disabled (testing only)"
    );
  }

  const clientOptions: { url: string; tlsOptions?: Record<string, unknown> } = {
    url: ldapUrl,
  };
  if (Object.keys(tlsOptions).length > 0) {
    clientOptions.tlsOptions = tlsOptions;
  }

  return clientOptions;
}

function generateUid(firstName: string, lastName: string) {
  // Remove accents and special characters
  const removeAccents = (str: string) => {
    return str
      .normalize("NFD") // Decompose accented characters
      .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
      .replace(/[^a-zA-Z0-9]/g, ""); // Remove special characters and spaces
  };

  const fn = removeAccents(firstName).toLowerCase();
  const ln = removeAccents(lastName || "").toLowerCase();
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
  const maxLimit = Number(process.env.UIDNUMBER_MAX ?? 4000);
  let max = start - 1;

  // First, try to query LDAP for the highest uidNumber
  const ldapUrl = process.env.LDAP_URL;
  const bindDn = process.env.LDAP_BIND_DN;
  const bindPw = process.env.LDAP_BIND_PW;
  const baseDn = process.env.LDAP_BASE_DN ?? "dc=homelab,dc=churlet,dc=eu";

  if (ldapUrl && bindDn && bindPw) {
    try {
      const mod = await import("ldapts");
      const Client = mod.Client;
      const clientOptions = getLdapClientOptions();
      const client = new Client(clientOptions);
      await client.bind(bindDn, bindPw);

      const { searchEntries } = await client.search(`ou=people,${baseDn}`, {
        scope: "sub",
        filter: "(objectClass=posixAccount)",
        attributes: ["uidNumber"],
      });

      await client.unbind();

      for (const entry of searchEntries) {
        const entryData = entry as Record<string, unknown>;
        if (entryData.uidNumber) {
          const num = Number(entryData.uidNumber);
          if (!isNaN(num) && num >= start && num < maxLimit) {
            max = Math.max(max, num);
          }
        }
      }
    } catch (e) {
      console.error("Failed to query LDAP for uidNumber:", e);
    }
  }

  // Also check local LDIF files as fallback
  try {
    await fs.mkdir(LDIF_DIR, { recursive: true });
    const files = await fs.readdir(LDIF_DIR);
    for (const f of files) {
      if (!f.endsWith(".ldif")) continue;
      try {
        const txt = await fs.readFile(path.join(LDIF_DIR, f), "utf-8");
        const m = txt.match(/uidnumber:\s*(\d+)/i);
        if (m) {
          const num = Number(m[1]);
          if (num >= start && num < maxLimit) {
            max = Math.max(max, num);
          }
        }
      } catch {}
    }
  } catch (e) {
    console.error("Failed to check local LDIF files:", e);
  }

  const nextUid = max + 1;

  // Check if we've exceeded the limit
  if (nextUid >= maxLimit) {
    throw new Error(
      `UID limit reached: cannot allocate uidNumber >= ${maxLimit}. Please increase UIDNUMBER_MAX or clean up unused users.`
    );
  }

  return nextUid;
}

async function getNextGidNumber(): Promise<number> {
  const start = Number(process.env.GIDNUMBER_START ?? 3000);
  const maxLimit = Number(process.env.GIDNUMBER_MAX ?? 4000);
  let max = start - 1;

  // First, try to query LDAP for the highest gidNumber
  const ldapUrl = process.env.LDAP_URL;
  const bindDn = process.env.LDAP_BIND_DN;
  const bindPw = process.env.LDAP_BIND_PW;
  const baseDn = process.env.LDAP_BASE_DN ?? "dc=homelab,dc=churlet,dc=eu";

  if (ldapUrl && bindDn && bindPw) {
    try {
      const mod = await import("ldapts");
      const Client = mod.Client;
      const clientOptions = getLdapClientOptions();
      const client = new Client(clientOptions);
      await client.bind(bindDn, bindPw);

      // Check groups
      const { searchEntries: groupEntries } = await client.search(
        `ou=groups,${baseDn}`,
        {
          scope: "sub",
          filter: "(objectClass=posixGroup)",
          attributes: ["gidNumber"],
        }
      );

      for (const entry of groupEntries) {
        const entryData = entry as Record<string, unknown>;
        if (entryData.gidNumber) {
          const num = Number(entryData.gidNumber);
          if (!isNaN(num) && num >= start && num < maxLimit) {
            max = Math.max(max, num);
          }
        }
      }

      // Also check users' gidNumber (in case they have different primary groups)
      const { searchEntries: userEntries } = await client.search(
        `ou=people,${baseDn}`,
        {
          scope: "sub",
          filter: "(objectClass=posixAccount)",
          attributes: ["gidNumber"],
        }
      );

      for (const entry of userEntries) {
        const entryData = entry as Record<string, unknown>;
        if (entryData.gidNumber) {
          const num = Number(entryData.gidNumber);
          if (!isNaN(num) && num >= start && num < maxLimit) {
            max = Math.max(max, num);
          }
        }
      }

      await client.unbind();
    } catch (e) {
      console.error("Failed to query LDAP for gidNumber:", e);
    }
  }

  // Check existing groups in groups.json
  try {
    const raw = await fs.readFile(GROUPS_FILE, "utf-8");
    const groups = JSON.parse(raw);
    for (const g of groups) {
      if (g.gidnumber) {
        const num = Number(g.gidnumber);
        if (num >= start && num < maxLimit) {
          max = Math.max(max, num);
        }
      }
    }
  } catch {}

  // Also check LDIF files
  try {
    const files = await fs.readdir(LDIF_DIR);
    for (const f of files) {
      if (!f.endsWith(".ldif")) continue;
      try {
        const txt = await fs.readFile(path.join(LDIF_DIR, f), "utf-8");
        const m = txt.match(/gidnumber:\s*(\d+)/i);
        if (m) {
          const num = Number(m[1]);
          if (num >= start && num < maxLimit) {
            max = Math.max(max, num);
          }
        }
      } catch {}
    }
  } catch {}

  const nextGid = max + 1;

  // Check if we've exceeded the limit
  if (nextGid >= maxLimit) {
    throw new Error(
      `GID limit reached: cannot allocate gidNumber >= ${maxLimit}. Please increase GIDNUMBER_MAX or clean up unused groups.`
    );
  }

  return nextGid;
}

async function createPersonalGroup(uid: string, gidNumber: number) {
  // Add group to groups.json
  try {
    let groups: Array<{ cn: string; gidnumber: number; memberuid: string[] }> =
      [];
    try {
      const raw = await fs.readFile(GROUPS_FILE, "utf-8");
      groups = JSON.parse(raw);
    } catch {
      // File doesn't exist or is invalid, start with empty array
    }

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

      // Use helper function to get client options with mTLS support
      const clientOptions = getLdapClientOptions();
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
    } catch (e: unknown) {
      // fallthrough to LDIF file + save error for inspection
      try {
        await fs.writeFile(path.join(LDIF_DIR, `${uid}.error.txt`), String(e));
      } catch {
        // Ignore write errors
      }
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

/**
 * Add a group to LDAP or generate LDIF file as fallback
 */
export async function addGroupToLdap(group: NewGroup) {
  await ensureDirs();
  const cn = group.cn;
  const baseDn = process.env.LDAP_BASE_DN ?? "dc=homelab,dc=churlet,dc=eu";
  const dn = `cn=${cn},ou=groups,${baseDn}`;

  // Determine gidNumber
  let gidNumber = group.gidNumber;
  if (!gidNumber) {
    gidNumber = await getNextGidNumber();
  }

  const memberUid = group.memberUid ?? [];

  // Save to groups.json
  try {
    let groups: Array<{ cn: string; gidnumber: number; memberuid: string[] }> =
      [];
    try {
      const raw = await fs.readFile(GROUPS_FILE, "utf-8");
      groups = JSON.parse(raw);
    } catch {
      // File doesn't exist or is invalid, start with empty array
    }

    // Check if group already exists
    if (groups.find((g) => g.cn === cn)) {
      throw new Error(`Group ${cn} already exists`);
    }

    groups.push({ cn, gidnumber: gidNumber, memberuid: memberUid });
    await fs.writeFile(GROUPS_FILE, JSON.stringify(groups, null, 2));
  } catch (e) {
    console.error("Failed to save group to groups.json:", e);
    throw e;
  }

  // Try to add to LDAP
  const ldapUrl = process.env.LDAP_URL;
  const bindDn = process.env.LDAP_BIND_DN;
  const bindPw = process.env.LDAP_BIND_PW;

  if (ldapUrl && bindDn && bindPw) {
    try {
      const mod = await import("ldapts");
      const Client = mod.Client;

      // Use helper function to get client options with mTLS support
      const clientOptions = getLdapClientOptions();
      const client = new Client(clientOptions);
      await client.bind(bindDn, bindPw);

      // Add group to LDAP
      const entry: Record<string, string | string[]> = {
        cn,
        gidNumber: String(gidNumber),
        objectClass: ["posixGroup", "top"],
      };

      // Add memberUid if present
      if (memberUid.length > 0) {
        entry.memberUid = memberUid;
      }

      await client.add(dn, entry);
      await client.unbind();
      return { ok: true, via: "ldap", dn, gidNumber };
    } catch (e: unknown) {
      // fallthrough to LDIF file + save error for inspection
      console.error("Failed to add group to LDAP:", e);
      try {
        await fs.writeFile(
          path.join(LDIF_DIR, `group_${cn}.error.txt`),
          String(e)
        );
      } catch {
        // Ignore write errors
      }
    }
  }

  // Fallback: generate LDIF file so admin can import later
  const lines = [];
  lines.push(`dn: ${dn}`);
  lines.push(`cn: ${cn}`);
  lines.push(`gidnumber: ${gidNumber}`);
  if (memberUid.length > 0) {
    for (const member of memberUid) {
      lines.push(`memberuid: ${member}`);
    }
  }
  lines.push(`objectclass: posixGroup`);
  lines.push(`objectclass: top`);

  const content = lines.join("\n") + "\n";
  const filePath = path.join(LDIF_DIR, `group_${cn}.ldif`);
  await fs.writeFile(filePath, content);
  return { ok: true, via: "ldif", file: filePath, dn, gidNumber };
}
