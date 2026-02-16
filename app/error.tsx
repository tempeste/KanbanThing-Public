"use client";

import { useEffect, useRef } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const retryCount = useRef(0);

  useEffect(() => {
    console.error("Unhandled error:", error);

    // Auto-retry once — the TokenRefresher likely already refreshed auth,
    // so a quick reset is usually enough to recover silently.
    if (retryCount.current < 1) {
      retryCount.current++;
      const timer = setTimeout(() => reset(), 500);
      return () => clearTimeout(timer);
    }
  }, [error, reset]);

  // Only shown if auto-retry didn't work
  if (retryCount.current < 1) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="max-w-md text-center px-6">
        <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
        <p className="text-muted-foreground text-sm mb-6">
          This usually happens when the session expires after being idle.
        </p>
        <div className="flex gap-3 justify-center">
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
        </div>
      </div>
    </div>
  );
}
