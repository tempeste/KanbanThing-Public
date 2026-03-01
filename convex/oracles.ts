import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireWorkspaceAccess } from "./access";
import { actorValidator, resolveActor } from "./activityHelpers";

const MAX_NAME_LENGTH = 200;
const MAX_SLUG_LENGTH = 100;
const MIN_SLUG_LENGTH = 3;
const MAX_DESCRIPTION_LENGTH = 1_000;
const MAX_CONTENT_LENGTH = 100_000;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set(["new", "edit", "api", "settings"]);

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId, args.agentApiKeyId);

    const oracles = await ctx.db
      .query("oracles")
      .withIndex("by_workspace_updatedAt", (q) =>
        q.eq("workspaceId", args.workspaceId)
      )
      .order("desc")
      .collect();

    // Project out content for list endpoint efficiency
    return oracles.map((o) => ({
      _id: o._id,
      _creationTime: o._creationTime,
      workspaceId: o.workspaceId,
      slug: o.slug,
      name: o.name,
      description: o.description,
      createdBy: o.createdBy,
      updatedBy: o.updatedBy,
      updatedAt: o.updatedAt,
      createdAt: o.createdAt,
    }));
  },
});

export const getBySlug = query({
  args: {
    workspaceId: v.id("workspaces"),
    slug: v.string(),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAccess(ctx, args.workspaceId, args.agentApiKeyId);

    return await ctx.db
      .query("oracles")
      .withIndex("by_workspace_slug", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("slug", args.slug)
      )
      .first();
  },
});

export const get = query({
  args: {
    id: v.id("oracles"),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    const oracle = await ctx.db.get(args.id);
    if (!oracle) return null;
    await requireWorkspaceAccess(ctx, oracle.workspaceId, args.agentApiKeyId);
    return oracle;
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    content: v.string(),
    actor: v.optional(actorValidator),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    await requireWorkspaceAccess(ctx, args.workspaceId, args.agentApiKeyId);

    // Validate slug
    const slug = args.slug.trim().toLowerCase();
    if (slug.length < MIN_SLUG_LENGTH) {
      throw new Error(`Slug must be at least ${MIN_SLUG_LENGTH} characters`);
    }
    if (slug.length > MAX_SLUG_LENGTH) {
      throw new Error(`Slug cannot exceed ${MAX_SLUG_LENGTH} characters`);
    }
    if (!SLUG_PATTERN.test(slug)) {
      throw new Error(
        "Slug must contain only lowercase letters, numbers, and hyphens"
      );
    }
    if (RESERVED_SLUGS.has(slug)) {
      throw new Error(`Slug "${slug}" is reserved`);
    }

    // Validate name
    const name = args.name.trim();
    if (!name) throw new Error("Name is required");
    if (name.length > MAX_NAME_LENGTH) {
      throw new Error(`Name cannot exceed ${MAX_NAME_LENGTH} characters`);
    }

    // Validate description
    if (args.description.length > MAX_DESCRIPTION_LENGTH) {
      throw new Error(
        `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`
      );
    }

    // Validate content
    if (args.content.length > MAX_CONTENT_LENGTH) {
      throw new Error(
        `Content cannot exceed ${MAX_CONTENT_LENGTH} characters`
      );
    }

    // Check slug uniqueness within workspace (Convex doesn't enforce at index level)
    const existing = await ctx.db
      .query("oracles")
      .withIndex("by_workspace_slug", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("slug", slug)
      )
      .first();
    if (existing) {
      throw new Error(`An oracle with slug "${slug}" already exists in this workspace`);
    }

    const resolved = await resolveActor(ctx, args.actor);
    const now = Date.now();

    const id = await ctx.db.insert("oracles", {
      workspaceId: args.workspaceId,
      slug,
      name,
      description: args.description,
      content: args.content,
      createdBy: resolved.actorDisplayName,
      updatedBy: resolved.actorDisplayName,
      updatedAt: now,
      createdAt: now,
    });

    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("oracles"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    content: v.optional(v.string()),
    actor: v.optional(actorValidator),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    const oracle = await ctx.db.get(args.id);
    if (!oracle) throw new Error("Oracle not found");
    await requireWorkspaceAccess(ctx, oracle.workspaceId, args.agentApiKeyId);

    const patch: Record<string, string | number | undefined> = {};

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Name is required");
      if (name.length > MAX_NAME_LENGTH) {
        throw new Error(`Name cannot exceed ${MAX_NAME_LENGTH} characters`);
      }
      patch.name = name;
    }

    if (args.description !== undefined) {
      if (args.description.length > MAX_DESCRIPTION_LENGTH) {
        throw new Error(
          `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters`
        );
      }
      patch.description = args.description;
    }

    if (args.content !== undefined) {
      if (args.content.length > MAX_CONTENT_LENGTH) {
        throw new Error(
          `Content cannot exceed ${MAX_CONTENT_LENGTH} characters`
        );
      }
      patch.content = args.content;
    }

    if (Object.keys(patch).length === 0) return;

    const resolved = await resolveActor(ctx, args.actor);
    patch.updatedBy = resolved.actorDisplayName;
    patch.updatedAt = Date.now();

    await ctx.db.patch(args.id, patch);
  },
});

export const remove = mutation({
  args: {
    id: v.id("oracles"),
    agentApiKeyId: v.optional(v.id("apiKeys")),
  },
  handler: async (ctx, args) => {
    const oracle = await ctx.db.get(args.id);
    if (!oracle) throw new Error("Oracle not found");
    await requireWorkspaceAccess(ctx, oracle.workspaceId, args.agentApiKeyId);
    await ctx.db.delete(args.id);
  },
});
