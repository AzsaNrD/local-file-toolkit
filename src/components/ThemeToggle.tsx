"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Theme = "light" | "dark";
const STORAGE_KEY = "local-file-toolkit-theme";

export function ThemeToggle() {
  // Starts unknown: this page is statically prerendered, and the real
  // answer only exists once the bootstrap script (layout.tsx) has set the
  // `dark` class on <html> in the browser.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // Reading the DOM (set by layout.tsx's pre-hydration bootstrap script)
    // is the "read from an external system" case this lint rule allows;
    // there's no React state to derive this from on a statically
    // prerendered page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing or blocked storage: the toggle still works for
      // this page load, it just won't be remembered next time.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={toggle}
      disabled={theme === null}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? (
        <Sun aria-hidden="true" className="h-4 w-4" />
      ) : (
        <Moon aria-hidden="true" className="h-4 w-4" />
      )}
    </Button>
  );
}
