export type OpenClawEncryptedToken = {
  nonce: string;
  ciphertext: string;
};

const AES_KEY_LENGTH_BYTES = 32;
const AES_GCM_NONCE_LENGTH_BYTES = 12;

const decodeBase64 = (value: string) => Uint8Array.from(Buffer.from(value, "base64"));
const encodeBase64 = (value: Uint8Array) => Buffer.from(value).toString("base64");

const parseKey = (rawKey: string) => {
  const key = rawKey.trim();
  if (!key) {
    throw new Error("OPENCLAW_ENCRYPTION_KEY is required");
  }

  const bytes = decodeBase64(key);
  if (bytes.length !== AES_KEY_LENGTH_BYTES) {
    throw new Error("OPENCLAW_ENCRYPTION_KEY must decode to 32 bytes (base64)");
  }
  return bytes;
};

const importAesKey = async (rawKey: string, usage: "encrypt" | "decrypt") =>
  crypto.subtle.importKey(
    "raw",
    parseKey(rawKey),
    { name: "AES-GCM" },
    false,
    [usage]
  );

export const encryptOpenClawToken = async (
  plaintextToken: string,
  rawKey: string
): Promise<OpenClawEncryptedToken> => {
  const token = plaintextToken.trim();
  if (!token) {
    throw new Error("Token is required");
  }

  const key = await importAesKey(rawKey, "encrypt");
  const nonce = crypto.getRandomValues(new Uint8Array(AES_GCM_NONCE_LENGTH_BYTES));
  const encoded = new TextEncoder().encode(token);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, encoded)
  );

  return {
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(encrypted),
  };
};

export const decryptOpenClawToken = async (
  encryptedToken: OpenClawEncryptedToken,
  rawKey: string
) => {
  const key = await importAesKey(rawKey, "decrypt");
  const nonce = decodeBase64(encryptedToken.nonce);
  const ciphertext = decodeBase64(encryptedToken.ciphertext);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
};

