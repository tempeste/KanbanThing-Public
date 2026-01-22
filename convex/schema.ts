import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  workspaces: defineTable({
    name: v.string(),
    docs: v.optional(v.string()),
    prefix: v.optional(v.string()),
    ticketCounter: v.optional(v.number()),
    docCounter: v.optional(v.number()),
    createdAt: v.number(),
  }),

  featureDocs: defineTable({
    workspaceId: v.id("workspaces"),
    title: v.string(),
    content: v.string(),
    number: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("unclaimed"),
        v.literal("in_progress"),
        v.literal("done")
      )
    ),
    order: v.optional(v.number()),
    parentDocId: v.optional(v.id("featureDocs")),
    archived: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_workspace", ["workspaceId"])
    .index("by_workspace_parent", ["workspaceId", "parentDocId"]),

  tickets: defineTable({
    workspaceId: v.id("workspaces"),
    title: v.string(),
    description: v.string(),
    docId: v.optional(v.id("featureDocs")),
    number: v.optional(v.number()),
    parentTicketId: v.optional(v.id("tickets")),
    order: v.optional(v.number()),
    archived: v.optional(v.boolean()),
    status: v.union(
      v.literal("unclaimed"),
      v.literal("in_progress"),
      v.literal("done")
    ),
    ownerId: v.optional(v.string()),
    ownerType: v.optional(v.union(v.literal("user"), v.literal("agent"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_workspace", ["workspaceId"])
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_workspace_doc", ["workspaceId", "docId"])
    .index("by_parent", ["parentTicketId"]),

  apiKeys: defineTable({
    workspaceId: v.id("workspaces"),
    keyHash: v.string(),
    name: v.string(),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"])
    .index("by_keyHash", ["keyHash"]),
});
