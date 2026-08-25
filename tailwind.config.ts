import type { Config } from "tailwindcss";

const explicitLightThemeBoundary =
  ':where([data-hh-theme="operational-light"], [data-hh-theme="operational-light"] *, [data-hh-theme="auth"], [data-hh-theme="auth"] *, [data-hh-theme="public"], [data-hh-theme="public"] *, [data-hh-theme="document-light"], [data-hh-theme="document-light"] *)';

const config: Config = {
  // The nearest explicit light boundary wins, even when it is nested below the
  // operational neo-dark shell. This keeps legacy `dark:*` utilities out of
  // auth, public intake, paper, and evidence surfaces at every viewport size.
  darkMode: [
    "variant",
    `&:where([data-hh-theme="operational-dark"], [data-hh-theme="operational-dark"] *, [data-hh-theme="neo-dark"], [data-hh-theme="neo-dark"] *):not(${explicitLightThemeBoundary})`,
  ],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        /* mobile <640px (default), tablet 640–1024px (sm/md), desktop >1024px (lg) */
        mobile: { max: "639px" },
        tablet: { min: "640px", max: "1023px" },
        desktop: "1024px",
      },
      minHeight: {
        touch: "var(--hh-touch-min)",
        "hh-touch": "var(--hh-touch-min)",
        "hh-row-touch": "var(--hh-row-min-height-touch)",
      },
      minWidth: {
        "hh-touch": "var(--hh-touch-min)",
      },
      height: {
        "hh-control-compact": "var(--hh-control-height-compact)",
        "hh-control-standard": "var(--hh-control-height-standard)",
        "hh-control-comfortable": "var(--hh-control-height-comfortable)",
        "hh-control-touch": "var(--hh-control-height-touch)",
        "hh-row-dense": "var(--hh-row-height-dense)",
        "hh-row-standard": "var(--hh-row-height-standard)",
        "hh-row-touch": "var(--hh-row-min-height-touch)",
        "hh-topbar-mobile": "var(--hh-topbar-height-mobile)",
        "hh-topbar-desktop": "var(--hh-topbar-height-desktop)",
      },
      spacing: {
        "hh-1": "var(--hh-space-1)",
        "hh-2": "var(--hh-space-2)",
        "hh-3": "var(--hh-space-3)",
        "hh-4": "var(--hh-space-4)",
        "hh-5": "var(--hh-space-5)",
        "hh-6": "var(--hh-space-6)",
        "hh-8": "var(--hh-space-8)",
        "hh-10": "var(--hh-space-10)",
        "hh-12": "var(--hh-space-12)",
        "hh-16": "var(--hh-space-16)",
        "hh-panel-compact": "var(--hh-panel-padding-compact)",
        "hh-panel-standard": "var(--hh-panel-padding-standard)",
        "hh-task-mobile": "var(--hh-task-padding-mobile)",
        "hh-task-desktop": "var(--hh-task-padding-desktop)",
        "hh-page-mobile": "var(--hh-page-gutter-mobile)",
        "hh-page-tablet": "var(--hh-page-gutter-tablet)",
        "hh-page-desktop": "var(--hh-page-gutter-desktop)",
        "hh-page-wide": "var(--hh-page-gutter-wide)",
        "hh-gap-related": "var(--hh-gap-related)",
        "hh-gap-section": "var(--hh-gap-section)",
        "hh-gap-region": "var(--hh-gap-region)",
        "hh-table-cell-inline": "var(--hh-table-cell-padding-inline)",
        "hh-table-cell-block": "var(--hh-table-cell-padding-block)",
        "hh-sidebar-inset": "var(--hh-sidebar-inset)",
        "hh-content-start-desktop": "var(--hh-content-start-desktop)",
      },
      colors: {
        /** Semantic UI tokens — single source of truth. */
        canvas: "var(--hh-l0-canvas)",
        workspace: "var(--hh-l1-workspace)",
        surface: "var(--hh-l2-operational-surface)",
        page: "var(--hh-l0-canvas)",
        text: {
          primary: "#0F172A",
          secondary: "#71717A",
        },
        neo: {
          surface: {
            canvas: "var(--hh-l0-canvas)",
            base: "var(--hh-l1-workspace)",
            raised: "var(--hh-l2-operational-surface)",
            muted: "var(--hh-l2-operational-surface)",
            hover: "var(--hh-l3-hover)",
            selected: "var(--hh-l3-selected)",
            pressed: "var(--hh-l3-pressed)",
            floating: "var(--hh-l4-floating-surface)",
            task: "var(--hh-l5-task-surface)",
          },
        },
        /** HH Group Design System v1 semantic tokens plus retained compatibility names */
        hh: {
          page: "var(--hh-l0-canvas)",
          canvas: "var(--hh-l0-canvas)",
          workspace: "var(--hh-l1-workspace)",
          surface: "var(--hh-l2-operational-surface)",
          hover: "var(--hh-l3-hover)",
          selected: "var(--hh-l3-selected)",
          pressed: "var(--hh-l3-pressed)",
          floating: "var(--hh-l4-floating-surface)",
          task: "var(--hh-l5-task-surface)",
          ink: "var(--hh-text-primary)",
          muted: "var(--hh-text-secondary)",
          "text-strong": "var(--hh-text-strong)",
          "text-primary": "var(--hh-text-primary)",
          "text-secondary": "var(--hh-text-secondary)",
          "text-tertiary": "var(--hh-text-tertiary)",
          "text-dim": "var(--hh-text-dim)",
          "border-subtle": "var(--hh-border-subtle)",
          border: "var(--hh-border)",
          "border-floating": "var(--hh-border-floating)",
          "border-strong": "var(--hh-border-strong)",
          "row-hover": "var(--hh-l3-hover)",
          primary: "var(--hh-action-primary)",
          "primary-foreground": "var(--hh-action-primary-foreground)",
          "focus-ring": "var(--hh-focus-ring)",
          ring: "var(--hh-ring)",
          gold: "var(--hh-gold)",
          "gold-hover": "var(--hh-gold-hover)",
          "gold-muted": "var(--hh-gold-muted)",
          "gold-border": "var(--hh-gold-border)",
          emerald: "var(--hh-emerald)",
          "emerald-hover": "var(--hh-emerald-hover)",
          "emerald-muted": "var(--hh-emerald-muted)",
          "emerald-border": "var(--hh-emerald-border)",
          input: "var(--hh-input)",
          "input-background": "var(--hh-input-background)",
          link: "#059669",
          success: "var(--hh-success)",
          "success-soft-fill": "var(--hh-success-soft-fill)",
          "success-border": "var(--hh-success-border)",
          warning: "var(--hh-warning)",
          "warning-soft-fill": "var(--hh-warning-soft-fill)",
          "warning-border": "var(--hh-warning-border)",
          information: "var(--hh-information)",
          "information-soft-fill": "var(--hh-information-soft-fill)",
          "information-border": "var(--hh-information-border)",
          danger: "var(--hh-danger)",
          "danger-soft-fill": "var(--hh-danger-soft-fill)",
          "danger-border": "var(--hh-danger-border)",
          "secondary-border": "#D1D5DB",
          "secondary-text": "#374151",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "hh-compact": "var(--hh-radius-compact)",
        "hh-standard": "var(--hh-radius-standard)",
        "hh-panel": "var(--hh-radius-panel)",
        "hh-task": "var(--hh-radius-task)",
      },
      width: {
        "hh-sidebar-expanded": "var(--hh-sidebar-width-expanded)",
        "hh-sidebar-collapsed": "var(--hh-sidebar-width-collapsed)",
      },
      maxWidth: {
        "hh-content": "var(--hh-content-width-max)",
        "hh-content-narrow": "var(--hh-content-width-narrow)",
        "hh-document": "var(--hh-content-width-document)",
      },
      fontFamily: {
        sans: ["var(--hh-font-family-sans)"],
      },
      fontSize: {
        "hh-page-title": [
          "var(--hh-type-page-title-font-size)",
          {
            lineHeight: "var(--hh-type-page-title-line-height)",
            fontWeight: "var(--hh-type-page-title-font-weight)",
            letterSpacing: "var(--hh-type-page-title-letter-spacing)",
          },
        ],
        "hh-section-title": [
          "var(--hh-type-section-title-font-size)",
          {
            lineHeight: "var(--hh-type-section-title-line-height)",
            fontWeight: "var(--hh-type-section-title-font-weight)",
            letterSpacing: "var(--hh-type-section-title-letter-spacing)",
          },
        ],
        "hh-panel-title": [
          "var(--hh-type-panel-title-font-size)",
          {
            lineHeight: "var(--hh-type-panel-title-line-height)",
            fontWeight: "var(--hh-type-panel-title-font-weight)",
            letterSpacing: "var(--hh-type-panel-title-letter-spacing)",
          },
        ],
        "hh-body": [
          "var(--hh-type-body-font-size)",
          {
            lineHeight: "var(--hh-type-body-line-height)",
            fontWeight: "var(--hh-type-body-font-weight)",
            letterSpacing: "var(--hh-type-body-letter-spacing)",
          },
        ],
        "hh-body-strong": [
          "var(--hh-type-body-strong-font-size)",
          {
            lineHeight: "var(--hh-type-body-strong-line-height)",
            fontWeight: "var(--hh-type-body-strong-font-weight)",
            letterSpacing: "var(--hh-type-body-strong-letter-spacing)",
          },
        ],
        "hh-label": [
          "var(--hh-type-label-font-size)",
          {
            lineHeight: "var(--hh-type-label-line-height)",
            fontWeight: "var(--hh-type-label-font-weight)",
            letterSpacing: "var(--hh-type-label-letter-spacing)",
          },
        ],
        "hh-metadata": [
          "var(--hh-type-metadata-font-size)",
          {
            lineHeight: "var(--hh-type-metadata-line-height)",
            fontWeight: "var(--hh-type-metadata-font-weight)",
            letterSpacing: "var(--hh-type-metadata-letter-spacing)",
          },
        ],
        "hh-table-header": [
          "var(--hh-type-table-header-font-size)",
          {
            lineHeight: "var(--hh-type-table-header-line-height)",
            fontWeight: "var(--hh-type-table-header-font-weight)",
            letterSpacing: "var(--hh-type-table-header-letter-spacing)",
          },
        ],
        "hh-table-cell": [
          "var(--hh-type-table-cell-font-size)",
          {
            lineHeight: "var(--hh-type-table-cell-line-height)",
            fontWeight: "var(--hh-type-table-cell-font-weight)",
            letterSpacing: "var(--hh-type-table-cell-letter-spacing)",
          },
        ],
        "hh-financial": [
          "var(--hh-type-financial-font-size)",
          {
            lineHeight: "var(--hh-type-financial-line-height)",
            fontWeight: "var(--hh-type-financial-font-weight)",
            letterSpacing: "var(--hh-type-financial-letter-spacing)",
          },
        ],
        "hh-financial-total": [
          "var(--hh-type-financial-total-font-size)",
          {
            lineHeight: "var(--hh-type-financial-total-line-height)",
            fontWeight: "var(--hh-type-financial-total-font-weight)",
            letterSpacing: "var(--hh-type-financial-total-letter-spacing)",
          },
        ],
        "hh-control": [
          "var(--hh-type-control-font-size)",
          {
            lineHeight: "var(--hh-type-control-line-height)",
            fontWeight: "var(--hh-type-control-font-weight)",
            letterSpacing: "var(--hh-type-control-letter-spacing)",
          },
        ],
        "hh-helper": [
          "var(--hh-type-helper-font-size)",
          {
            lineHeight: "var(--hh-type-helper-line-height)",
            fontWeight: "var(--hh-type-helper-font-weight)",
            letterSpacing: "var(--hh-type-helper-letter-spacing)",
          },
        ],
        "hh-error": [
          "var(--hh-type-error-font-size)",
          {
            lineHeight: "var(--hh-type-error-line-height)",
            fontWeight: "var(--hh-type-error-font-weight)",
            letterSpacing: "var(--hh-type-error-letter-spacing)",
          },
        ],
        "hh-status": [
          "var(--hh-type-status-font-size)",
          {
            lineHeight: "var(--hh-type-status-line-height)",
            fontWeight: "var(--hh-type-status-font-weight)",
            letterSpacing: "var(--hh-type-status-letter-spacing)",
          },
        ],
        /** Retained compatibility aliases. */
        body: ["var(--hh-type-body-font-size)", { lineHeight: "var(--hh-type-body-line-height)" }],
        label: [
          "var(--hh-type-label-font-size)",
          { lineHeight: "var(--hh-type-label-line-height)" },
        ],
      },
      boxShadow: {
        operational: "var(--hh-shadow-operational)",
        floating: "var(--hh-shadow-floating)",
        task: "var(--hh-shadow-task)",
        overlay: "var(--hh-shadow-overlay)",
        sidebar: "var(--hh-shadow-sidebar)",
      },
      keyframes: {
        "receipt-queue-badge": {
          "0%": {
            transform: "scale(1) translateY(0)",
            opacity: "1",
            backgroundColor: "transparent",
          },
          "45%": {
            transform: "scale(1.12) translateY(-2px)",
            opacity: "1",
            backgroundColor: "rgb(99 102 241 / 0.18)",
          },
          "100%": {
            transform: "scale(1) translateY(0)",
            opacity: "1",
            backgroundColor: "transparent",
          },
        },
        "receipt-queue-row-new": {
          "0%": { backgroundColor: "rgb(239 246 255)" },
          "100%": { backgroundColor: "rgb(239 246 255 / 0)" },
        },
        "receipt-queue-row-exit": {
          "0%": {
            opacity: "1",
            transform: "translateY(0)",
          },
          "100%": {
            opacity: "0",
            transform: "translateY(-10px)",
          },
        },
        "rq-confirm-shake": {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-6px)" },
          "40%": { transform: "translateX(6px)" },
          "60%": { transform: "translateX(-4px)" },
          "80%": { transform: "translateX(4px)" },
        },
        "toast-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "toast-out": {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        /** Restrained centered dialog reveal: opacity plus a small positional transition. */
        "hh-dialog-in": {
          from: { opacity: "0", transform: "translate(-50%, calc(-50% + 10px))" },
          to: { opacity: "1", transform: "translate(-50%, -50%)" },
        },
        "hh-dialog-out": {
          from: { opacity: "1", transform: "translate(-50%, -50%)" },
          to: { opacity: "0", transform: "translate(-50%, calc(-50% + 6px))" },
        },
        "hh-command-dialog-in": {
          from: { opacity: "0", transform: "translate(-50%, 10px)" },
          to: { opacity: "1", transform: "translate(-50%, 0)" },
        },
        "hh-command-dialog-out": {
          from: { opacity: "1", transform: "translate(-50%, 0)" },
          to: { opacity: "0", transform: "translate(-50%, 6px)" },
        },
        "hh-modal-fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "hh-modal-fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        "hh-panel-dialog-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "hh-panel-dialog-out": {
          from: { opacity: "1", transform: "translateY(0)" },
          to: { opacity: "0", transform: "translateY(6px)" },
        },
        /** Mobile bottom sheet: slide + fade. */
        "hh-sheet-in": {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "hh-sheet-out": {
          from: { opacity: "1", transform: "translateY(0)" },
          to: { opacity: "0", transform: "translateY(18px)" },
        },
        "hh-sheet-right-in": {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "hh-sheet-right-out": {
          from: { opacity: "1", transform: "translateX(0)" },
          to: { opacity: "0", transform: "translateX(16px)" },
        },
        "hh-sheet-left-in": {
          from: { opacity: "0", transform: "translateX(-24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "hh-sheet-left-out": {
          from: { opacity: "1", transform: "translateX(0)" },
          to: { opacity: "0", transform: "translateX(-16px)" },
        },
        "hh-sheet-top-in": {
          from: { opacity: "0", transform: "translateY(-24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "hh-sheet-top-out": {
          from: { opacity: "1", transform: "translateY(0)" },
          to: { opacity: "0", transform: "translateY(-16px)" },
        },
      },
      animation: {
        "receipt-queue-badge": "receipt-queue-badge 220ms cubic-bezier(0.33, 1, 0.68, 1) both",
        "receipt-queue-row-new": "receipt-queue-row-new 600ms ease-out forwards",
        "receipt-queue-row-exit": "receipt-queue-row-exit 220ms ease-out forwards",
        "rq-confirm-shake": "rq-confirm-shake 340ms ease-in-out both",
        "toast-in": "toast-in 220ms cubic-bezier(0, 0, 0.2, 1) both",
        "toast-out": "toast-out 180ms ease both",
        "hh-dialog-in": "hh-dialog-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "hh-dialog-out": "hh-dialog-out 160ms cubic-bezier(0.4, 0, 1, 1) both",
        "hh-command-dialog-in": "hh-command-dialog-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "hh-command-dialog-out": "hh-command-dialog-out 160ms cubic-bezier(0.4, 0, 1, 1) both",
        "hh-modal-fade-in": "hh-modal-fade-in 180ms ease-out both",
        "hh-modal-fade-out": "hh-modal-fade-out 140ms ease-in both",
        "hh-panel-dialog-in": "hh-panel-dialog-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "hh-panel-dialog-out": "hh-panel-dialog-out 160ms cubic-bezier(0.4, 0, 1, 1) both",
        "hh-sheet-in": "hh-sheet-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "hh-sheet-out": "hh-sheet-out 160ms cubic-bezier(0.4, 0, 1, 1) both",
        "hh-sheet-right-in": "hh-sheet-right-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "hh-sheet-right-out": "hh-sheet-right-out 160ms cubic-bezier(0.4, 0, 1, 1) both",
        "hh-sheet-left-in": "hh-sheet-left-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "hh-sheet-left-out": "hh-sheet-left-out 160ms cubic-bezier(0.4, 0, 1, 1) both",
        "hh-sheet-top-in": "hh-sheet-top-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "hh-sheet-top-out": "hh-sheet-top-out 160ms cubic-bezier(0.4, 0, 1, 1) both",
      },
      transitionDuration: {
        micro: "200ms",
        "micro-slow": "240ms",
        /** Named steps avoid ambiguous `duration-[Nms]` warnings (Tailwind 3.4+) */
        nav: "120ms",
        rq: "140ms",
      },
      transitionTimingFunction: {
        /** Material standard / deceleration */
        "material-standard": "cubic-bezier(0.4, 0, 0.2, 1)",
        /** Slight overshoot (receipt queue micro-interactions) */
        "spring-out": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
