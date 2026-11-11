export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

export interface SsrfValidationOptions {
  /**
   * Local development ONLY: set strictly from server env
   * (`MCP_ALLOW_LOCAL_DEV_LOOPBACK === "true"`), never from request payloads.
   * Even when enabled, only http/https to loopback (`127.0.0.1`, `localhost`, `::1`)
   * is permitted; all RFC1918, CGNAT, link-local, and cloud metadata IPs remain blocked.
   */
  allowLocalDevLoopback?: boolean;
  resolveDns?: (hostname: string) => Promise<string[]>;
}

const BLOCKED_HOSTNAMES = new Set([
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

function normalizeHostname(raw: string): string {
  let host = raw.trim().toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  return host.replace(/\.+$/, "");
}

function parseIpv4Octets(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    nums.push(n);
  }
  return [nums[0], nums[1], nums[2], nums[3]];
}

function ipv4ToUint32(octets: [number, number, number, number]): number {
  return (
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
  );
}

function isLoopbackIpv4(octets: [number, number, number, number]): boolean {
  return octets[0] === 127;
}

export function isBlockedIpv4(ip: string, allowLoopback = false): boolean {
  const octets = parseIpv4Octets(ip);
  if (!octets) return false;
  if (isLoopbackIpv4(octets)) return !allowLoopback;

  const value = ipv4ToUint32(octets);
  const inCidr = (baseOctets: [number, number, number, number], prefixLen: number): boolean => {
    const mask = prefixLen === 0 ? 0 : (0xffffffff << (32 - prefixLen)) >>> 0;
    return (value & mask) === (ipv4ToUint32(baseOctets) & mask);
  };

  return (
    inCidr([0, 0, 0, 0], 8) || // Current network / unspecified
    inCidr([10, 0, 0, 0], 8) || // RFC1918 private
    inCidr([100, 64, 0, 0], 10) || // CGNAT RFC6598
    inCidr([127, 0, 0, 0], 8) || // Loopback
    inCidr([169, 254, 0, 0], 16) || // Link-local & cloud IMDS (169.254.169.254)
    inCidr([172, 16, 0, 0], 12) || // RFC1918 private
    inCidr([192, 0, 0, 0], 24) || // IETF protocol assignments
    inCidr([192, 0, 2, 0], 24) || // TEST-NET-1
    inCidr([192, 168, 0, 0], 16) || // RFC1918 private
    inCidr([198, 18, 0, 0], 15) || // Benchmarking
    inCidr([198, 51, 100, 0], 24) || // TEST-NET-2
    inCidr([203, 0, 113, 0], 24) || // TEST-NET-3
    inCidr([224, 0, 0, 0], 4) || // Multicast
    inCidr([240, 0, 0, 0], 4) // Reserved / broadcast
  );
}

function parseIpv6Hextets(raw: string): number[] | null {
  if (!raw || raw.includes("%")) return null;
  let ip = raw.toLowerCase();

  // Handle embedded IPv4 dotted quad at the tail (e.g. ::ffff:127.0.0.1)
  if (ip.includes(".")) {
    const lastColon = ip.lastIndexOf(":");
    if (lastColon === -1) return null;
    const v4Part = ip.slice(lastColon + 1);
    const octets = parseIpv4Octets(v4Part);
    if (!octets) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    ip = `${ip.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const doubleColonParts = ip.split("::");
  if (doubleColonParts.length > 2) return null;

  const parseGroups = (segment: string): number[] | null => {
    if (segment === "") return [];
    const groups = segment.split(":");
    const parsed: number[] = [];
    for (const g of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      parsed.push(parseInt(g, 16));
    }
    return parsed;
  };

  if (doubleColonParts.length === 1) {
    const groups = parseGroups(doubleColonParts[0]);
    return groups && groups.length === 8 ? groups : null;
  }

  const head = parseGroups(doubleColonParts[0]);
  const tail = parseGroups(doubleColonParts[1]);
  if (!head || !tail) return null;
  const zeroCount = 8 - head.length - tail.length;
  if (zeroCount < 1) return null;

  return [...head, ...new Array<number>(zeroCount).fill(0), ...tail];
}

function isLoopbackIpv6(hextets: number[]): boolean {
  return (
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0 &&
    hextets[6] === 0 &&
    hextets[7] === 1
  );
}

export function isBlockedIpv6(ip: string, allowLoopback = false): boolean {
  const host = normalizeHostname(ip);
  if (ip.includes("%")) return true;
  const hextets = parseIpv6Hextets(host);
  if (!hextets) return false;

  if (isLoopbackIpv6(hextets)) return !allowLoopback;

  const isAllZero = hextets.every((h) => h === 0);
  if (isAllZero) return true; // ::/128 unspecified

  // IPv4-mapped ::ffff:0:0/96 or IPv4-compatible ::/96 or NAT64 64:ff9b::/96
  const isV4Mapped =
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0xffff;
  const isV4Compat =
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0;
  const isNat64 =
    hextets[0] === 0x0064 &&
    hextets[1] === 0xff9b &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0;
  const isNat64Local = hextets[0] === 0x0064 && hextets[1] === 0xff9b && hextets[2] === 0x0001;

  if (isV4Mapped || isV4Compat || isNat64 || isNat64Local) {
    const embeddedIp = [
      (hextets[6] >> 8) & 0xff,
      hextets[6] & 0xff,
      (hextets[7] >> 8) & 0xff,
      hextets[7] & 0xff,
    ].join(".");
    // Even if IPv4 is public, external MCP endpoints must not tunnel via v4-mapped IPv6
    return isBlockedIpv4(embeddedIp, false) || isV4Mapped || isV4Compat;
  }

  if (hextets[0] === 0x0100 && hextets[1] === 0 && hextets[2] === 0 && hextets[3] === 0) {
    return true; // 100::/64 discard
  }
  if ((hextets[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((hextets[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((hextets[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local
  if ((hextets[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (hextets[0] === 0x2001 && hextets[1] === 0x0db8) return true; // 2001:db8::/32 documentation
  if (hextets[0] === 0x2002) return true; // 2002::/16 6to4
  if (hextets[0] === 0x2001 && hextets[1] === 0x0000) return true; // 2001::/32 Teredo

  return false;
}

export function isBlockedIp(ip: string, allowLoopback = false): boolean {
  const normalized = normalizeHostname(ip);
  if (parseIpv4Octets(normalized)) {
    return isBlockedIpv4(normalized, allowLoopback);
  }
  if (normalized.includes(":") || normalized.includes("%")) {
    const hextets = parseIpv6Hextets(normalized);
    if (!hextets) return true; // Reject malformed/zone-scoped IPv6 fail-closed
    return isBlockedIpv6(normalized, allowLoopback);
  }
  return true; // Fail-closed on unparseable address
}

async function defaultDenoResolveDns(hostname: string): Promise<string[]> {
  const results: string[] = [];
  for (const recordType of ["A", "AAAA"] as const) {
    try {
      const records = await Deno.resolveDns(hostname, recordType);
      results.push(...records);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        continue;
      }
      throw new SsrfError(`DNS resolution failed for ${hostname}`);
    }
  }
  return results;
}

export async function validateOutboundMcpUrl(
  rawUrl: string,
  options: SsrfValidationOptions = {}
): Promise<URL> {
  const allowLocalDevLoopback = options.allowLocalDevLoopback === true;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError("Invalid MCP endpoint URL");
  }

  if (parsed.username !== "" || parsed.password !== "") {
    throw new SsrfError("Embedded URL credentials are not allowed");
  }

  const host = normalizeHostname(parsed.hostname);
  if (!host) {
    throw new SsrfError("MCP endpoint hostname is missing");
  }

  const isExplicitLoopbackHost =
    host === "localhost" || host === "127.0.0.1" || host === "::1";

  if (parsed.protocol !== "https:") {
    if (!(allowLocalDevLoopback && parsed.protocol === "http:" && isExplicitLoopbackHost)) {
      throw new SsrfError("Only HTTPS URLs are permitted for remote MCP endpoints");
    }
  }

  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new SsrfError(`Blocked internal hostname: ${host}`);
  }

  if (!allowLocalDevLoopback && (host === "localhost" || host.endsWith(".localhost"))) {
    throw new SsrfError(`Blocked loopback hostname: ${host}`);
  }

  if (host.endsWith(".local") || host.endsWith(".internal")) {
    throw new SsrfError(`Blocked local network hostname: ${host}`);
  }

  const isIpLiteral = Boolean(parseIpv4Octets(host) || parsed.hostname.startsWith("["));
  if (isIpLiteral) {
    if (isBlockedIp(host, allowLocalDevLoopback)) {
      throw new SsrfError(`Blocked private or reserved IP address: ${host}`);
    }
    return parsed;
  }

  // Reject single-label hostnames except local dev loopback localhost
  if (!host.includes(".") && !(allowLocalDevLoopback && host === "localhost")) {
    throw new SsrfError(`Blocked single-label hostname: ${host}`);
  }

  const resolveDns = options.resolveDns ?? defaultDenoResolveDns;
  const resolvedIps = await resolveDns(host);
  if (resolvedIps.length === 0) {
    throw new SsrfError(`Host did not resolve to any IP address: ${host}`);
  }

  for (const ip of resolvedIps) {
    const ipAllowLoopback = allowLocalDevLoopback && host === "localhost";
    if (isBlockedIp(ip, ipAllowLoopback)) {
      throw new SsrfError(`Host ${host} resolved to blocked IP ${ip}`);
    }
  }

  return parsed;
}

export function createSsrfSafeFetch(
  options: SsrfValidationOptions & {
    timeoutMs?: number;
    baseFetch?: typeof fetch;
  } = {}
): typeof fetch {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const baseFetch = options.baseFetch ?? fetch;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    await validateOutboundMcpUrl(rawUrl, options);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("MCP request timeout")), timeoutMs);

    const signal = init?.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;

    try {
      const res = await baseFetch(input, {
        ...init,
        redirect: "manual",
        signal,
      });

      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel();
        throw new SsrfError(`Blocked HTTP ${res.status} redirect from MCP endpoint`);
      }

      return res;
    } finally {
      clearTimeout(timer);
    }
  };
}

