import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("openclawDispatchActions visibility", () => {
  it("keeps dispatch execution and cancellation internal-only", () => {
    const filePath = path.join(process.cwd(), "convex/openclawDispatchActions.ts");
    const source = fs.readFileSync(filePath, "utf8");

    expect(source).toContain('import { internalAction } from "./_generated/server";');
    expect(source).toContain("export const executeDispatch = internalAction({");
    expect(source).toContain("export const cancelDispatch = internalAction({");
    expect(source).not.toContain("export const executeDispatch = action({");
    expect(source).not.toContain("export const cancelDispatch = action({");
  });
});
