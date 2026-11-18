import type { HeaderBrandProps } from "@uselotuz/ui";

// Paths are served by this application, independently of the marketing website.
export const branding = {
  header: {
    logoSrc: "/brand/logo/lotus.svg",
    appName: "Workspace",
    accessibleText: "Lotuz Workspace",
    logoWidth: 44,
    logoHeight: 44,
  } satisfies HeaderBrandProps,
  icons: {
    icon: [
      { url: "/brand/logo/lotus.svg", type: "image/svg+xml" },
      { url: "/brand/favicons/favicon.ico", sizes: "any" },
    ],
    shortcut: "/brand/favicons/favicon.ico",
    apple: [
      {
        url: "/brand/app-icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};
