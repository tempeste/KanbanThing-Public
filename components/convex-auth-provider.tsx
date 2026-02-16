"use client";

import { type PropsWithChildren, useEffect, useRef, useCallback } from "react";
import { ConvexReactClient, useMutation } from "convex/react";
import { authClient, useSession } from "@/lib/auth-client";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { api } from "@/convex/_generated/api";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Proactively refreshes the Convex auth token when the browser tab
 * regains visibility after being backgrounded (e.g. user was AFK).
 * This prevents stale-token errors that crash the React tree.
 */
function TokenRefresher() {
  const lastHidden = useRef<number>(0);

  const refreshToken = useCallback(async () => {
    try {
      const { data } = await authClient.convex.token();
      if (data?.token) {
        convex.setAuth(async () => data.token);
      }
    } catch {
      // Session may be fully expired — auth provider will handle redirect
    }
  }, []);

  useEffect(() => {
    const onHidden = () => {
      lastHidden.current = Date.now();
    };

    const onVisible = () => {
      // Refresh if tab was hidden for >10s (token may be stale)
      const elapsed = Date.now() - lastHidden.current;
      if (lastHidden.current > 0 && elapsed > 10_000) {
        refreshToken();
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) onHidden();
      else onVisible();
    };

    // "focus" fires before WebSocket reconnect in most browsers,
    // giving us a chance to refresh the token before queries replay.
    const onFocus = () => onVisible();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshToken]);

  return null;
}

function ProfileSyncer() {
  const { data: session } = useSession();
  const syncProfile = useMutation(api.userProfiles.syncFromAuth);
  const lastSyncedSignature = useRef<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;

    const signature = [
      session.user.id,
      session.user.email,
      session.user.name ?? "",
      session.user.image ?? "",
    ].join("|");

    if (signature === lastSyncedSignature.current) return;
    lastSyncedSignature.current = signature;

    syncProfile({
      betterAuthUserId: session.user.id,
      email: session.user.email,
      name: session.user.name ?? undefined,
      image: session.user.image ?? undefined,
    }).catch(console.error);
  }, [session?.user?.id, session?.user?.email, session?.user?.name, session?.user?.image, syncProfile]);

  return null;
}

export function ConvexAuthProvider({
  children,
  initialToken,
  disableProfileSync = false,
}: PropsWithChildren<{ initialToken?: string | null; disableProfileSync?: boolean }>) {
  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient}
      initialToken={initialToken}
    >
      <TokenRefresher />
      {!disableProfileSync && <ProfileSyncer />}
      {children}
    </ConvexBetterAuthProvider>
  );
}
