"use client";

import * as React from "react";

export type HhThemeName = "neo-dark" | "auth" | "public" | "document-light";

export type HhContextName =
  | "operational"
  | "auth"
  | "public-worker-intake"
  | "document-route"
  | "viewer"
  | "paper"
  | "evidence";

type HhThemeState = {
  context: HhContextName;
  theme: HhThemeName;
};

const DEFAULT_THEME_STATE: HhThemeState = {
  context: "operational",
  theme: "neo-dark",
};

const HhThemeContext = React.createContext<HhThemeState>(DEFAULT_THEME_STATE);
const HhPortalContainerContext = React.createContext<HTMLElement | null>(null);

type ThemeBoundaryProps = HhThemeState & {
  children: React.ReactNode;
  className?: string;
};

export function HhThemeBoundary({
  children,
  className = "contents",
  context,
  theme,
}: ThemeBoundaryProps) {
  const value = React.useMemo(() => ({ context, theme }), [context, theme]);
  return (
    <HhThemeContext.Provider value={value}>
      <div className={className} data-hh-context={context} data-hh-theme={theme}>
        {children}
      </div>
    </HhThemeContext.Provider>
  );
}

export function HhRouteThemeRoot({
  children,
  className = "contents",
  context,
  theme,
}: ThemeBoundaryProps) {
  const [portalContainer, setPortalContainer] = React.useState<HTMLDivElement | null>(null);
  const value = React.useMemo(() => ({ context, theme }), [context, theme]);

  return (
    <HhThemeContext.Provider value={value}>
      <HhPortalContainerContext.Provider value={portalContainer}>
        <div className={className} data-hh-context={context} data-hh-theme={theme}>
          {children}
        </div>
        <div ref={setPortalContainer} data-hh-portal-host="true" />
      </HhPortalContainerContext.Provider>
    </HhThemeContext.Provider>
  );
}

export function useHhTheme(): HhThemeState {
  return React.useContext(HhThemeContext);
}

export function useHhPortalContainer(): HTMLElement | null {
  return React.useContext(HhPortalContainerContext);
}
