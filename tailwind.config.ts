import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
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
        touch: "44px",
      },
      colors: {
        /** Semantic UI tokens — single source of truth (Linear / Apple SaaS) */
        brand: {
          primary: "#2563eb",
        },
        page: "#f5f5f7",
        text: {
          primary: "#111827",
          secondary: "#6b7280",
        },
        status: {
          error: "#dc2626",
          warning: "#f59e0b",
          success: "#16a34a",
          pending: "#6b7280",
        },
        money: {
          expense: "#d92d20",
          income: "#16a34a",
        },
        /** HH Group legacy aliases (prefer brand/page/text-* above) */
        hh: {
          page: "#f5f5f7",
          surface: "#FFFFFF",
          ink: "#111827",
          muted: "#6B7280",
          border: "#E5E7EB",
          "row-hover": "#F9FAFB",
          primary: "#111827",
          link: "#2563EB",
          danger: "#DC2626",
          "secondary-border": "#D1D5DB",
          "secondary-text": "#374151",
        },
        graphite: "#111827",
        "warm-grey": "#F8F7F4",
        "border-soft": "#E5E7EB",
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
        card: "12px",
        modal: "14px",
      },
      fontSize: {
        /** Body 14px, labels 12px */
        body: ["0.875rem", { lineHeight: "1.45" }],
        label: ["0.75rem", { lineHeight: "1.35" }],
      },
      boxShadow: {
        "paper-card": "0 1px 3px rgba(0,0,0,0.05), 0 10px 40px -10px rgba(0,0,0,0.03)",
        modal: "0 12px 40px rgba(17, 24, 39, 0.08), 0 2px 12px rgba(17, 24, 39, 0.04)",
        "summary-card": "0 1px 4px rgba(0,0,0,0.06)",
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
          "0%": { backgroundColor: "rgb(255 251 235)" },
          "100%": { backgroundColor: "rgb(255 251 235 / 0)" },
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
          "0%": { opacity: "0", transform: "translateY(8px) scale(0.96)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "toast-out": {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        "receipt-queue-badge": "receipt-queue-badge 220ms cubic-bezier(0.33, 1, 0.68, 1) both",
        "receipt-queue-row-new": "receipt-queue-row-new 600ms ease-out forwards",
        "receipt-queue-row-exit": "receipt-queue-row-exit 220ms ease-out forwards",
        "rq-confirm-shake": "rq-confirm-shake 340ms ease-in-out both",
        "toast-in": "toast-in 220ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "toast-out": "toast-out 180ms ease both",
      },
      transitionDuration: {
        micro: "200ms",
        "micro-slow": "240ms",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
