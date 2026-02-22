import { describe, expect, it } from "vitest";
import { PRIORITY_META, PRIORITY_ORDER, type TicketPriority } from "@/lib/priority";

describe("priority", () => {
  it("PRIORITY_ORDER contains every PRIORITY_META key exactly once", () => {
    const metaKeys = Object.keys(PRIORITY_META).sort();
    const orderKeys = [...PRIORITY_ORDER].sort();
    expect(orderKeys).toEqual(metaKeys);
  });

  it("PRIORITY_ORDER is ranked urgent → none", () => {
    expect(PRIORITY_ORDER).toEqual(["urgent", "high", "medium", "low", "none"]);
  });

  it("every meta entry has non-empty label, shortLabel, and color", () => {
    for (const key of PRIORITY_ORDER) {
      const meta = PRIORITY_META[key];
      expect(meta.label).toBeTruthy();
      expect(meta.shortLabel).toBeTruthy();
      expect(meta.color).toBeTruthy();
    }
  });
});
