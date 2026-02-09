# Better Auth Setup Guide

This project has Better Auth integrated but needs environment variables configured before it will work.

## Prerequisites

- Google Cloud Console project (for Google OAuth)
- GitHub OAuth App (for GitHub OAuth)
- Your Convex deployment URL

## Step 1: Get OAuth Credentials

### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project or select existing
3. Go to APIs & Services > Credentials
4. Create OAuth 2.0 Client ID (Web application)
5. Add authorized redirect URI: `https://<your-convex>.convex.site/api/auth/callback/google`
6. Copy Client ID and Client Secret

### GitHub OAuth
1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create new OAuth App
3. Set Authorization callback URL: `https://<your-convex>.convex.site/api/auth/callback/github`
4. Copy Client ID and Client Secret

## Step 2: Set Local Environment Variables

Create/update `.env.local`:

```bash
# Convex (you should already have NEXT_PUBLIC_CONVEX_URL)
NEXT_PUBLIC_CONVEX_SITE_URL=https://<your-deployment>.convex.site

# For local dev
SITE_URL=http://localhost:3000
```

## Step 3: Set Convex Environment Variables

Run these commands (replace placeholders with your actual values):

```bash
# Generate a secret
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"

# Site URL (change for production)
npx convex env set SITE_URL "http://localhost:3000"

# Google OAuth
npx convex env set GOOGLE_CLIENT_ID "your-google-client-id"
npx convex env set GOOGLE_CLIENT_SECRET "your-google-client-secret"

# GitHub OAuth
npx convex env set GITHUB_CLIENT_ID "your-github-client-id"
npx convex env set GITHUB_CLIENT_SECRET "your-github-client-secret"

# Whitelist (comma-separated, leave empty to allow all)
npx convex env set ALLOWED_EMAILS "your@email.com,another@email.com"
```

## Step 4: Deploy Convex

```bash
npx convex dev
```

This will push the schema changes and auth component to Convex.

## Step 5: Test

```bash
npm run dev
```

Visit `http://localhost:3000` - you should see a login prompt.

## How It Works

- **Web UI Auth**: Users sign in via Better Auth (Google/GitHub/email)
- **Agent Auth**: Existing API keys still work for `/api/*` routes
- **Whitelist**: Only emails in `ALLOWED_EMAILS` can register (leave empty to allow all)
- **Account Linking**: Users can link multiple providers to one account
- **Workspace Membership**: Workspaces have owner/admin/member roles

## Files Added/Modified

### Modified Files
- `convex/schema.ts` - Added workspaceMembers table
- `convex/workspaces.ts` - Auth-aware workspace functions
- `app/layout.tsx` - Uses auth provider
- `app/page.tsx` - Auth-aware home
- `app/workspace/[id]/settings/page.tsx` - Member management UI

## Troubleshooting

### "CONVEX_SITE_URL is not set"
Add `NEXT_PUBLIC_CONVEX_SITE_URL` to your `.env.local`

### OAuth callback errors
Make sure your callback URLs in Google/GitHub match your Convex site URL exactly.

### "Registration is restricted"
Add your email to `ALLOWED_EMAILS`, or set it to empty to allow all.
