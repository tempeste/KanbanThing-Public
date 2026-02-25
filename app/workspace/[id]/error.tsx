"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const retryCount = useRef(0);
  const [showError, setShowError] = useState(false);
  const normalizedMessage = (error.message ?? "").toLowerCase();

  const isAuthError =
    normalizedMessage.includes("auth") ||
    normalizedMessage.includes("token") ||
    normalizedMessage.includes("unauthenticated") ||
    normalizedMessage.includes("not authenticated") ||
    normalizedMessage.includes("unauthorized");

  useEffect(() => {
    console.error("Workspace error:", error);

    // Auth/workspace errors after sleep are often transient (stale socket/token until refresh).
    // Retry a couple of times before showing the fallback UI.
    if (retryCount.current < 2) {
      retryCount.current += 1;
      const timer = setTimeout(
        () => {
          setShowError(true);
          reset();
        },
        isAuthError ? 900 : 500
      );
      return () => clearTimeout(timer);
    }
    setShowError(true);
  }, [error, reset]);

  // Only shown if auto-retry didn't work
  if (!showError) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="max-w-md text-center px-6">
        <h2 className="text-xl font-semibold mb-2">
          {isAuthError ? "Connection/session hiccup" : "Something went wrong"}
        </h2>
        <p className="text-muted-foreground text-sm mb-6">
          {isAuthError
            ? "This can happen after the computer sleeps. Refresh usually fixes it; sign in again only if refresh does not work."
            : "This usually happens when the connection drops after being idle."}
        </p>
        <div className="flex gap-3 justify-center">
          {isAuthError ? (
            <>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-lg border border-border bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Reload page
              </button>
              <button
                onClick={() => router.push("/login")}
                className="px-5 py-2.5 rounded-lg border border-border bg-muted text-muted-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => reset()}
                className="px-5 py-2.5 rounded-lg border border-border bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-lg border border-border bg-muted text-muted-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Reload page
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
