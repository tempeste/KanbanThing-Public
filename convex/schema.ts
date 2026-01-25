import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  workspaces: defineTable({
    name: v.string(),
    docs: v.optional(v.string()),
    prefix: v.optional(v.string()),
    ticketCounter: v.optional(v.number()),
    createdBy: v.optional(v.string()), // Better Auth user ID
    createdAt: v.number(),
  }),

  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    betterAuthUserId: v.string(), // References Better Auth's user.id
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["betterAuthUserId"])
    .index("by_workspace_user", ["workspaceId", "betterAuthUserId"]),

  tickets: defineTable({
    workspaceId: v.id("workspaces"),
    title: v.string(),
    description: v.string(),
    number: v.optional(v.number()),
    parentId: v.union(v.id("tickets"), v.null()),
    order: v.optional(v.number()),
    archived: v.optional(v.boolean()),
    status: v.union(
      v.literal("unclaimed"),
      v.literal("in_progress"),
      v.literal("done")
    ),
    childCount: v.number(),
    childDoneCount: v.number(),
    ownerId: v.optional(v.string()),
    ownerType: v.optional(v.union(v.literal("user"), v.literal("agent"))),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_workspace", ["workspaceId"])
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_workspace_parent", ["workspaceId", "parentId"]),

  apiKeys: defineTable({
    workspaceId: v.id("workspaces"),
    keyHash: v.string(),
    name: v.string(),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"])
    .index("by_keyHash", ["keyHash"]),
});
