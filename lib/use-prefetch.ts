"use client";

import { useRouter } from "next/navigation";
import { useRef, useCallback } from "react";

/**
 * Hover-prefetch with dedup. Call the returned function on mouseEnter/focus
 * to trigger router.prefetch() for the given href, skipping duplicates.
 */
export function usePrefetch() {
  const router = useRouter();
  const seen = useRef(new Set<string>());

  return useCallback(
    (href: string) => {
      if (seen.current.has(href)) return;
      seen.current.add(href);
      router.prefetch(href);
    },
    [router]
  );
}
