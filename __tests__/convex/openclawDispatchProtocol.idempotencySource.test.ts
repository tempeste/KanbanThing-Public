import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("openclawDispatchProtocol idempotency", () => {
  it("adds a receipt table and dedupes plugin events by workspace + eventId", () => {
    const schemaSource = fs.readFileSync(
      path.join(process.cwd(), "convex/schema.ts"),
      "utf8"
    );
    const protocolSource = fs.readFileSync(
      path.join(process.cwd(), "convex/openclawDispatchProtocol.ts"),
      "utf8"
    );

    expect(schemaSource).toContain("dispatchProtocolEventReceipts: defineTable({");
    expect(schemaSource).toContain('.index("by_workspace_event", ["workspaceId", "eventId"])');

    expect(protocolSource).toContain('.query("dispatchProtocolEventReceipts")');
    expect(protocolSource).toContain('.withIndex("by_workspace_event"');
    expect(protocolSource).toContain("duplicate: true");
    expect(protocolSource).toContain('await ctx.db.insert("dispatchProtocolEventReceipts"');
  });
});
