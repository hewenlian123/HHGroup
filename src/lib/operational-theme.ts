export const HH_OPERATIONAL_THEME_STORAGE_KEY = "hh-theme";

export type OperationalThemeMode = "dark" | "light";
export type OperationalThemeName = "operational-dark" | "operational-light";

export const DEFAULT_OPERATIONAL_THEME_MODE: OperationalThemeMode = "light";

export function operationalThemeName(mode: OperationalThemeMode): OperationalThemeName {
  void mode;
  return "operational-light";
}

export function readOperationalThemeMode(): OperationalThemeMode {
  return DEFAULT_OPERATIONAL_THEME_MODE;
}

export function applyOperationalThemeMode(mode: OperationalThemeMode): void {
  void mode;
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.dataset.hhTheme = "operational-light";
  root.classList.remove("dark");
  root.classList.add("light");
  root.style.colorScheme = "light";

  try {
    window.localStorage.setItem(HH_OPERATIONAL_THEME_STORAGE_KEY, "light");
  } catch {
    // Theme still applies for this session when storage is unavailable.
  }
}

/**
 * Runs before hydration so the authenticated shell never paints in the wrong
 * operational theme. Explicit auth, public, viewer, paper, and document-light
 * boundaries continue to override this root bootstrap scope.
 */
export const OPERATIONAL_THEME_BOOTSTRAP_SCRIPT = `(function(){var r=document.documentElement;r.dataset.hhTheme="operational-light";r.classList.remove("dark");r.classList.add("light");r.style.colorScheme="light";try{window.localStorage.setItem("${HH_OPERATIONAL_THEME_STORAGE_KEY}","light");}catch(_){}})();`;
