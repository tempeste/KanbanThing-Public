const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

const isPrivateOrLocalIpv4 = (hostname: string) => {
  if (!IPV4_PATTERN.test(hostname)) return false;
  const octets = hostname.split(".").map((part) => Number(part));
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  const [a, b] = octets;
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
};

const isPrivateOrLocalIpv6 = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  if (!normalized.includes(":")) return false;

  // Detect IPv4-mapped IPv6 addresses. Node normalizes ::ffff:a.b.c.d to
  // ::ffff:XXYY:ZZWW (hex), so we handle both dotted-decimal and hex forms.
  const v4DottedMatch = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4DottedMatch) {
    return isPrivateOrLocalIpv4(v4DottedMatch[1]);
  }
  const v4HexMatch = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (v4HexMatch) {
    const hi = parseInt(v4HexMatch[1], 16);
    const lo = parseInt(v4HexMatch[2], 16);
    const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateOrLocalIpv4(ipv4);
  }

  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
};

const isDevelopment = () => process.env.NODE_ENV === "development";

export const getOpenClawInstanceUrlValidationError = (url: string) => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "URL must be a valid absolute URL";
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "URL must use HTTP or HTTPS";
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  const normalizedHostname =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (!normalizedHostname) {
    return "URL must be a valid absolute URL";
  }

  const isLocal =
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    isPrivateOrLocalIpv4(normalizedHostname) ||
    isPrivateOrLocalIpv6(normalizedHostname);

  if (isDevelopment()) {
    // In development, allow HTTP and local/private addresses
    return null;
  }

  // Production: require HTTPS, block local/private hosts
  if (parsed.protocol !== "https:") {
    return "URL must use HTTPS";
  }

  if (isLocal) {
    return "URL host is not allowed";
  }

  return null;
};

export const validateOpenClawInstanceInput = ({
  name,
  url,
  token,
  requireToken,
}: {
  name: string;
  url: string;
  token: string;
  requireToken: boolean;
}) => {
  const normalizedName = name.trim();
  const normalizedUrl = url.trim();

  if (!normalizedName) return "Name is required";
  if (!normalizedUrl) return "URL is required";
  if (requireToken && !token.trim()) return "Token is required";

  const urlError = getOpenClawInstanceUrlValidationError(normalizedUrl);
  if (urlError) return urlError;

  return null;
};
