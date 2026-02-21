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

  try {
    new URL(normalizedUrl);
  } catch {
    return "URL must be a valid absolute URL";
  }

  return null;
};

