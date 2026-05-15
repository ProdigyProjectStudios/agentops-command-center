import { useEffect, useState } from "react";

const STORAGE_KEY = "agentops:sidebar-collapsed";
const NARROW_QUERY = "(max-width: 1023px)";

function readStored(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === null) return true;
    return value === "1";
  } catch {
    return true;
  }
}

/**
 * Sidebar collapsed state with responsive auto-collapse.
 *
 * - On viewports narrower than 1024px the sidebar is forced collapsed
 *   regardless of the stored preference (and toggling is a no-op).
 * - On wider viewports the user's stored preference applies (default: collapsed
 *   on first load, so the cockpit feels clean — labels show as tooltips on
 *   hover; user can expand and the preference persists).
 * - Manual toggles only persist when the user is on a wide viewport, so a
 *   resize back to desktop restores their chosen state.
 */
export function useSidebarCollapsed(): [boolean, (next: boolean) => void] {
  const [stored, setStored] = useState<boolean>(readStored);
  const [isNarrow, setIsNarrow] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(NARROW_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(NARROW_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, stored ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [stored]);

  const collapsed = isNarrow ? true : stored;
  const setCollapsed = (next: boolean) => {
    if (isNarrow) return;
    setStored(next);
  };

  return [collapsed, setCollapsed];
}
