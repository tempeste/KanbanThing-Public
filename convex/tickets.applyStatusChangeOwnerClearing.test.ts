import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("applyStatusChange owner clearing", () => {
  it("does not clear owner metadata when moving to dispatched", () => {
    const filePath = path.join(process.cwd(), "convex/tickets.ts");
    const source = fs.readFileSync(filePath, "utf8");

    expect(source).toContain('if (status === "unclaimed" || status === "backlog") {');
    expect(source).not.toContain(
      'if (status === "unclaimed" || status === "backlog" || status === "dispatched") {'
    );
  });
});
