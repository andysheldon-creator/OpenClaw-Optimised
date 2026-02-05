import net from "node:net";

export type IpVersion = 4 | 6;

export type IpAllowlistEntry = {
  raw: string;
  version: IpVersion;
  /** Network address with host bits zeroed (length 4 or 16). */
  network: Uint8Array;
  /** Prefix length (0..32 for IPv4, 0..128 for IPv6). */
  prefix: number;
};

export type IpAllowlistParseOk = {
  ok: true;
  entries: IpAllowlistEntry[];
};

export type IpAllowlistParseError = {
  ok: false;
  error: string;
  invalidEntries: string[];
};

function normalizeIpLiteral(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  // Strip optional brackets.
  const bracketStripped =
    trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
  // Strip IPv6 zone index (e.g. fe80::1%lo0).
  const zoneStripped = bracketStripped.split("%")[0] ?? "";
  const normalized = zoneStripped.trim().toLowerCase();
  // Normalize IPv4-mapped IPv6 literals.
  if (normalized.startsWith("::ffff:")) {
    const candidate = normalized.slice("::ffff:".length);
    if (net.isIP(candidate) === 4) {
      return candidate;
    }
  }
  return normalized;
}

function parseIPv4Bytes(ip: string): Uint8Array | null {
  if (net.isIP(ip) !== 4) {
    return null;
  }
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const bytes = new Uint8Array(4);
  for (let i = 0; i < 4; i += 1) {
    const part = parts[i] ?? "";
    if (!part) {
      return null;
    }
    const value = Number.parseInt(part, 10);
    if (!Number.isFinite(value) || value < 0 || value > 255) {
      return null;
    }
    bytes[i] = value;
  }
  return bytes;
}

function parseHexHextet(value: string): number | null {
  if (!value || value.length > 4) {
    return null;
  }
  const parsed = Number.parseInt(value, 16);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0xffff) {
    return null;
  }
  return parsed;
}

function parseIPv6Bytes(ip: string): Uint8Array | null {
  if (net.isIP(ip) !== 6) {
    return null;
  }
  // Fast path for :: and ::1 etc is covered by the general parser.
  const raw = ip;
  const parts = raw.split("::");
  if (parts.length > 2) {
    return null;
  }
  const leftRaw = parts[0] ?? "";
  const rightRaw = parts.length === 2 ? (parts[1] ?? "") : "";
  const leftGroups = leftRaw ? leftRaw.split(":").filter(Boolean) : [];
  const rightGroups = rightRaw ? rightRaw.split(":").filter(Boolean) : [];

  // Detect IPv4-embedded tail (last group only).
  const allGroups = [...leftGroups, ...rightGroups];
  const lastGroup = allGroups.length > 0 ? allGroups[allGroups.length - 1] : "";
  const hasEmbeddedV4 = Boolean(lastGroup && lastGroup.includes("."));
  const embeddedV4 = hasEmbeddedV4 ? parseIPv4Bytes(lastGroup) : null;
  if (hasEmbeddedV4 && !embeddedV4) {
    return null;
  }
  if (hasEmbeddedV4) {
    // Ensure no other group contains dots.
    for (const group of allGroups.slice(0, -1)) {
      if (group.includes(".")) {
        return null;
      }
    }
    // Remove last group from whichever side it belongs to.
    if (rightGroups.length > 0) {
      rightGroups.pop();
    } else if (leftGroups.length > 0) {
      leftGroups.pop();
    } else {
      return null;
    }
  }

  const leftHextets: number[] = [];
  for (const group of leftGroups) {
    const parsed = parseHexHextet(group);
    if (parsed === null) {
      return null;
    }
    leftHextets.push(parsed);
  }
  const rightHextets: number[] = [];
  for (const group of rightGroups) {
    const parsed = parseHexHextet(group);
    if (parsed === null) {
      return null;
    }
    rightHextets.push(parsed);
  }

  const embeddedHextets = embeddedV4
    ? [
        ((embeddedV4[0] ?? 0) << 8) | (embeddedV4[1] ?? 0),
        ((embeddedV4[2] ?? 0) << 8) | (embeddedV4[3] ?? 0),
      ]
    : [];

  const total = leftHextets.length + rightHextets.length + embeddedHextets.length;
  if (total > 8) {
    return null;
  }
  if (parts.length === 1) {
    // No ::, must be exactly 8 hextets.
    if (total !== 8) {
      return null;
    }
  }
  if (parts.length === 2) {
    const zerosToInsert = 8 - total;
    // Per IPv6 syntax, :: must compress at least one group.
    if (zerosToInsert < 1) {
      return null;
    }
    const zeros = Array.from({ length: zerosToInsert }, () => 0);
    const hextets = [...leftHextets, ...zeros, ...rightHextets, ...embeddedHextets];
    if (hextets.length !== 8) {
      return null;
    }
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 8; i += 1) {
      const value = hextets[i] ?? 0;
      bytes[i * 2] = (value >> 8) & 0xff;
      bytes[i * 2 + 1] = value & 0xff;
    }
    return bytes;
  }

  // parts.length === 1
  const hextets = [...leftHextets, ...rightHextets, ...embeddedHextets];
  if (hextets.length !== 8) {
    return null;
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    const value = hextets[i] ?? 0;
    bytes[i * 2] = (value >> 8) & 0xff;
    bytes[i * 2 + 1] = value & 0xff;
  }
  return bytes;
}

function maskNetwork(bytes: Uint8Array, prefix: number): Uint8Array {
  const out = new Uint8Array(bytes);
  if (prefix <= 0) {
    out.fill(0);
    return out;
  }
  const fullBytes = Math.floor(prefix / 8);
  const remBits = prefix % 8;
  if (fullBytes >= out.length) {
    return out;
  }
  if (remBits > 0) {
    const mask = (0xff << (8 - remBits)) & 0xff;
    out[fullBytes] &= mask;
    for (let i = fullBytes + 1; i < out.length; i += 1) {
      out[i] = 0;
    }
    return out;
  }
  for (let i = fullBytes; i < out.length; i += 1) {
    out[i] = 0;
  }
  return out;
}

function matchesCidr(ip: Uint8Array, network: Uint8Array, prefix: number): boolean {
  if (prefix <= 0) {
    return true;
  }
  const fullBytes = Math.floor(prefix / 8);
  const remBits = prefix % 8;
  for (let i = 0; i < fullBytes; i += 1) {
    if ((ip[i] ?? 0) !== (network[i] ?? 0)) {
      return false;
    }
  }
  if (remBits === 0) {
    return true;
  }
  const mask = (0xff << (8 - remBits)) & 0xff;
  const ipByte = ip[fullBytes] ?? 0;
  const netByte = network[fullBytes] ?? 0;
  return (ipByte & mask) === (netByte & mask);
}

function parseCidrToken(rawToken: string): { ok: true; entry: IpAllowlistEntry } | { ok: false } {
  const token = rawToken.trim();
  if (!token) {
    return { ok: false };
  }
  const pieces = token.split("/");
  if (pieces.length > 2) {
    return { ok: false };
  }
  const ipRaw = normalizeIpLiteral(pieces[0] ?? "");
  if (!ipRaw) {
    return { ok: false };
  }
  const version = net.isIP(ipRaw);
  if (version !== 4 && version !== 6) {
    return { ok: false };
  }
  const prefixRaw = pieces.length === 2 ? (pieces[1] ?? "").trim() : "";
  const prefix = prefixRaw.length > 0 ? Number.parseInt(prefixRaw, 10) : version === 4 ? 32 : 128;
  const maxPrefix = version === 4 ? 32 : 128;
  if (!Number.isFinite(prefix) || prefix < 0 || prefix > maxPrefix) {
    return { ok: false };
  }
  const bytes = version === 4 ? parseIPv4Bytes(ipRaw) : parseIPv6Bytes(ipRaw);
  if (!bytes) {
    return { ok: false };
  }
  const network = maskNetwork(bytes, prefix);
  return {
    ok: true,
    entry: {
      raw: token,
      version,
      network,
      prefix,
    },
  };
}

export function parseIpAllowlist(raw: string): IpAllowlistParseOk | IpAllowlistParseError {
  const tokens = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const entries: IpAllowlistEntry[] = [];
  const invalid: string[] = [];
  for (const token of tokens) {
    const parsed = parseCidrToken(token);
    if (!parsed.ok) {
      invalid.push(token);
      continue;
    }
    entries.push(parsed.entry);
  }
  if (invalid.length > 0) {
    return {
      ok: false,
      error:
        "Invalid IP allowlist entries. Use comma-separated IPs or CIDRs " +
        '(e.g. "203.0.113.10,198.51.100.0/24,2001:db8::/32").',
      invalidEntries: invalid,
    };
  }
  return { ok: true, entries };
}

export function isIpAllowed(ipRaw: string, entries: IpAllowlistEntry[]): boolean {
  const ip = normalizeIpLiteral(ipRaw);
  const version = net.isIP(ip);
  if (version !== 4 && version !== 6) {
    return false;
  }
  const bytes = version === 4 ? parseIPv4Bytes(ip) : parseIPv6Bytes(ip);
  if (!bytes) {
    return false;
  }
  for (const entry of entries) {
    if (entry.version !== version) {
      continue;
    }
    if (matchesCidr(bytes, entry.network, entry.prefix)) {
      return true;
    }
  }
  return false;
}
