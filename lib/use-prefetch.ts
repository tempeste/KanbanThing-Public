"use client";

import { useRouter } from "next/navigation";
import { useConvex } from "convex/react";
import { useRef, useCallback } from "react";
import type { FunctionReference, FunctionArgs } from "convex/server";

type PrewarmSpec = {
  query: FunctionReference<"query">;
  args: Record<string, unknown>;
};

/** Keep prewarmed subscriptions alive long enough for the user to click. */
const PREWARM_TTL_MS = 30_000;

/**
 * Prefetch route bundles AND Convex query data on hover.
 * Deduplicates by href so each target is only warmed once.
 */
export function usePrefetch() {
  const router = useRouter();
  const convex = useConvex();
  const seen = useRef(new Set<string>());

  return useCallback(
    (href: string, prewarms?: PrewarmSpec[]) => {
      if (seen.current.has(href)) return;
      seen.current.add(href);
      router.prefetch(href);
      if (prewarms) {
        for (const spec of prewarms) {
          convex.prewarmQuery({
            query: spec.query,
            args: spec.args as FunctionArgs<typeof spec.query>,
            extendSubscriptionFor: PREWARM_TTL_MS,
          });
        }
      }
    },
    [router, convex]
  );
}
