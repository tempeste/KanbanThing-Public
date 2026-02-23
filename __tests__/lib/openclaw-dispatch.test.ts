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
    expect(message).toContain("Dispatch metadata (machine-readable):");
    expect(message).toContain("```json");
    expect(message).toContain('"kanbanthing_dispatch_v": 1');
    expect(message).toContain('"workspaceId": "w_123"');
    expect(message).toContain('"workspaceName": "KanbanThing"');
    expect(message).toContain('"ticketCount": 2');
    expect(message).toContain('"metadataTicketCount": 2');
    expect(message).toContain('"metadataTruncated": false');
    expect(message).toContain('"id": "t_1"');
    expect(message).toContain("Workspace docs (truncated):");
    expect(message).toContain("Team rules: write tests first.");
    expect(message).toContain("1. Ticket #12: Fix auth bug (ID: t_1)");
    expect(message).toContain("Description: Investigate auth redirect loop");
    expect(message).toContain("2. Ticket #15: Add search (ID: t_2)");
    expect(message).toContain("Spawn a subagent per ticket.");
  });

  it("caps metadata ticket entries for large batches", () => {
    const message = buildOpenClawDispatchMessage({
      workspaceName: "KanbanThing",
      workspaceId: "w_123",
      tickets: Array.from({ length: 25 }, (_, index) => ({
        _id: `t_${index + 1}`,
        number: index + 1,
        title: `Ticket ${index + 1}`,
      })),
    });

    expect(message).toContain('"ticketCount": 25');
    expect(message).toContain('"metadataTicketCount": 20');
    expect(message).toContain('"metadataTruncated": true');
    expect(message).toContain('"id": "t_20"');
    expect(message).not.toContain('"id": "t_21"');
    expect(message).toContain("25 tickets");
    expect(message).toContain("25. Ticket #25: Ticket 25 (ID: t_25)");
  });
});
