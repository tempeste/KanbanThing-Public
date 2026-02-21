import { describe, expect, it } from "vitest";
import { validateOpenClawInstanceInput } from "@/lib/openclaw-instance-validation";

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
});

