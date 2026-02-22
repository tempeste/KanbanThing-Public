import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("OpenClaw API references", () => {
  it("does not use as-any casts in OpenClaw action files", () => {
    const files = [
      "convex/openclawDispatch.ts",
      "convex/openclawDispatchActions.ts",
      "convex/openclawInstancesActions.ts",
    ];

    for (const file of files) {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source).not.toContain("(api as any)");
      expect(source).not.toContain("(internal as any)");
    }
  });
});
