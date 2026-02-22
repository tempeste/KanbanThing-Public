import { describe, expect, it } from "vitest";
import {
  decryptOpenClawToken,
  encryptOpenClawToken,
} from "@/lib/openclaw-crypto";

const randomKey = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64");

describe("openclaw crypto", () => {
  it("encrypts and decrypts tokens with AES-GCM", async () => {
    const key = randomKey();
    const token = "oc_secret_token_123";

    const encrypted = await encryptOpenClawToken(token, key);
    const decrypted = await decryptOpenClawToken(encrypted, key);

    expect(encrypted.nonce).not.toBe("");
    expect(encrypted.ciphertext).not.toBe("");
    expect(decrypted).toBe(token);
  });

  it("rejects invalid key length", async () => {
    await expect(
      encryptOpenClawToken("token", Buffer.from("short").toString("base64"))
    ).rejects.toThrow("OPENCLAW_ENCRYPTION_KEY must decode to 32 bytes");
  });

  it("fails decryption with the wrong key", async () => {
    const encrypted = await encryptOpenClawToken("token", randomKey());
    await expect(decryptOpenClawToken(encrypted, randomKey())).rejects.toThrow();
  });
});

