import { describe, expect, it } from "vitest";
import { Id } from "@/convex/_generated/dataModel";
import {
  deriveChildrenByParent,
  deriveTicketsByStatus,
  deriveTreeRows,
  deriveVisibleTickets,
} from "@/lib/ticket-derivations";
import { TicketSummary } from "@/lib/ticket-summary";

const t = (value: string) => value as Id<"tickets">;
const w = (value: string) => value as Id<"workspaces">;

const createTicket = (
  overrides: Partial<TicketSummary> & Pick<TicketSummary, "_id" | "status" | "title">
): TicketSummary => ({
  _id: overrides._id,
  workspaceId: w("w1"),
  title: overrides.title,
  number: 1,
  parentId: overrides.parentId ?? null,
  order: overrides.order,
  archived: overrides.archived ?? false,
  status: overrides.status,
  childCount: overrides.childCount ?? 0,
  childDoneCount: overrides.childDoneCount ?? 0,
  ownerId: overrides.ownerId,
  ownerType: overrides.ownerType,
  ownerDisplayName: overrides.ownerDisplayName,
  createdAt: overrides.createdAt ?? 1,
  updatedAt: overrides.updatedAt ?? 1,
});

describe("ticket derivations", () => {
  const tickets: TicketSummary[] = [
    createTicket({
      _id: t("a"),
      title: "A",
      status: "unclaimed",
      order: 20,
      createdAt: 20,
    }),
    createTicket({
      _id: t("b"),
      title: "B",
      status: "in_progress",
      order: 10,
      createdAt: 10,
    }),
    createTicket({
      _id: t("c"),
      title: "C",
      status: "done",
      parentId: t("a"),
      order: 5,
      createdAt: 30,
    }),
    createTicket({
      _id: t("archived-parent"),
      title: "Archived Parent",
      status: "done",
      archived: true,
      createdAt: 40,
    }),
    createTicket({
      _id: t("archived-child"),
      title: "Archived Child",
      status: "unclaimed",
      parentId: t("archived-parent"),
      createdAt: 50,
    }),
  ];

  it("filters archived descendants when showArchived is false", () => {
    const visible = deriveVisibleTickets(tickets, false);
    expect(visible.map((ticket) => ticket._id)).toEqual([t("a"), t("b"), t("c")]);
  });

  it("builds tree rows in sorted depth-first order", () => {
    const visible = deriveVisibleTickets(tickets, false);
    const childrenByParent = deriveChildrenByParent(visible);
    const rows = deriveTreeRows(childrenByParent, new Set());

    expect(rows.map((row) => `${row.ticket._id}:${row.depth}`)).toEqual([
      `${t("b")}:0`,
      `${t("a")}:0`,
      `${t("c")}:1`,
    ]);
  });

  it("groups visible tickets by status", () => {
    const visible = deriveVisibleTickets(tickets, false);
    const byStatus = deriveTicketsByStatus(visible);

    expect(byStatus.unclaimed.map((ticket) => ticket._id)).toEqual([t("a")]);
    expect(byStatus.in_progress.map((ticket) => ticket._id)).toEqual([t("b")]);
    expect(byStatus.done.map((ticket) => ticket._id)).toEqual([t("c")]);
  });
});
