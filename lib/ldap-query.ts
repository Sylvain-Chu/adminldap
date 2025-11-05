import fs from "fs/promises";
import path from "path";
import fsSync from "fs"; // <-- AJOUTÉ: Requis pour lire le fichier CA

const DATA_DIR = path.join(process.cwd(), "data");
const LDIF_DIR = path.join(DATA_DIR, "ldif");

export type LdapUser = {
  dn: string;
  uid: string;
  cn: string;
  sn: string;
  mail: string;
  uidNumber: number;
  gidNumber: number;
  homeDirectory: string;
  loginShell: string;
};

export type LdapGroup = {
  dn: string;
  cn: string;
  gidNumber: number;
  memberUid: string[];
};

/**
 * Construit les options du client ldapts, y compris la gestion du mTLS.
 */
function getLdapClientOptions() {
  const ldapUrl = process.env.LDAP_URL;
  if (!ldapUrl) {
    // Gérer le cas où l'URL n'est pas définie
    throw new Error("LDAP_URL is not defined");
  }

  const tlsOptions: any = {};

  // 1. Charge la CA pour valider le SERVEUR
  const caFile = process.env.LDAP_CA_FILE;
  if (caFile) {
    try {
      const caPath = path.isAbsolute(caFile)
        ? caFile
        : path.resolve(process.cwd(), caFile);
      const ca = fsSync.readFileSync(caPath);
      // ldapts/tls attend un tableau de certificats PEM sous forme de Buffer
      tlsOptions.ca = [ca];
      console.info("Loaded LDAP CA from:", caPath);
    } catch (e) {
      console.error("Failed to read LDAP_CA_FILE:", caFile, e);
    }
  }

  // --- DÉBUT DE LA CORRECTION (mTLS) ---

  // 2. Charge le certificat CLIENT pour s'authentifier auprès du serveur
  const certFile = process.env.LDAP_CLIENT_CERT_FILE;
  if (certFile) {
    try {
      const certPath = path.isAbsolute(certFile)
        ? certFile
        : path.resolve(process.cwd(), certFile);
      // 'cert' est un Buffer unique
      tlsOptions.cert = fsSync.readFileSync(certPath);
      console.info("Loaded LDAP Client Cert from:", certPath);
    } catch (e) {
      console.error("Failed to read LDAP_CLIENT_CERT_FILE:", certFile, e);
    }
  }

  // 3. Charge la clé privée CLIENT
  const keyFile = process.env.LDAP_CLIENT_KEY_FILE;
  if (keyFile) {
    try {
      const keyPath = path.isAbsolute(keyFile)
        ? keyFile
        : path.resolve(process.cwd(), keyFile);
      // 'key' est un Buffer unique
      tlsOptions.key = fsSync.readFileSync(keyPath);
      console.info("Loaded LDAP Client Key from:", keyPath);
    } catch (e) {
      console.error("Failed to read LDAP_CLIENT_KEY_FILE:", keyFile, e);
    }
  }

  // 4. Autorise un mode "insécurisé" (ne s'applique qu'à la validation du serveur)
  const insecure =
    String(process.env.LDAP_INSECURE ?? "").toLowerCase() === "true";
  if (insecure) {
    tlsOptions.rejectUnauthorized = false;
    console.warn(
      "LDAP_INSECURE=true: certificate verification is disabled (testing only)"
    );
  }

  // 5. Construit les options finales
  const clientOptions: any = { url: ldapUrl };
  if (Object.keys(tlsOptions).length > 0) {
    clientOptions.tlsOptions = tlsOptions;
  }

  return clientOptions;
}

// Query users from LDAP or fallback to LDIF files
export async function queryUsers(): Promise<LdapUser[]> {
  const ldapUrl = process.env.LDAP_URL;
  const bindDn = process.env.LDAP_BIND_DN;
  const bindPw = process.env.LDAP_BIND_PW;
  const baseDn = process.env.LDAP_BASE_DN ?? "dc=homelab,dc=churlet,dc=eu";

  // Try LDAP first
  if (ldapUrl && bindDn && bindPw) {
    try {
      const mod = await import("ldapts");
      const Client = mod.Client;

      // MODIFIÉ: Utilise le helper pour les options TLS
      const clientOptions = getLdapClientOptions();
      const client = new Client(clientOptions);

      await client.bind(bindDn, bindPw);

      const { searchEntries } = await client.search(`ou=people,${baseDn}`, {
        scope: "sub",
        filter: "(objectClass=posixAccount)",
      });

      await client.unbind();

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
      }));
    } catch (e) {
      console.error("LDAP query failed, falling back to LDIF:", e);
    }
  }

  // Fallback: read from LDIF files
  try {
    const files = await fs.readdir(LDIF_DIR);
    const users: LdapUser[] = [];

    for (const file of files) {
      if (!file.endsWith(".ldif") || file.startsWith("group_")) continue;

      try {
        const content = await fs.readFile(path.join(LDIF_DIR, file), "utf-8");
        const lines = content.split("\n");

        const user: any = {};
        for (const line of lines) {
          const [key, ...valueParts] = line.split(":");
          const value = valueParts.join(":").trim();
          if (key === "dn") user.dn = value;
          if (key === "uid") user.uid = value;
          if (key === "cn") user.cn = value;
          if (key === "sn") user.sn = value;
          if (key === "mail") user.mail = value;
          if (key === "uidnumber") user.uidNumber = Number(value);
          if (key === "gidnumber") user.gidNumber = Number(value);
          if (key === "homedirectory") user.homeDirectory = value;
          if (key === "loginshell") user.loginShell = value;
        }

        if (user.uid) users.push(user);
      } catch {}
    }

    return users;
  } catch {
    return [];
  }
}

// Query groups from LDAP or fallback to groups.json + LDIF
export async function queryGroups(): Promise<LdapGroup[]> {
  const ldapUrl = process.env.LDAP_URL;
  const bindDn = process.env.LDAP_BIND_DN;
  const bindPw = process.env.LDAP_BIND_PW;
  const baseDn = process.env.LDAP_BASE_DN ?? "dc=homelab,dc=churlet,dc=eu";

  // Try LDAP first
  if (ldapUrl && bindDn && bindPw) {
    try {
      const mod = await import("ldapts");
      const Client = mod.Client;

      // MODIFIÉ: Utilise le helper pour les options TLS
      const clientOptions = getLdapClientOptions();
      const client = new Client(clientOptions);

      await client.bind(bindDn, bindPw);

      const { searchEntries } = await client.search(`ou=groups,${baseDn}`, {
        scope: "sub",
        filter: "(objectClass=posixGroup)",
      });

      await client.unbind();

      return searchEntries.map((entry: any) => ({
        dn: entry.dn,
        cn: entry.cn,
        gidNumber: Number(entry.gidNumber),
        memberUid: Array.isArray(entry.memberUid)
          ? entry.memberUid
          : entry.memberUid
          ? [entry.memberUid]
          : [],
      }));
    } catch (e) {
      console.error("LDAP group query failed, falling back to local:", e);
    }
  }

  // Fallback: read from groups.json and LDIF files
  const groups: LdapGroup[] = [];
  const groupsFile = path.join(DATA_DIR, "groups.json");

  try {
    const raw = await fs.readFile(groupsFile, "utf-8");
    const localGroups = JSON.parse(raw);
    for (const g of localGroups) {
      groups.push({
        dn: `cn=${g.cn},ou=groups,${baseDn}`,
        cn: g.cn,
        gidNumber: g.gidnumber,
        memberUid: g.memberuid || [],
      });
    }
  } catch {}

  // Also scan LDIF files for groups
  try {
    const files = await fs.readdir(LDIF_DIR);
    for (const file of files) {
      if (!file.startsWith("group_") || !file.endsWith(".ldif")) continue;

      try {
        const content = await fs.readFile(path.join(LDIF_DIR, file), "utf-8");
        const lines = content.split("\n");

        const group: any = { memberUid: [] };
        for (const line of lines) {
          const [key, ...valueParts] = line.split(":");
          const value = valueParts.join(":").trim();
          if (key === "dn") group.dn = value;
          if (key === "cn") group.cn = value;
          if (key === "gidnumber") group.gidNumber = Number(value);
          if (key === "memberuid") {
            if (!group.memberUid) group.memberUid = [];
            group.memberUid.push(value);
          }
        }

        if (group.cn && !groups.find((g) => g.cn === group.cn)) {
          groups.push(group);
        }
      } catch {}
    }
  } catch {}

  return groups;
}

// Update user in LDAP
export async function updateUserInLdap(
  uid: string,
  updates: Partial<LdapUser>
) {
  const ldapUrl = process.env.LDAP_URL;
  const bindDn = process.env.LDAP_BIND_DN;
  const bindPw = process.env.LDAP_BIND_PW;
  const baseDn = process.env.LDAP_BASE_DN ?? "dc=homelab,dc=churlet,dc=eu";

  if (!ldapUrl || !bindDn || !bindPw) {
    throw new Error(
      "LDAP not configured - cannot update user in LDAP directly"
    );
  }

  const mod = await import("ldapts");
  const Client = mod.Client;
  const Change = mod.Change;

  // MODIFIÉ: Utilise le helper pour les options TLS
  const clientOptions = getLdapClientOptions();
  const client = new Client(clientOptions);

  await client.bind(bindDn, bindPw);

  const userDn = `uid=${uid},ou=people,${baseDn}`;
  const changes: any[] = [];

  if (updates.mail) {
    changes.push(
      new Change({
        operation: "replace",
        modification: { mail: updates.mail } as any,
      })
    );
  }
  if (updates.loginShell) {
    changes.push(
      new Change({
        operation: "replace",
        modification: { loginShell: updates.loginShell } as any,
      })
    );
  }
  if (updates.cn) {
    changes.push(
      new Change({
        operation: "replace",
        modification: { cn: updates.cn } as any,
      })
    );
  }

  await client.modify(userDn, changes);
  await client.unbind();

  return { ok: true, dn: userDn };
}

// Delete user from LDAP
export async function deleteUserFromLdap(uid: string) {
  const ldapUrl = process.env.LDAP_URL;
  const bindDn = process.env.LDAP_BIND_DN;
  const bindPw = process.env.LDAP_BIND_PW;
  const baseDn = process.env.LDAP_BASE_DN ?? "dc=homelab,dc=churlet,dc=eu";

  if (!ldapUrl || !bindDn || !bindPw) {
    throw new Error("LDAP not configured");
  }

  const mod = await import("ldapts");
  const Client = mod.Client;

  // MODIFIÉ: Utilise le helper pour les options TLS
  const clientOptions = getLdapClientOptions();
  const client = new Client(clientOptions);

  await client.bind(bindDn, bindPw);
  const userDn = `uid=${uid},ou=people,${baseDn}`;
  await client.del(userDn);
  await client.unbind();

  return { ok: true };
}
