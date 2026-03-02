"use client";

import { useEffect, useRef, useState } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const retrying = useRef(false);
  const [showError, setShowError] = useState(false);

  const normalizedMessage = (error.message ?? "").toLowerCase();
  const isAuthError =
    normalizedMessage.includes("auth") ||
    normalizedMessage.includes("token") ||
    normalizedMessage.includes("unauthenticated") ||
    normalizedMessage.includes("not authenticated") ||
    normalizedMessage.includes("unauthorized");

  useEffect(() => {
    console.error("Unhandled error:", error);

    if (isAuthError) {
      // Give TokenRefresher ~2s to silently fix the token, then try ONE
      // reset(). If that also fails we land back here with retrying=true
      // and show the error UI — no further retries, no query storm.
      if (!retrying.current) {
        retrying.current = true;
        const timer = setTimeout(() => reset(), 2000);
        return () => clearTimeout(timer);
      }
      setShowError(true);
      return;
    }

    // Non-auth transient errors: retry once quickly.
    if (!retrying.current) {
      retrying.current = true;
      const timer = setTimeout(() => {
        setShowError(true);
        reset();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [error, reset, isAuthError]);

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
            ? "This can happen after the computer sleeps. A reload usually fixes it."
            : "This usually happens when the connection drops after being idle."}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2.5 rounded-lg border border-border bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Reload page
          </button>
          {!isAuthError && (
            <button
              onClick={() => reset()}
              className="px-5 py-2.5 rounded-lg border border-border bg-muted text-muted-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
