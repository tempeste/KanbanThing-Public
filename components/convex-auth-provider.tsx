"use client";

import { type PropsWithChildren, useEffect, useRef } from "react";
import { ConvexReactClient, useMutation } from "convex/react";
import { authClient, useSession } from "@/lib/auth-client";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { api } from "@/convex/_generated/api";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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
}: PropsWithChildren<{ initialToken?: string | null }>) {
  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient}
      initialToken={initialToken}
    >
      <ProfileSyncer />
      {children}
    </ConvexBetterAuthProvider>
  );
}
