import { createClient, type GenericCtx, type CreateAuth } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { betterAuth, APIError } from "better-auth";
import authConfig from "./auth.config";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);

  const allowedGithubUsers = (process.env.ALLOWED_GITHUB_USERS ?? "")
    .split(",")
    .map((u: string) => u.trim().toLowerCase())
    .filter(Boolean);

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
            // If no whitelist configured, allow all
            if (allowedEmails.length === 0 && allowedGithubUsers.length === 0) {
              return { data: user };
            }

            // Check email whitelist
            if (user.email && allowedEmails.includes(user.email.toLowerCase())) {
              return { data: user };
            }

            // For email/password signups without whitelist match
            throw new APIError("FORBIDDEN", {
              message: "Registration is restricted. Contact the site owner.",
            });
          },
        },
      },
      account: {
        create: {
          before: async (account) => {
            // Skip whitelist check if no lists configured
            if (allowedEmails.length === 0 && allowedGithubUsers.length === 0) {
              return { data: account };
            }

            // Check GitHub username whitelist for GitHub OAuth
            if (account.providerId === "github" && account.accountId) {
              // accountId for GitHub is the username
              const githubUsername = account.accountId.toLowerCase();
              if (allowedGithubUsers.includes(githubUsername)) {
                return { data: account };
              }
            }

            // For Google OAuth, the user hook will check email
            if (account.providerId === "google") {
              return { data: account };
            }

            // Note: For OAuth, the user.create.before hook runs first,
            // which checks email whitelist for all providers
            return { data: account };
          },
        },
      },
    },
    plugins: [convex({ authConfig })],
  });
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});
