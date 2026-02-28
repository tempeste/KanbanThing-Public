import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("ticket-table status filter count", () => {
  it("derives all-status count from the default filter list", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "components/ticket-table.tsx"), "utf8");

    expect(source).toContain("const ALL_FILTER_STATUSES: IssueStatus[] = [");
    expect(source).toContain("const allStatusCount = ALL_FILTER_STATUSES.length;");
    expect(source).not.toContain("const allStatusCount = 5;");
  });
});
