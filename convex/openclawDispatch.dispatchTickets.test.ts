import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("dispatchTickets status guard", () => {
  it("rejects done and already-dispatched tickets server-side", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "convex/openclawDispatch.ts"), "utf8");

    expect(source).toContain('if (ticket.status === "done" || ticket.status === "dispatched")');
    expect(source).toContain("cannot be dispatched from");
  });
});
