import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { generateWorkspacePrefix } from "./prefix";
import { actorValidator, logTicketActivity } from "./activityHelpers";

const Status = v.union(
  v.literal("unclaimed"),
  v.literal("in_progress"),
  v.literal("done")
);

type StatusType = "unclaimed" | "in_progress" | "done";

type CountsDelta = {
  count: number;
  done: number;
};

const getOrderValue = (ticket: { order?: number; createdAt: number }) =>
  ticket.order ?? ticket.createdAt;

const getCountedState = (archived: boolean | undefined, status: StatusType) => {
  const counted = !archived;
  const done = counted && status === "done";
  return { counted, done };
};

const applyCountsDelta = async (
  ctx: MutationCtx,
  parentId: Id<"tickets">,
  delta: CountsDelta
) => {
  if (!delta.count && !delta.done) return;
  const parent = await ctx.db.get(parentId);
  if (!parent) return;
  const nextCount = Math.max(0, (parent.childCount ?? 0) + delta.count);
  const nextDone = Math.max(0, (parent.childDoneCount ?? 0) + delta.done);
  await ctx.db.patch(parentId, {
    childCount: nextCount,
    childDoneCount: nextDone,
    updatedAt: Date.now(),
  });
};

const ensureValidParent = async (
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  ticketId: Id<"tickets"> | null,
  parentId: Id<"tickets"> | null
) => {
  if (!parentId) return;
  if (ticketId && parentId === ticketId) {
    throw new Error("Ticket cannot be its own parent");
  }
  const parent = await ctx.db.get(parentId);
  if (!parent || parent.workspaceId !== workspaceId) {
    throw new Error("Invalid parent ticket");
  }
  let ancestorId: Id<"tickets"> | null = parent.parentId;
  while (ancestorId) {
    if (ticketId && ancestorId === ticketId) {
      throw new Error("Ticket cannot be moved under its own descendant");
    }
    const ancestor = await ctx.db.get(ancestorId);
    if (!ancestor) break;
    ancestorId = ancestor.parentId;
  }
};

const cascadeArchive = async (
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  rootId: Id<"tickets">,
  archived: boolean
) => {
  const queue: Id<"tickets">[] = [rootId];
  while (queue.length) {
    const currentId = queue.shift();
    if (!currentId) continue;
    const children = await ctx.db
      .query("tickets")
      .withIndex("by_workspace_parent", (q) =>
        q.eq("workspaceId", workspaceId).eq("parentId", currentId)
      )
      .collect();
    for (const child of children) {
      queue.push(child._id);
      const prevArchived = child.archived ?? false;
      if (prevArchived === archived) continue;
      const prevState = getCountedState(prevArchived, child.status);
      const nextState = getCountedState(archived, child.status);
      if (child.parentId) {
        await applyCountsDelta(ctx, child.parentId, {
          count: nextState.counted ? 1 : -1,
          done: nextState.done ? 1 : prevState.done ? -1 : 0,
        });
      }
      await ctx.db.patch(child._id, {
        archived,
        updatedAt: Date.now(),
      });
    }
  }
};

export const list = query({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tickets")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

export const listByStatus = query({
  args: {
    workspaceId: v.id("workspaces"),
    status: Status,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tickets")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("status", args.status)
      )
      .collect();
  },
});

export const listByParent = query({
  args: {
    workspaceId: v.id("workspaces"),
    parentId: v.union(v.id("tickets"), v.null()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tickets")
      .withIndex("by_workspace_parent", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("parentId", args.parentId)
      )
      .collect();
  },
});

export const get = query({
  args: { id: v.id("tickets") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const getHierarchy = query({
  args: { id: v.id("tickets") },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket) return null;

    const ancestors = [] as typeof ticket[];
    let currentParentId = ticket.parentId ?? null;
    while (currentParentId) {
      const parent = await ctx.db.get(currentParentId);
      if (!parent) break;
      ancestors.unshift(parent);
      currentParentId = parent.parentId ?? null;
    }

    const children = await ctx.db
      .query("tickets")
      .withIndex("by_workspace_parent", (q) =>
        q.eq("workspaceId", ticket.workspaceId).eq("parentId", ticket._id)
      )
      .collect();

    children.sort((a, b) => getOrderValue(a) - getOrderValue(b));

    return {
      ticket,
      ancestors,
      children,
    };
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    title: v.string(),
    description: v.string(),
    parentId: v.optional(v.union(v.id("tickets"), v.null())),
    actor: v.optional(actorValidator),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) {
      throw new Error("Workspace not found");
    }

    const parentId = args.parentId ?? null;
    await ensureValidParent(ctx, args.workspaceId, null, parentId);

    const now = Date.now();
    const nextNumber = (workspace.ticketCounter ?? 0) + 1;
    const prefix = workspace.prefix ?? generateWorkspacePrefix(workspace.name);

    await ctx.db.patch(args.workspaceId, {
      prefix,
      ticketCounter: nextNumber,
    });

    const id = await ctx.db.insert("tickets", {
      workspaceId: args.workspaceId,
      title: args.title,
      description: args.description,
      number: nextNumber,
      parentId,
      order: now,
      archived: false,
      status: "unclaimed",
      childCount: 0,
      childDoneCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    if (parentId) {
      await applyCountsDelta(ctx, parentId, { count: 1, done: 0 });
    }

    await logTicketActivity(ctx, {
      workspaceId: args.workspaceId,
      ticketId: id,
      type: "ticket_created",
      data: { title: args.title, parentId },
      actor: args.actor,
    });

    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("tickets"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    parentId: v.optional(v.union(v.id("tickets"), v.null())),
    order: v.optional(v.number()),
    archived: v.optional(v.boolean()),
    actor: v.optional(actorValidator),
  },
  handler: async (ctx, args) => {
    const { id, parentId, archived, actor, ...updates } = args;
    const ticket = await ctx.db.get(id);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    const nextParentId = parentId !== undefined ? parentId : ticket.parentId;
    const nextArchived = archived !== undefined ? archived : ticket.archived ?? false;
    const archiveChanged = archived !== undefined && nextArchived !== (ticket.archived ?? false);
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    if (args.title !== undefined && args.title !== ticket.title) {
      changes.title = { from: ticket.title, to: args.title };
    }
    if (args.description !== undefined && args.description !== ticket.description) {
      changes.description = { from: ticket.description, to: args.description };
    }
    if (parentId !== undefined && (ticket.parentId ?? null) !== (nextParentId ?? null)) {
      changes.parentId = { from: ticket.parentId ?? null, to: nextParentId ?? null };
    }
    if (archived !== undefined && (ticket.archived ?? false) !== nextArchived) {
      changes.archived = { from: ticket.archived ?? false, to: nextArchived };
    }
    if (args.order !== undefined && args.order !== ticket.order) {
      changes.order = { from: ticket.order ?? null, to: args.order };
    }

    await ensureValidParent(ctx, ticket.workspaceId, id, nextParentId ?? null);

    const prevState = getCountedState(ticket.archived ?? false, ticket.status);
    const nextState = getCountedState(nextArchived, ticket.status);

    if (ticket.parentId !== nextParentId) {
      if (ticket.parentId && prevState.counted) {
        await applyCountsDelta(ctx, ticket.parentId, {
          count: -1,
          done: prevState.done ? -1 : 0,
        });
      }
      if (nextParentId && nextState.counted) {
        await applyCountsDelta(ctx, nextParentId, {
          count: 1,
          done: nextState.done ? 1 : 0,
        });
      }
    } else if (ticket.parentId && prevState.counted !== nextState.counted) {
      await applyCountsDelta(ctx, ticket.parentId, {
        count: nextState.counted ? 1 : -1,
        done: nextState.done ? 1 : prevState.done ? -1 : 0,
      });
    }

    await ctx.db.patch(id, {
      ...updates,
      parentId: nextParentId ?? null,
      archived: nextArchived,
      updatedAt: Date.now(),
    });

    if (archiveChanged) {
      await cascadeArchive(ctx, ticket.workspaceId, id, nextArchived);
    }

    if (Object.keys(changes).length > 0) {
      await logTicketActivity(ctx, {
        workspaceId: ticket.workspaceId,
        ticketId: ticket._id,
        type: "ticket_updated",
        data: { changes },
        actor,
      });
    }
  },
});

const applyStatusChange = async (
  ctx: MutationCtx,
  ticket: {
    parentId: Id<"tickets"> | null;
    archived?: boolean;
    status: StatusType;
    _id: Id<"tickets">;
  },
  status: StatusType
) => {
  if (ticket.status === status) return;
  if (ticket.parentId && !(ticket.archived ?? false)) {
    const doneBefore = ticket.status === "done";
    const doneAfter = status === "done";
    if (doneBefore !== doneAfter) {
      await applyCountsDelta(ctx, ticket.parentId, {
        count: 0,
        done: doneAfter ? 1 : -1,
      });
    }
  }

  const updates: Record<string, unknown> = {
    status,
    updatedAt: Date.now(),
  };
  if (status === "unclaimed") {
    updates.ownerId = undefined;
    updates.ownerType = undefined;
  }
  await ctx.db.patch(ticket._id, updates);
};

export const claim = mutation({
  args: {
    id: v.id("tickets"),
    ownerId: v.string(),
    ownerType: v.union(v.literal("user"), v.literal("agent")),
    actor: v.optional(actorValidator),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket) {
      throw new Error("Ticket not found");
    }
    if (ticket.status !== "unclaimed") {
      throw new Error("Ticket is not available to claim");
    }
    const prevOwner = {
      ownerId: ticket.ownerId ?? null,
      ownerType: ticket.ownerType ?? null,
      ownerDisplayName: ticket.ownerDisplayName ?? null,
    };
    await ctx.db.patch(args.id, {
      status: "in_progress",
      ownerId: args.ownerId,
      ownerType: args.ownerType,
      updatedAt: Date.now(),
    });

    await logTicketActivity(ctx, {
      workspaceId: ticket.workspaceId,
      ticketId: ticket._id,
      type: "ticket_assignment_changed",
      data: {
        from: prevOwner,
        to: { ownerId: args.ownerId, ownerType: args.ownerType, ownerDisplayName: null },
      },
      actor: args.actor,
    });

    await logTicketActivity(ctx, {
      workspaceId: ticket.workspaceId,
      ticketId: ticket._id,
      type: "ticket_status_changed",
      data: { from: ticket.status, to: "in_progress" },
      actor: args.actor,
    });
  },
});

export const complete = mutation({
  args: { id: v.id("tickets"), actor: v.optional(actorValidator) },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket) {
      throw new Error("Ticket not found");
    }
    if (ticket.status !== "in_progress") {
      throw new Error("Ticket must be in progress to complete");
    }
    await applyStatusChange(ctx, ticket, "done");

    await logTicketActivity(ctx, {
      workspaceId: ticket.workspaceId,
      ticketId: ticket._id,
      type: "ticket_status_changed",
      data: { from: ticket.status, to: "done" },
      actor: args.actor,
    });
  },
});

export const unclaim = mutation({
  args: { id: v.id("tickets"), actor: v.optional(actorValidator) },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket) {
      throw new Error("Ticket not found");
    }
    const prevOwner = {
      ownerId: ticket.ownerId ?? null,
      ownerType: ticket.ownerType ?? null,
      ownerDisplayName: ticket.ownerDisplayName ?? null,
    };
    await applyStatusChange(ctx, ticket, "unclaimed");

    await logTicketActivity(ctx, {
      workspaceId: ticket.workspaceId,
      ticketId: ticket._id,
      type: "ticket_status_changed",
      data: { from: ticket.status, to: "unclaimed" },
      actor: args.actor,
    });

    if (prevOwner.ownerId || prevOwner.ownerType || prevOwner.ownerDisplayName) {
      await logTicketActivity(ctx, {
        workspaceId: ticket.workspaceId,
        ticketId: ticket._id,
        type: "ticket_assignment_changed",
        data: {
          from: prevOwner,
          to: { ownerId: null, ownerType: null, ownerDisplayName: null },
        },
        actor: args.actor,
      });
    }
  },
});

export const assign = mutation({
  args: {
    id: v.id("tickets"),
    ownerId: v.string(),
    ownerType: v.union(v.literal("user"), v.literal("agent")),
    ownerDisplayName: v.optional(v.string()),
    actor: v.optional(actorValidator),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    const prevOwner = {
      ownerId: ticket.ownerId ?? null,
      ownerType: ticket.ownerType ?? null,
      ownerDisplayName: ticket.ownerDisplayName ?? null,
    };
    const prevStatus = ticket.status;

    const updates: Record<string, unknown> = {
      ownerId: args.ownerId,
      ownerType: args.ownerType,
      ownerDisplayName: args.ownerDisplayName,
      updatedAt: Date.now(),
    };

    // If assigning to unclaimed ticket, set status to in_progress
    if (ticket.status === "unclaimed") {
      updates.status = "in_progress";
    }

    await ctx.db.patch(args.id, updates);

    await logTicketActivity(ctx, {
      workspaceId: ticket.workspaceId,
      ticketId: ticket._id,
      type: "ticket_assignment_changed",
      data: {
        from: prevOwner,
        to: {
          ownerId: args.ownerId,
          ownerType: args.ownerType,
          ownerDisplayName: args.ownerDisplayName ?? null,
        },
      },
      actor: args.actor,
    });

    if (prevStatus === "unclaimed") {
      await logTicketActivity(ctx, {
        workspaceId: ticket.workspaceId,
        ticketId: ticket._id,
        type: "ticket_status_changed",
        data: { from: "unclaimed", to: "in_progress" },
        actor: args.actor,
      });
    }
  },
});

export const unassign = mutation({
  args: { id: v.id("tickets"), actor: v.optional(actorValidator) },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket) {
      throw new Error("Ticket not found");
    }

    const prevOwner = {
      ownerId: ticket.ownerId ?? null,
      ownerType: ticket.ownerType ?? null,
      ownerDisplayName: ticket.ownerDisplayName ?? null,
    };
    const prevStatus = ticket.status;

    const updates: Record<string, unknown> = {
      ownerId: undefined,
      ownerType: undefined,
      ownerDisplayName: undefined,
      updatedAt: Date.now(),
    };

    // Only reset to unclaimed if currently in_progress
    // Keep "done" status when unassigning completed tickets
    if (ticket.status === "in_progress") {
      updates.status = "unclaimed";
    }

    await ctx.db.patch(args.id, updates);

    await logTicketActivity(ctx, {
      workspaceId: ticket.workspaceId,
      ticketId: ticket._id,
      type: "ticket_assignment_changed",
      data: {
        from: prevOwner,
        to: { ownerId: null, ownerType: null, ownerDisplayName: null },
      },
      actor: args.actor,
    });

    if (prevStatus === "in_progress") {
      await logTicketActivity(ctx, {
        workspaceId: ticket.workspaceId,
        ticketId: ticket._id,
        type: "ticket_status_changed",
        data: { from: "in_progress", to: "unclaimed" },
        actor: args.actor,
      });
    }
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("tickets"),
    status: Status,
    actor: v.optional(actorValidator),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket) {
      throw new Error("Ticket not found");
    }
    const prevStatus = ticket.status;
    const prevOwner = {
      ownerId: ticket.ownerId ?? null,
      ownerType: ticket.ownerType ?? null,
      ownerDisplayName: ticket.ownerDisplayName ?? null,
    };
    await applyStatusChange(ctx, ticket, args.status);
    if (prevStatus !== args.status) {
      await logTicketActivity(ctx, {
        workspaceId: ticket.workspaceId,
        ticketId: ticket._id,
        type: "ticket_status_changed",
        data: { from: prevStatus, to: args.status },
        actor: args.actor,
      });
    }
    if (args.status === "unclaimed" && (prevOwner.ownerId || prevOwner.ownerType)) {
      await logTicketActivity(ctx, {
        workspaceId: ticket.workspaceId,
        ticketId: ticket._id,
        type: "ticket_assignment_changed",
        data: {
          from: prevOwner,
          to: { ownerId: null, ownerType: null, ownerDisplayName: null },
        },
        actor: args.actor,
      });
    }
  },
});

export const move = mutation({
  args: {
    id: v.id("tickets"),
    status: Status,
    order: v.number(),
    actor: v.optional(actorValidator),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket) {
      throw new Error("Ticket not found");
    }
    const prevStatus = ticket.status;
    const prevOwner = {
      ownerId: ticket.ownerId ?? null,
      ownerType: ticket.ownerType ?? null,
      ownerDisplayName: ticket.ownerDisplayName ?? null,
    };
    await applyStatusChange(ctx, ticket, args.status);
    await ctx.db.patch(args.id, {
      order: args.order,
      updatedAt: Date.now(),
    });
    if (prevStatus !== args.status) {
      await logTicketActivity(ctx, {
        workspaceId: ticket.workspaceId,
        ticketId: ticket._id,
        type: "ticket_status_changed",
        data: { from: prevStatus, to: args.status },
        actor: args.actor,
      });
    }
    if (args.status === "unclaimed" && (prevOwner.ownerId || prevOwner.ownerType)) {
      await logTicketActivity(ctx, {
        workspaceId: ticket.workspaceId,
        ticketId: ticket._id,
        type: "ticket_assignment_changed",
        data: {
          from: prevOwner,
          to: { ownerId: null, ownerType: null, ownerDisplayName: null },
        },
        actor: args.actor,
      });
    }
  },
});

const deleteSubtree = async (
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  rootId: Id<"tickets">
) => {
  const stack = [rootId];
  while (stack.length) {
    const currentId = stack.pop();
    if (!currentId) continue;
    const children = await ctx.db
      .query("tickets")
      .withIndex("by_workspace_parent", (q) =>
        q.eq("workspaceId", workspaceId).eq("parentId", currentId)
      )
      .collect();
    for (const child of children) {
      stack.push(child._id);
    }
    await ctx.db.delete(currentId);
  }
};

export const remove = mutation({
  args: { id: v.id("tickets"), actor: v.optional(actorValidator) },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.id);
    if (!ticket) return;

    await logTicketActivity(ctx, {
      workspaceId: ticket.workspaceId,
      ticketId: ticket._id,
      type: "ticket_deleted",
      data: { title: ticket.title },
      actor: args.actor,
    });

    if (ticket.parentId && !(ticket.archived ?? false)) {
      await applyCountsDelta(ctx, ticket.parentId, {
        count: -1,
        done: ticket.status === "done" ? -1 : 0,
      });
    }

    await deleteSubtree(ctx, ticket.workspaceId, ticket._id);
  },
});
