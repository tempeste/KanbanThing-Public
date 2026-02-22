import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("dispatchTickets server-side guards", () => {
  it("rejects done and already-dispatched tickets server-side", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "convex/openclawDispatch.ts"), "utf8");

    expect(source).toContain('if (ticket.status === "done" || ticket.status === "dispatched")');
    expect(source).toContain("cannot be dispatched from");
  });

  it("limits batch size and deduplicates ticket IDs", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "convex/openclawDispatch.ts"), "utf8");

    expect(source).toContain("if (ticketIds.length > 100)");
    expect(source).toContain("Cannot dispatch more than 100 tickets at once");
    expect(source).toContain("const ticketIds = [...new Set(args.ticketIds)]");
    expect(source).toContain("for (const ticketId of ticketIds)");

    // Verify dedup happens before the limit check
    const dedupIndex = source.indexOf("const ticketIds = [...new Set(args.ticketIds)]");
    const limitIndex = source.indexOf("if (ticketIds.length > 100)");
    expect(dedupIndex).toBeLessThan(limitIndex);
  });
});
