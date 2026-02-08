import { createClient, type GenericCtx, type CreateAuth } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { betterAuth, APIError } from "better-auth";
import { createAuthEndpoint, sensitiveSessionMiddleware } from "better-auth/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import authConfig from "./auth.config";
import * as z from "zod";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);

  const setPasswordEndpoint = createAuthEndpoint(
    "/set-password",
    {
      method: "POST",
      body: z.object({
        newPassword: z.string().meta({ description: "The new password to set is required" }),
      }),
      use: [sensitiveSessionMiddleware],
    },
    async (ctx) => {
      const { newPassword } = ctx.body;
      const session = ctx.context.session;

      const minPasswordLength = ctx.context.password.config.minPasswordLength;
      if (newPassword.length < minPasswordLength) {
        ctx.context.logger.error("Password is too short");
        throw new APIError("BAD_REQUEST", { message: BASE_ERROR_CODES.PASSWORD_TOO_SHORT });
      }

      const maxPasswordLength = ctx.context.password.config.maxPasswordLength;
      if (newPassword.length > maxPasswordLength) {
        ctx.context.logger.error("Password is too long");
        throw new APIError("BAD_REQUEST", { message: BASE_ERROR_CODES.PASSWORD_TOO_LONG });
      }

      const account = (await ctx.context.internalAdapter.findAccounts(session.user.id)).find(
        (account) => account.providerId === "credential" && account.password
      );
      if (account) {
        throw new APIError("BAD_REQUEST", { message: "user already has a password" });
      }

      const passwordHash = await ctx.context.password.hash(newPassword);
      await ctx.context.internalAdapter.linkAccount({
        userId: session.user.id,
        providerId: "credential",
        accountId: session.user.id,
        password: passwordHash,
      });

      return ctx.json({ status: true });
    }
  );

  return betterAuth({
    baseURL: process.env.SITE_URL!,
    database: authComponent.adapter(ctx),
    secret: process.env.BETTER_AUTH_SECRET!,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google", "github"],
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            // If no email whitelist configured, allow all.
            if (allowedEmails.length === 0) {
              return { data: user };
            }

            // Check email whitelist
            if (user.email && allowedEmails.includes(user.email.toLowerCase())) {
              return { data: user };
            }

            // For signups without whitelist match
            throw new APIError("FORBIDDEN", {
              message: "Registration is restricted. Contact the site owner.",
            });
          },
        },
      },
    },
    plugins: [
      {
        id: "set-password-endpoint",
        endpoints: { setPassword: setPasswordEndpoint },
      },
      convex({ authConfig }),
    ],
  });
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});
