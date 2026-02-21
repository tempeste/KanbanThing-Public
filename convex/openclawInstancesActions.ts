"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { encryptOpenClawToken } from "../lib/openclaw-crypto";

const openclawApi = (api as any).openclawInstances;
const openclawInternal = (internal as any).openclawInstances;

const getEncryptionKey = () => {
  const key = process.env.OPENCLAW_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("OPENCLAW_ENCRYPTION_KEY is not configured");
  }
  return key;
};

export const create = action({
  args: {
    name: v.string(),
    url: v.string(),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.runQuery(openclawApi.getCurrentUserId, {});
    const encryptedToken = await encryptOpenClawToken(args.token, getEncryptionKey());
    return await ctx.runMutation(openclawInternal.createEncrypted, {
      userId,
      name: args.name,
      url: args.url,
      encryptedToken,
    });
  },
});

export const update = action({
  args: {
    id: v.id("openclawInstances"),
    name: v.optional(v.string()),
    url: v.optional(v.string()),
    token: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.runQuery(openclawApi.getCurrentUserId, {});
    const encryptedToken =
      args.token === undefined
        ? undefined
        : await encryptOpenClawToken(args.token, getEncryptionKey());

    await ctx.runMutation(openclawInternal.updateEncrypted, {
      id: args.id as Id<"openclawInstances">,
      userId,
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.url !== undefined ? { url: args.url } : {}),
      ...(encryptedToken ? { encryptedToken } : {}),
    });
  },
});
