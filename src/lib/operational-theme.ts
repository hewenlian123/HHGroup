export const HH_OPERATIONAL_THEME_STORAGE_KEY = "hh-theme";

export type OperationalThemeMode = "dark" | "light";
export type OperationalThemeName = "operational-dark" | "operational-light";

export const DEFAULT_OPERATIONAL_THEME_MODE: OperationalThemeMode = "dark";

export function operationalThemeName(mode: OperationalThemeMode): OperationalThemeName {
  return mode === "light" ? "operational-light" : "operational-dark";
}

export function readOperationalThemeMode(): OperationalThemeMode {
  if (typeof window === "undefined") return DEFAULT_OPERATIONAL_THEME_MODE;

  try {
    const appliedTheme = document.documentElement.dataset.hhTheme;
    if (appliedTheme === "operational-light") return "light";
    if (appliedTheme === "operational-dark") return "dark";

    const storedTheme = window.localStorage.getItem(HH_OPERATIONAL_THEME_STORAGE_KEY);
    return storedTheme === "light" || storedTheme === "operational-light" ? "light" : "dark";
  } catch {
    return DEFAULT_OPERATIONAL_THEME_MODE;
  }
}

export function applyOperationalThemeMode(mode: OperationalThemeMode): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const theme = operationalThemeName(mode);
  root.dataset.hhTheme = theme;
  root.classList.toggle("dark", mode === "dark");
  root.classList.toggle("light", mode === "light");
  root.style.colorScheme = mode;

  try {
    window.localStorage.setItem(HH_OPERATIONAL_THEME_STORAGE_KEY, mode);
  } catch {
    // Theme still applies for this session when storage is unavailable.
  }
}

/**
 * Runs before hydration so the authenticated shell never paints in the wrong
 * operational theme. Explicit auth, public, viewer, paper, and document-light
 * boundaries continue to override this root bootstrap scope.
 */
export const OPERATIONAL_THEME_BOOTSTRAP_SCRIPT = `(function(){try{var s=window.localStorage.getItem("${HH_OPERATIONAL_THEME_STORAGE_KEY}");var m=s==="light"||s==="operational-light"?"light":"dark";var r=document.documentElement;r.dataset.hhTheme=m==="light"?"operational-light":"operational-dark";r.classList.toggle("dark",m==="dark");r.classList.toggle("light",m==="light");r.style.colorScheme=m;}catch(_){var r=document.documentElement;r.dataset.hhTheme="operational-dark";r.classList.add("dark");r.classList.remove("light");r.style.colorScheme="dark";}})();`;
