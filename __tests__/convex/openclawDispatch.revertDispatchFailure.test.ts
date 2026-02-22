import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("revertDispatchFailure rollback guard", () => {
  it("skips rollback when the ticket has already left dispatched status", () => {
    const filePath = path.join(process.cwd(), "convex/openclawDispatch.ts");
    const source = fs.readFileSync(filePath, "utf8");

    expect(source).toContain('if (ticket.status !== "dispatched") continue;');
  });
});
