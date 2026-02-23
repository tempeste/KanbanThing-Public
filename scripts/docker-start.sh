#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env.docker"

# ── 1. Build images and start the Convex backend ────────────────────
echo "==> Starting Convex backend..."
docker compose up convex-backend -d --build --wait

# ── 2. Generate admin key from the running backend ──────────────────
echo "==> Generating admin key..."
ADMIN_KEY=$(docker compose exec -T convex-backend /convex/generate_admin_key.sh | tail -1 | tr -d '[:space:]')
echo "    Admin key obtained."

# ── 3. Build .env.docker with self-hosted vars ──────────────────────
# Preserve BETTER_AUTH_SECRET across runs, generate if missing
if [ -f "$ENV_FILE" ] && grep -q '^BETTER_AUTH_SECRET=' "$ENV_FILE"; then
  AUTH_SECRET=$(grep '^BETTER_AUTH_SECRET=' "$ENV_FILE" | cut -d= -f2-)
  echo "==> Using existing BETTER_AUTH_SECRET"
else
  AUTH_SECRET=$(openssl rand -hex 32)
  echo "==> Generated new BETTER_AUTH_SECRET"
fi

cat > "$ENV_FILE" <<EOF
CONVEX_SELF_HOSTED_URL=http://localhost:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=$ADMIN_KEY
BETTER_AUTH_SECRET=$AUTH_SECRET
EOF

# ── 4. Deploy Convex functions ──────────────────────────────────────
echo "==> Deploying Convex functions..."
npx convex deploy --yes --env-file "$ENV_FILE"

# ── 5. Set Convex environment variables ─────────────────────────────
echo "==> Setting Convex environment variables..."
npx convex env set BETTER_AUTH_SECRET "$AUTH_SECRET" --env-file "$ENV_FILE" 2>/dev/null || true
# Detect the host's LAN IP for site URL and trusted origins
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [ -n "$HOST_IP" ]; then
  SITE_URL="http://$HOST_IP:3219"
  ORIGINS="http://localhost:3219,http://$HOST_IP:3219"
else
  SITE_URL="http://localhost:3219"
  ORIGINS="http://localhost:3219"
fi
echo "    Site URL: $SITE_URL"
echo "    Trusted origins: $ORIGINS"
npx convex env set SITE_URL "$SITE_URL" --env-file "$ENV_FILE" 2>/dev/null || true
npx convex env set TRUSTED_ORIGINS "$ORIGINS" --env-file "$ENV_FILE" 2>/dev/null || true

# ── 6. Start all remaining services ────────────────────────────────
echo "==> Starting all services..."
docker compose up -d

echo ""
echo "All services are running:"
echo "  App:       http://localhost:3219"
echo "  Dashboard: http://localhost:6791"
echo "  Convex:    http://localhost:3210"
echo ""
echo "Admin key: $ADMIN_KEY"
