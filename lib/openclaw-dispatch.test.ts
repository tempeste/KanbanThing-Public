import { describe, expect, it } from "vitest";
import { buildOpenClawDispatchMessage } from "@/lib/openclaw-dispatch";

describe("buildOpenClawDispatchMessage", () => {
  it("builds a batched OpenClaw dispatch message with ticket lines", () => {
    const message = buildOpenClawDispatchMessage({
      workspaceName: "KanbanThing",
      workspaceId: "w_123",
      tickets: [
        { _id: "t_1", number: 12, title: "Fix auth bug" },
        { _id: "t_2", number: 15, title: "Add search" },
      ],
    });

    expect(message).toContain("KanbanThing dispatch: 2 tickets");
    expect(message).toContain("workspace KanbanThing (ID: w_123)");
    expect(message).toContain("1. Ticket #12: Fix auth bug (ID: t_1)");
    expect(message).toContain("2. Ticket #15: Add search (ID: t_2)");
    expect(message).toContain("Spawn a subagent per ticket.");
  });
});

