import { describe, expect, it } from "vitest";
import {
  getOpenClawInstanceUrlValidationError,
  validateOpenClawInstanceInput,
} from "@/lib/openclaw-instance-validation";

describe("validateOpenClawInstanceInput", () => {
  it("requires name and URL", () => {
    expect(
      validateOpenClawInstanceInput({
        name: " ",
        url: "https://example.com",
        token: "t",
        requireToken: true,
      })
    ).toBe("Name is required");

    expect(
      validateOpenClawInstanceInput({
        name: "OpenClaw",
        url: " ",
        token: "t",
        requireToken: true,
      })
    ).toBe("URL is required");
  });

  it("requires token when creating", () => {
    expect(
      validateOpenClawInstanceInput({
        name: "OpenClaw",
        url: "https://example.com",
        token: " ",
        requireToken: true,
      })
    ).toBe("Token is required");
  });

  it("allows empty token when editing and validates URL format", () => {
    expect(
      validateOpenClawInstanceInput({
        name: "OpenClaw",
        url: "not-a-url",
        token: "",
        requireToken: false,
      })
    ).toBe("URL must be a valid absolute URL");

    expect(
      validateOpenClawInstanceInput({
        name: "OpenClaw",
        url: "https://example.com",
        token: "",
        requireToken: false,
      })
    ).toBeNull();
  });

  it("requires HTTPS and blocks private or local hosts", () => {
    expect(getOpenClawInstanceUrlValidationError("http://example.com")).toBe(
      "URL must use HTTPS"
    );
    expect(getOpenClawInstanceUrlValidationError("ftp://example.com")).toBe(
      "URL must use HTTPS"
    );

    expect(getOpenClawInstanceUrlValidationError("https://127.0.0.1")).toBe(
      "URL host is not allowed"
    );
    expect(getOpenClawInstanceUrlValidationError("https://10.0.0.5")).toBe(
      "URL host is not allowed"
    );
    expect(getOpenClawInstanceUrlValidationError("https://172.16.0.1")).toBe(
      "URL host is not allowed"
    );
    expect(getOpenClawInstanceUrlValidationError("https://192.168.1.10")).toBe(
      "URL host is not allowed"
    );
    expect(getOpenClawInstanceUrlValidationError("https://169.254.169.254")).toBe(
      "URL host is not allowed"
    );
    expect(getOpenClawInstanceUrlValidationError("https://localhost:3000")).toBe(
      "URL host is not allowed"
    );
    expect(getOpenClawInstanceUrlValidationError("https://foo.localhost")).toBe(
      "URL host is not allowed"
    );
    expect(getOpenClawInstanceUrlValidationError("https://[::1]")).toBe(
      "URL host is not allowed"
    );
  });

  it("allows public HTTPS hosts", () => {
    expect(getOpenClawInstanceUrlValidationError("https://example.com")).toBeNull();
    expect(getOpenClawInstanceUrlValidationError("https://sub.example.com:8443")).toBeNull();
  });
});
