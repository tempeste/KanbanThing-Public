"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  if (!mounted) {
    return (
      <button
        type="button"
        className="border border-border p-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70 transition hover:border-muted-foreground/50 hover:text-foreground/80"
        aria-label="Toggle theme"
      >
        <Sun className="h-3 w-3" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="border border-border p-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70 transition hover:border-muted-foreground/50 hover:text-foreground/80"
      aria-label="Toggle theme"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
    </button>
  );
}
