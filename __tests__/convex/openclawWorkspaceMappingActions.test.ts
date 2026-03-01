import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("openclaw workspace mapping actions wiring", () => {
  it("includes capability preflight and plugin endpoint calls", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "convex/openclawInstancesActions.ts"),
      "utf8",
    );

    expect(source).toContain("supportsWorkspaceMappingEndpoints");
    expect(source).toContain("workspaceMappingInspect");
    expect(source).toContain("workspaceMappingUpsert");
    expect(source).toContain("workspaceMappingDoctor");
    expect(source).toContain("/kanbanthing/workspace-mapping/inspect");
    expect(source).toContain("/kanbanthing/workspace-mapping/upsert");
    expect(source).toContain("/kanbanthing/workspace-mapping/doctor");
  });
});
