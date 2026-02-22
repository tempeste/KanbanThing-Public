import { describe, expect, it } from "vitest";
import { buildOpenClawDispatchMessage } from "@/lib/openclaw-dispatch";

describe("buildOpenClawDispatchMessage", () => {
  it("builds a batched OpenClaw dispatch message with ticket lines", () => {
    const message = buildOpenClawDispatchMessage({
      workspaceName: "KanbanThing",
      workspaceId: "w_123",
      workspaceDocs:
        "Team rules: write tests first. Use small commits. Keep API responses backward compatible.",
      tickets: [
        {
          _id: "t_1",
          number: 12,
          title: "Fix auth bug",
          description: "Investigate auth redirect loop and add regression coverage.",
        },
        { _id: "t_2", number: 15, title: "Add search", description: "" },
      ],
    });

    expect(message).toContain("KanbanThing dispatch: 2 tickets");
    expect(message).toContain("workspace KanbanThing (ID: w_123)");
    expect(message).toContain("Workspace docs (truncated):");
    expect(message).toContain("Team rules: write tests first.");
    expect(message).toContain("1. Ticket #12: Fix auth bug (ID: t_1)");
    expect(message).toContain("Description: Investigate auth redirect loop");
    expect(message).toContain("2. Ticket #15: Add search (ID: t_2)");
    expect(message).toContain("Spawn a subagent per ticket.");
  });
});
