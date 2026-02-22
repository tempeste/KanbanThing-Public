import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("OpenClaw getCurrentUserId visibility", () => {
  it("keeps getCurrentUserId internal and only called through internal API refs", () => {
    const instancesSource = fs.readFileSync(
      path.join(process.cwd(), "convex/openclawInstances.ts"),
      "utf8"
    );
    const dispatchActionsSource = fs.readFileSync(
      path.join(process.cwd(), "convex/openclawDispatchActions.ts"),
      "utf8"
    );
    const instancesActionsSource = fs.readFileSync(
      path.join(process.cwd(), "convex/openclawInstancesActions.ts"),
      "utf8"
    );

    expect(instancesSource).toContain("export const getCurrentUserId = internalQuery({");
    expect(instancesSource).not.toContain("export const getCurrentUserId = query({");
    expect(dispatchActionsSource).toContain("internal.openclawInstances.getCurrentUserId");
    expect(instancesActionsSource).toContain("internal.openclawInstances.getCurrentUserId");
    expect(dispatchActionsSource).not.toContain("api.openclawInstances.getCurrentUserId");
    expect(instancesActionsSource).not.toContain("api.openclawInstances.getCurrentUserId");
  });
});
