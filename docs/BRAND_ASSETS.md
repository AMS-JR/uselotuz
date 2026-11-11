# Lotuz brand asset audit

Customer-facing branding is **Lotuz** and **Lotuz Inventory**. UseLotuz identifies
the domain/repository; archive directory names and filenames retain `uselotuz`.
Archived supplier READMEs and the Inventory social artwork may contain the older
UseLotuz wording. They are preserved as original source material, not published
on the main website. Inventory artwork with embedded wording must be reviewed
before a future product launch; this task does not alter that artwork. The
parent social image is icon-only and remains suitable for Lotuz branding.

The supplied assets are archived outside the public website under
`assets/brand-source/uselotuz/` (17 files) and `assets/brand-source/inventory/`
(20 files). The temporary `apps/web/public/brand-assets/` directory has been removed.
All 37 supplied
files were inventoried, SHA-256 hashed, and inspected: both READMEs, three SVGs,
two multi-resolution ICOs, and 30 PNGs. PNG dimensions and ICO entries were checked
against their filenames. All visual assets were reviewed together in a labeled
contact sheet. The supplied parent-brand assets are authoritative, including
their existing gradients; the artwork has not been recolored or redesigned.

## Selected website assets

Production files are byte-identical copies of these approved originals from
`assets/brand-source/uselotuz/`. Production paths below are relative to
`apps/web/public/`.

| Supplied file                   | Production file                        | Use                                                                      |
| ------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `uselotuz-lotus-master.svg`     | `brand/logo/lotus.svg`                 | Responsive header/footer mark and scalable browser icon; 512×512 viewBox |
| `favicon.ico`                   | `brand/favicons/favicon.ico`           | Browser fallback with embedded 16×16, 32×32 and 48×48 images             |
| `app-icon-blue-180x180.png`     | `brand/app-icons/apple-touch-icon.png` | Apple touch icon, 180×180                                                |
| `app-icon-blue-192x192.png`     | `brand/app-icons/icon-192.png`         | Manifest application icon, 192×192                                       |
| `app-icon-blue-512x512.png`     | `brand/app-icons/icon-512.png`         | Manifest application icon, 512×512                                       |
| `social-icon-only-1200x630.png` | `brand/social/og-image.png`            | Open Graph and Twitter large-image card, 1200×630                        |

The lotus is displayed with its original aspect ratio and clear space, alongside
the lowercase `lotuz` wordmark in Comfortaa Regular (400). Geist remains the
website's primary font. The link has one accessible name; the adjacent
image is decorative to avoid announcing the name twice. All website branding
references the parent-brand bundle only. Inventory's existing concept section
and generic interface icon are unchanged.

`site.webmanifest` exposes the supplied application icons in browser display mode.
It does not add an offline experience, service worker, install prompt or standalone
application. Icons declare `purpose: any`; no supplied file is asserted to be
maskable. Static metadata follows the
[Next.js metadata API](https://nextjs.org/docs/app/api-reference/functions/generate-metadata).

## Final structure and cleanup verification

```text
assets/brand-source/              # Non-public source archive, never copied into the website
├── uselotuz/                     # All 17 supplied parent-brand files
└── inventory/                    # All 20 supplied Inventory files; redundant wrapper flattened
apps/web/public/
├── brand/                       # Six unchanged production files listed above
│   ├── logo/
│   ├── favicons/
│   ├── app-icons/
│   └── social/
└── site.webmanifest
```

No production component, metadata, manifest, shared package or CI configuration
depends on the temporary source directory. The six production assets remain
referenced by the brand component, root metadata and application manifest.
All 37 relocated source files and all six production files were checked against
their pre-cleanup SHA-256 hashes. No artwork or source file was discarded or
modified; only empty public source directories were deleted. The production
build exports `public/brand/` without the source archive or Inventory artwork.

## Duplicate and unused assets — preserved in the archive

There are no byte-identical files within the 17-file parent-brand bundle.
Different-size exports are variants, not exact duplicates.

The six selected originals are deliberately retained in the non-public parent
archive, with byte-identical production copies under `apps/web/public/brand/`.
These source copies and the supplied READMEs are no longer published.

Unused parent-brand exports: `lotus-transparent-{16,32,48,64,128,180,192,256,512,1024}x{same}.png`
(ten square PNGs). The SVG covers responsive website use, the ICO covers the small
browser sizes, and the blue-background PNGs cover touch/application icons. These
transparent exports remain in the non-public archive. `README.txt`
is source documentation, not a runtime asset.

The 20-file Inventory bundle is preserved at `assets/brand-source/inventory/`.
The redundant `uselotuz-inventory-assets/uselotuz-inventory-assets/` wrapper was
flattened during relocation; internal file names and contents are unchanged.
None of its assets are referenced or published by the main website. Two exact
duplicate pairs remain archived:

| Redundant archived file     | Identical archived file | SHA-256                                                            |
| --------------------------- | ----------------------- | ------------------------------------------------------------------ |
| `logo/logo-1024.png`        | `icons/icon-1024.png`   | `A9F4639F5DA16701308ED3BC15F1118FB7728EF2FECC1ADB4CE852900409A2F8` |
| `logo/logo-transparent.png` | `icons/icon-512.png`    | `16716CA914348AA11E5F173D2FE21CB657D7BE8B859EAC95189ACC012362355E` |

Both pairs are retained as part of the original Inventory source bundle. They
could be deduplicated later with approval, but are already excluded from the
website. Other Inventory files are product-specific variants, not redundant
parent-site assets. All remain available for future Inventory work.

## Remaining requirements

All assets needed for the current website are supplied. No horizontal wordmark
or maskable application icon was supplied; neither is necessary for the current
implementation. The approved social image is intentionally icon-only. A text-bearing
social variant would require a separately approved asset, not a generated substitute.
Public sharing previews can be verified after a separately approved deployment;
local checks validate metadata, dimensions and static asset delivery.
