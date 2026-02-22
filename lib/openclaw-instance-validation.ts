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

export const getOpenClawInstanceUrlValidationError = (url: string) => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "URL must be a valid absolute URL";
  }

  if (parsed.protocol !== "https:") {
    return "URL must use HTTPS";
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  const normalizedHostname =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (!normalizedHostname) {
    return "URL must be a valid absolute URL";
  }

  if (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    isPrivateOrLocalIpv4(normalizedHostname) ||
    isPrivateOrLocalIpv6(normalizedHostname)
  ) {
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
