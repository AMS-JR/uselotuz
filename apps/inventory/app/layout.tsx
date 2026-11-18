import { Suspense } from "react";
import { InventoryShell } from "../components/inventory-shell";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { branding } from "../lib/branding";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});
export const metadata: Metadata = {
  title: "Lotuz Inventory",
  description: "Your business workspace for Lotuz Inventory.",
  robots: { index: false, follow: false },
  applicationName: branding.header.accessibleText,
  icons: branding.icons,
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="font-sans antialiased">
        <Suspense
          fallback={
            <p className="p-6" role="status">
              Loading Inventory...
            </p>
          }
        >
          <InventoryShell>{children}</InventoryShell>
        </Suspense>
      </body>
    </html>
  );
}
