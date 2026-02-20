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
  const retrying = useRef(false);
  const [showError, setShowError] = useState(false);

  const isAuthError =
    error.message?.includes("auth") ||
    error.message?.includes("token") ||
    error.message?.includes("Not authenticated");

  useEffect(() => {
    console.error("Workspace error:", error);

    // Auto-retry once — the TokenRefresher likely already refreshed auth
    if (!retrying.current) {
      retrying.current = true;
      const timer = setTimeout(() => {
        setShowError(true);
        reset();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [error, reset]);

  // Only shown if auto-retry didn't work
  if (!showError) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="max-w-md text-center px-6">
        <h2 className="text-xl font-semibold mb-2">
          {isAuthError ? "Session expired" : "Something went wrong"}
        </h2>
        <p className="text-muted-foreground text-sm mb-6">
          {isAuthError
            ? "Your session has expired. Please sign in again."
            : "This usually happens when the connection drops after being idle."}
        </p>
        <div className="flex gap-3 justify-center">
          {isAuthError ? (
            <button
              onClick={() => router.push("/login")}
              className="px-5 py-2.5 rounded-lg border border-border bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Sign in
            </button>
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
