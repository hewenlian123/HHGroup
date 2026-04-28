import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import localFont from "next/font/local";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ensureConstructionSchema } from "@/lib/ensure-construction-schema";
import { DevUnregisterServiceWorker } from "@/components/dev-unregister-service-worker";
import { Skeleton } from "@/components/ui/skeleton";
import { Providers } from "./providers";

const AppShell = dynamic(() => import("@/components/layout/app-shell").then((m) => m.AppShell), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen bg-page">
      <Skeleton
        className="hidden w-[72px] shrink-0 rounded-none md:block lg:w-[210px]"
        aria-hidden
      />
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-4">
        <Skeleton className="h-10 w-full max-w-xl rounded-md" />
        <Skeleton className="h-9 w-48 rounded-md" />
        <Skeleton className="min-h-[240px] w-full flex-1 rounded-md" />
      </div>
    </div>
  ),
});

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
  themeColor: "#1f2937",
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
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body
        className={`hh-motion-root ${geistSans.variable} ${geistMono.variable} ${inter.variable} antialiased`}
      >
        {process.env.NODE_ENV === "development" ? (
          <Script id="dev-unregister-sw-before-interactive" strategy="beforeInteractive">
            {`(function(){if(typeof navigator!=="undefined"&&"serviceWorker"in navigator){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister();});});}})();`}
          </Script>
        ) : null}
        {process.env.NODE_ENV === "development" ? <DevUnregisterServiceWorker /> : null}
        <Providers>
          <AppShell>{props.children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
