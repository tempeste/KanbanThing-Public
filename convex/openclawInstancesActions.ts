"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { encryptOpenClawToken } from "../lib/openclaw-crypto";
import { getOpenClawInstanceUrlValidationError } from "../lib/openclaw-instance-validation";

const getEncryptionKey = () => {
  const key = process.env.OPENCLAW_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("OPENCLAW_ENCRYPTION_KEY is not configured");
  }
  return key;
};

const generateOpenClawBearerToken = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = "oc_";
  for (let i = 0; i < 40; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
};

const withPluginPath = (rawUrl: string, path: string) => {
  const normalized = rawUrl.endsWith("/") ? rawUrl.slice(0, -1) : rawUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalized}${normalizedPath}`;
};

const verifyOpenClawBearerToken = async (args: { url: string; token: string }) => {
  const urlError = getOpenClawInstanceUrlValidationError(args.url);
  if (urlError) throw new Error(urlError);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(withPluginPath(args.url, "/kanbanthing/capabilities"), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${args.token}`,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      const error = new Error(
        (json?.error as string | undefined) ??
          (json?.message as string | undefined) ??
          `Verification failed (${response.status})`
      ) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
};

export const create = action({
  args: {
    name: v.string(),
    url: v.string(),
    token: v.string(),
    integrationMode: v.optional(v.union(v.literal("basic"), v.literal("enhanced"))),
  },
  handler: async (ctx, args): Promise<Id<"openclawInstances">> => {
    const userId: string = await ctx.runQuery(internal.openclawInstances.getCurrentUserId, {});
    const encryptedToken = await encryptOpenClawToken(args.token, getEncryptionKey());
    const allowLocal = !!process.env.ALLOW_LOCAL_OPENCLAW;
    return await ctx.runMutation(internal.openclawInstances.createEncrypted, {
      userId,
      name: args.name,
      url: args.url,
      encryptedToken,
      ...(args.integrationMode ? { integrationMode: args.integrationMode } : {}),
      allowLocal,
    });
  },
});

export const update = action({
  args: {
    id: v.id("openclawInstances"),
    name: v.optional(v.string()),
    url: v.optional(v.string()),
    token: v.optional(v.string()),
    integrationMode: v.optional(v.union(v.literal("basic"), v.literal("enhanced"))),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.runQuery(internal.openclawInstances.getCurrentUserId, {});
    const encryptedToken =
      args.token === undefined
        ? undefined
        : await encryptOpenClawToken(args.token, getEncryptionKey());

    const allowLocal = !!process.env.ALLOW_LOCAL_OPENCLAW;
    await ctx.runMutation(internal.openclawInstances.updateEncrypted, {
      id: args.id as Id<"openclawInstances">,
      userId,
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.url !== undefined ? { url: args.url } : {}),
      ...(encryptedToken ? { encryptedToken } : {}),
      ...(args.integrationMode !== undefined ? { integrationMode: args.integrationMode } : {}),
      allowLocal,
    });
  },
});

export const regenerateToken = action({
  args: {
    id: v.id("openclawInstances"),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.runQuery(internal.openclawInstances.getCurrentUserId, {});
    const token = generateOpenClawBearerToken();
    const encryptedToken = await encryptOpenClawToken(token, getEncryptionKey());

    await ctx.runMutation(internal.openclawInstances.markTokenRotationPending, {
      id: args.id as Id<"openclawInstances">,
      userId,
      encryptedToken,
    });

    return { token };
  },
});

export const verify = action({
  args: {
    id: v.id("openclawInstances"),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.runQuery(internal.openclawInstances.getCurrentUserId, {});
    const instance = await ctx.runQuery(internal.openclawInstances.getOwnedEncryptedForDispatch, {
      id: args.id as Id<"openclawInstances">,
      userId,
    });
    if (!instance) {
      throw new Error("OpenClaw instance not found");
    }

    try {
      const { decryptOpenClawToken } = await import("../lib/openclaw-crypto");
      const token = await decryptOpenClawToken(instance.encryptedToken, getEncryptionKey());
      const isEnhanced = (instance.integrationMode ?? "basic") === "enhanced";
      let capabilities: Record<string, unknown> | null = null;
      try {
        capabilities = await verifyOpenClawBearerToken({
          url: instance.url,
          token,
        });
      } catch (error) {
        const status =
          typeof (error as { status?: unknown })?.status === "number"
            ? ((error as { status?: number }).status ?? null)
            : null;
        if (!(status === 404 && !isEnhanced)) {
          throw error;
        }
      }
      await ctx.runMutation(internal.openclawInstances.markTokenHealthy, {
        id: args.id as Id<"openclawInstances">,
        userId,
      });
      return {
        ok: true,
        capabilities,
        pluginInstalled: capabilities !== null,
        verificationMode: isEnhanced ? "plugin" : "basic",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Token verification failed";
      await ctx.runMutation(internal.openclawInstances.markTokenVerifyFailed, {
        id: args.id as Id<"openclawInstances">,
        userId,
        error: message,
      });
      throw new Error(message);
    }
  },
});
