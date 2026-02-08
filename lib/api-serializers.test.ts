import { describe, expect, it } from "vitest";
import { Doc } from "@/convex/_generated/dataModel";
import { serializeTicket, serializeTicketSummary } from "@/lib/api-serializers";

const ticket = {
  _id: "ticket_1",
  _creationTime: 1,
  workspaceId: "workspace_1",
  title: "Write tests",
  description: "Detailed body",
  number: 42,
  parentId: null,
  order: 10,
  archived: false,
  status: "in_progress",
  childCount: 2,
  childDoneCount: 1,
  ownerId: "user_1",
  ownerType: "user",
  ownerDisplayName: "Alex",
  createdAt: 100,
  updatedAt: 200,
} as unknown as Doc<"tickets">;

describe("api serializers", () => {
  it("serializes full ticket payload with description", () => {
    const serialized = serializeTicket(ticket);
    expect(serialized.description).toBe("Detailed body");
    expect(serialized.id).toBe("ticket_1");
  });

  it("serializes summary payload without description", () => {
    const serialized = serializeTicketSummary(ticket);
    expect(serialized.id).toBe("ticket_1");
    expect(serialized).not.toHaveProperty("description");
    expect(serialized.childCount).toBe(2);
    expect(serialized.hasChildren).toBe(true);
  });
});
