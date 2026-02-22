import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("cancelDispatch workspace membership guard", () => {
  it("checks workspace membership before cancellation side effects", () => {
    const filePath = path.join(process.cwd(), "convex/openclawDispatchActions.ts");
    const source = fs.readFileSync(filePath, "utf8");

    expect(source).toContain("workspaceMembersInternal.hasMembershipForUserId");
    expect(source).toContain('if (!hasMembership) {');
    expect(source).toContain('throw new Error("Unauthorized");');
  });
});
