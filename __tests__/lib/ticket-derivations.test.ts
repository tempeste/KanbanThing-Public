import { describe, expect, it } from "vitest";
import { Id } from "@/convex/_generated/dataModel";
import {
  deriveChildrenByParent,
  deriveSortedFlatRows,
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
  number: overrides.number ?? 1,
  parentId: overrides.parentId ?? null,
  order: overrides.order,
  archived: overrides.archived ?? false,
  status: overrides.status,
  childCount: overrides.childCount ?? 0,
  childDoneCount: overrides.childDoneCount ?? 0,
  ownerId: overrides.ownerId,
  ownerType: overrides.ownerType,
  ownerDisplayName: overrides.ownerDisplayName,
  priority: overrides.priority,
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

  it("groups visible tickets by status including backlog and dispatched", () => {
    const withBacklog = [
      ...tickets,
      createTicket({ _id: t("bl"), title: "Backlog Idea", status: "backlog", order: 1, createdAt: 1 }),
      createTicket({ _id: t("ds"), title: "Dispatched Task", status: "dispatched", order: 2, createdAt: 2 }),
    ];
    const visible = deriveVisibleTickets(withBacklog, false);
    const byStatus = deriveTicketsByStatus(visible);

    expect(byStatus.backlog.map((ticket) => ticket._id)).toEqual([t("bl")]);
    expect(byStatus.unclaimed.map((ticket) => ticket._id)).toEqual([t("a")]);
    expect(byStatus.dispatched.map((ticket) => ticket._id)).toEqual([t("ds")]);
    expect(byStatus.in_progress.map((ticket) => ticket._id)).toEqual([t("b")]);
    expect(byStatus.done.map((ticket) => ticket._id)).toEqual([t("c")]);
  });

  describe("board sort", () => {
    const sortTickets: TicketSummary[] = [
      createTicket({
        _id: t("s1"),
        title: "Zebra",
        status: "unclaimed",
        order: 30,
        createdAt: 100,
        priority: "low",
      }),
      createTicket({
        _id: t("s2"),
        title: "Apple",
        status: "unclaimed",
        order: 10,
        createdAt: 300,
        priority: "urgent",
      }),
      createTicket({
        _id: t("s3"),
        title: "Mango",
        status: "unclaimed",
        order: 20,
        createdAt: 200,
        priority: "low",
      }),
    ];

    it("sorts by priority (urgent first, tiebreak by order)", () => {
      const result = deriveTicketsByStatus(sortTickets, "priority");
      const ids = result.unclaimed.map((t) => t._id);
      expect(ids).toEqual([t("s2"), t("s3"), t("s1")]);
    });

    it("sorts by newest first", () => {
      const result = deriveTicketsByStatus(sortTickets, "newest");
      const ids = result.unclaimed.map((t) => t._id);
      expect(ids).toEqual([t("s2"), t("s3"), t("s1")]);
    });

    it("sorts by oldest first", () => {
      const result = deriveTicketsByStatus(sortTickets, "oldest");
      const ids = result.unclaimed.map((t) => t._id);
      expect(ids).toEqual([t("s1"), t("s3"), t("s2")]);
    });

    it("sorts by title alphabetically", () => {
      const result = deriveTicketsByStatus(sortTickets, "title");
      const ids = result.unclaimed.map((t) => t._id);
      expect(ids).toEqual([t("s2"), t("s3"), t("s1")]);
    });

    it("sorts by manual order", () => {
      const result = deriveTicketsByStatus(sortTickets, "order");
      const ids = result.unclaimed.map((t) => t._id);
      expect(ids).toEqual([t("s2"), t("s3"), t("s1")]);
    });
  });

  describe("deriveSortedFlatRows", () => {
    const flatTickets: TicketSummary[] = [
      createTicket({
        _id: t("f1"),
        title: "Beta",
        number: 2,
        status: "done",
        ownerDisplayName: "Zara",
      }),
      createTicket({
        _id: t("f2"),
        title: "Alpha",
        number: 1,
        status: "unclaimed",
        ownerDisplayName: undefined,
      }),
      createTicket({
        _id: t("f3"),
        title: "Gamma",
        number: 3,
        status: "in_progress",
        ownerDisplayName: "Ada",
      }),
    ];

    it("sorts by number ascending", () => {
      const rows = deriveSortedFlatRows(flatTickets, "number", "asc");
      expect(rows.map((r) => r.ticket._id)).toEqual([t("f2"), t("f1"), t("f3")]);
      expect(rows[0].depth).toBe(0);
    });

    it("sorts by title descending", () => {
      const rows = deriveSortedFlatRows(flatTickets, "title", "desc");
      expect(rows.map((r) => r.ticket._id)).toEqual([t("f3"), t("f1"), t("f2")]);
    });

    it("sorts by assignee with unassigned last", () => {
      const rows = deriveSortedFlatRows(flatTickets, "assignee", "asc");
      expect(rows.map((r) => r.ticket._id)).toEqual([t("f3"), t("f1"), t("f2")]);
    });

    it("sorts by status with backlog first", () => {
      const withBacklog = [
        ...flatTickets,
        createTicket({ _id: t("f0"), title: "Idea", number: 0, status: "backlog" }),
        createTicket({ _id: t("f4"), title: "Queued", number: 4, status: "dispatched" }),
      ];
      const rows = deriveSortedFlatRows(withBacklog, "status", "asc");
      expect(rows.map((r) => r.ticket.status)).toEqual([
        "backlog",
        "unclaimed",
        "dispatched",
        "in_progress",
        "done",
      ]);
    });
  });
});
