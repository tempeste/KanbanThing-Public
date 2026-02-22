import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { authComponent } from "./auth";
import { getOpenClawInstanceUrlValidationError } from "../lib/openclaw-instance-validation";

const encryptedTokenValidator = v.object({
  nonce: v.string(),
  ciphertext: v.string(),
});

const normalizeName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Name is required");
  }
  if (trimmed.length > 120) {
    throw new Error("Name cannot exceed 120 characters");
  }
  return trimmed;
};

const normalizeUrl = (url: string) => {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error("URL is required");
  }
  try {
    const urlError = getOpenClawInstanceUrlValidationError(trimmed);
    if (urlError) {
      throw new Error(urlError);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Invalid URL");
  }
  if (trimmed.length > 500) {
    throw new Error("URL cannot exceed 500 characters");
  }
  return trimmed;
};

const requireAuthUserId = async (ctx: any) => {
  const user = await authComponent.getAuthUser(ctx);
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user._id;
};

const ensureNameUnique = async (
  ctx: any,
  userId: string,
  normalizedName: string,
  excludeId?: Id<"openclawInstances">
) => {
  const existing = await ctx.db
    .query("openclawInstances")
    .withIndex("by_user_name", (q: any) =>
      q.eq("userId", userId).eq("name", normalizedName)
    )
    .first();

  if (existing && existing._id !== excludeId) {
    throw new Error("Instance name must be unique per user");
  }
};

export const getCurrentUserId = query({
  args: {},
  handler: async (ctx) => {
    return await requireAuthUserId(ctx);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const instances = await ctx.db
      .query("openclawInstances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return instances.map((instance) => ({
      _id: instance._id,
      name: instance.name,
      url: instance.url,
      createdAt: instance.createdAt,
      updatedAt: instance.updatedAt,
    }));
  },
});

export const remove = mutation({
  args: {
    id: v.id("openclawInstances"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const instance = await ctx.db.get(args.id);
    if (!instance || instance.userId !== userId) {
      throw new Error("Instance not found");
    }
    await ctx.db.delete(args.id);
  },
});

export const createEncrypted = internalMutation({
  args: {
    userId: v.string(),
    name: v.string(),
    url: v.string(),
    encryptedToken: encryptedTokenValidator,
  },
  handler: async (ctx, args) => {
    const name = normalizeName(args.name);
    const url = normalizeUrl(args.url);
    await ensureNameUnique(ctx, args.userId, name);

    const now = Date.now();
    return await ctx.db.insert("openclawInstances", {
      userId: args.userId,
      name,
      url,
      encryptedToken: args.encryptedToken,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateEncrypted = internalMutation({
  args: {
    id: v.id("openclawInstances"),
    userId: v.string(),
    name: v.optional(v.string()),
    url: v.optional(v.string()),
    encryptedToken: v.optional(encryptedTokenValidator),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.id);
    if (!instance || instance.userId !== args.userId) {
      throw new Error("Instance not found");
    }

    const updates: {
      name?: string;
      url?: string;
      encryptedToken?: { nonce: string; ciphertext: string };
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      updates.name = normalizeName(args.name);
      await ensureNameUnique(ctx, args.userId, updates.name, args.id);
    }
    if (args.url !== undefined) {
      updates.url = normalizeUrl(args.url);
    }
    if (args.encryptedToken !== undefined) {
      updates.encryptedToken = args.encryptedToken;
    }

    await ctx.db.patch(args.id, updates);
  },
});

export const getOwnedEncryptedForDispatch = internalQuery({
  args: {
    id: v.id("openclawInstances"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.id);
    if (!instance || instance.userId !== args.userId) {
      return null;
    }
    return instance;
  },
});
