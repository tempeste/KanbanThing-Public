import { describe, expect, it } from "vitest";
import {
  getTransitionClass,
  normalizeStatusReason,
  validateStatusTransitionForActor,
} from "@/convex/statusPolicy";

describe("ticket status policy", () => {
  it("classifies standard transitions", () => {
    expect(getTransitionClass("unclaimed", "in_progress")).toBe("standard");
    expect(getTransitionClass("in_progress", "done")).toBe("standard");
    expect(getTransitionClass("done", "done")).toBe("standard");
  });

  it("classifies non-standard transitions", () => {
    expect(getTransitionClass("unclaimed", "done")).toBe("non_standard");
    expect(getTransitionClass("done", "unclaimed")).toBe("non_standard");
    expect(getTransitionClass("done", "in_progress")).toBe("non_standard");
    expect(getTransitionClass("in_progress", "unclaimed")).toBe("non_standard");
  });

  it("normalizes status reason", () => {
    expect(normalizeStatusReason(undefined)).toBeUndefined();
    expect(normalizeStatusReason("  ")).toBeUndefined();
    expect(normalizeStatusReason("  duplicate work  ")).toBe("duplicate work");
  });

  it("requires reason for agent non-standard transitions", () => {
    expect(() =>
      validateStatusTransitionForActor({
        from: "done",
        to: "in_progress",
        isAgentCaller: true,
        reason: undefined,
      })
    ).toThrow("Reason is required for non-standard status transitions");
  });

  it("allows human non-standard transitions without reason", () => {
    expect(
      validateStatusTransitionForActor({
        from: "done",
        to: "unclaimed",
        isAgentCaller: false,
        reason: undefined,
      })
    ).toEqual({
      transitionClass: "non_standard",
      reason: undefined,
    });
  });

  it("accepts agent non-standard transitions with reason", () => {
    expect(
      validateStatusTransitionForActor({
        from: "unclaimed",
        to: "done",
        isAgentCaller: true,
        reason: "  superseded by duplicate  ",
      })
    ).toEqual({
      transitionClass: "non_standard",
      reason: "superseded by duplicate",
    });
  });
});
