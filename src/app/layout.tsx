import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ensureConstructionSchema } from "@/lib/ensure-construction-schema";
import { ServiceWorkerCleanup } from "@/components/service-worker-cleanup";
import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "./providers";
import { OPERATIONAL_THEME_BOOTSTRAP_SCRIPT } from "@/lib/operational-theme";

const LEGACY_SERVICE_WORKER_CLEANUP_SCRIPT = `(function(){var key="hh-sw-cleanup-reload-v1";var hadController=typeof navigator!=="undefined"&&"serviceWorker" in navigator&&Boolean(navigator.serviceWorker.controller);var unregister=typeof navigator!=="undefined"&&"serviceWorker" in navigator?navigator.serviceWorker.getRegistrations().then(function(registrations){return Promise.all(registrations.map(function(registration){return registration.unregister();}));}).catch(function(){return[];}):Promise.resolve([]);unregister.then(function(){if(typeof caches==="undefined")return[];return caches.keys().then(function(keys){return Promise.all(keys.map(function(cacheName){return caches.delete(cacheName);}));}).catch(function(){return[];});}).then(function(){if(hadController){try{if(sessionStorage.getItem(key)!=="1"){sessionStorage.setItem(key,"1");location.reload();return;}}catch(_error){}}try{sessionStorage.removeItem(key);}catch(_error){}});})();`;

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "HH Group",
  description: "Construction project management",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HH Group",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F7F6" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
};

export default async function RootLayout(
  props: Readonly<{
    children: React.ReactNode;
  }>
) {
  try {
    await ensureConstructionSchema();
  } catch {
    // Schema ensure failed (e.g. DB URL missing or connection error); app still loads.
  }
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        <link rel="icon" href="/favicon.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <script
          id="hh-operational-theme"
          dangerouslySetInnerHTML={{ __html: OPERATIONAL_THEME_BOOTSTRAP_SCRIPT }}
        />
      </head>
      <body className="hh-motion-root antialiased">
        <Script id="legacy-service-worker-cleanup" strategy="beforeInteractive">
          {LEGACY_SERVICE_WORKER_CLEANUP_SCRIPT}
        </Script>
        <ServiceWorkerCleanup />
        <Providers>
          <AppShell>{props.children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
