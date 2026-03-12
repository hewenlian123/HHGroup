import type { Metadata } from "next";
import localFont from "next/font/local";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { ensureConstructionSchema } from "@/lib/ensure-construction-schema";

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
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} antialiased`}
      >
        <AppShell>{props.children}</AppShell>
      </body>
    </html>
  );
}
