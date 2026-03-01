import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("OpenClaw user display name fallbacks", () => {
  it("avoids raw user ID fallbacks in dispatch activity logging", () => {
    const dispatchSource = fs.readFileSync(
      path.join(process.cwd(), "convex/openclawDispatch.ts"),
      "utf8"
    );
    const actionSource = fs.readFileSync(
      path.join(process.cwd(), "convex/openclawDispatchActions.ts"),
      "utf8"
    );

    expect(dispatchSource).toContain('user.name ?? user.email ?? "Authenticated user"');
    expect(dispatchSource).not.toContain("authUser.name ?? authUser.email ?? String(authUser._id)");
    // requestCancelDispatch resolves real display name via getUserDisplayName query
    expect(actionSource).toContain("getUserDisplayName");
    expect(actionSource).not.toContain('userDisplayName: "Authenticated user"');
  });
});
