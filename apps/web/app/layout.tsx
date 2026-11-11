import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});
const description =
  "Focused SaaS tools for independent small businesses. Explore what is taking shape at Lotuz, starting with Lotuz Inventory.";

export const metadata: Metadata = {
  metadataBase: new URL("https://uselotuz.io"),
  title: "Lotuz — Focused tools for independent businesses",
  description,
  applicationName: "Lotuz",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      {
        url: "/brand/favicons/favicon.ico",
        sizes: "16x16 32x32 48x48",
        type: "image/x-icon",
      },
      { url: "/brand/logo/lotus.svg", sizes: "any", type: "image/svg+xml" },
    ],
    apple: [
      {
        url: "/brand/app-icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Lotuz",
    title: "Lotuz — Focused tools for independent businesses",
    description,
    url: "/",
    images: [
      {
        url: "/brand/social/og-image.png",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "Lotuz white lotus on a blue background",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lotuz — Focused tools for independent businesses",
    description,
    images: [
      {
        url: "/brand/social/og-image.png",
        alt: "Lotuz white lotus on a blue background",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={geist.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
