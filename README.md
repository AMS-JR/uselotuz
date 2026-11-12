# Lotuz

**Focused SaaS tools for independent small businesses.**

Lotuz is a family of standalone applications for stores and restaurants. The main website is a product directory; customers can use one product independently, with shared sign-in and optional, permission-controlled connections between products.

## Naming

The customer-facing brand is **Lotuz**, with the main website at **uselotuz.io**.
The first product is **Lotuz Inventory**, planned for **inventory.uselotuz.io**.
Future product names follow the same pattern: Lotuz POS, Lotuz Invoicing, Lotuz CRM.
These are naming examples, not additional implementation scope.

**UseLotuz** refers to the domain name and repository identity. Technical names
such as `uselotuz`, `@uselotuz/web`, archive directories and asset filenames remain
unchanged; they are not customer-facing brand names.

## Project status

The main website is deployed to Cloudflare Pages. Lotuz Inventory is the selected
first SaaS product, with its Phase 1 platform/access foundation implemented.
Lotuz is a connected ecosystem under Menes; each product remains independently usable.
Do not scaffold or launch the entire portfolio at once.

## Repository

- `apps/` — independent frontend applications, added as needed
- `packages/` — shared UI and frontend configuration
- `backend/` — modular Spring Boot application
- `infra/` — local infrastructure and deployment configuration
- `docs/` — decisions, design rules, coding conventions and roadmap
- `assets/brand-source/` — non-public archives of supplied parent and Inventory artwork

The workspace contains `apps/web`, `apps/inventory`, `apps/workspace`, `packages/ui`, and
`packages/config`, plus a modular Spring Boot `backend` and local PostgreSQL
configuration in `infra/`. Catalog and stock workflows remain outside Phase 1.

## Documentation

- [Architecture and technology decisions](docs/ARCHITECTURE.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [Coding standards](docs/CODING_STANDARDS.md)
- [Product roadmap](docs/PRODUCT_ROADMAP.md)
- [AI development instructions](AGENTS.md)
- [Deployment settings and release checklist](docs/DEPLOYMENT.md)
- [Inventory Phase 1 setup, authentication and verification](docs/INVENTORY_PHASE_1.md)
- [Auth0 and Workspace setup, sessions and manual acceptance](docs/AUTH0_WORKSPACE.md)

## Development

Prerequisites: Node.js **24.18.0** (see `.node-version`) and pnpm **10.34.9**
(pinned in `package.json`). Install that pnpm version with your preferred Node
package-manager tooling before running these commands. On Windows PowerShell,
use `pnpm.cmd` if execution policy blocks the `pnpm.ps1` launcher.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

The website runs at `http://localhost:3000`. Workspace commands from the root:

| Command             | Purpose                                                        |
| ------------------- | -------------------------------------------------------------- |
| `pnpm build`        | Export the website to `apps/web/out`                           |
| `pnpm lint`         | ESLint, including Next.js and TypeScript rules                 |
| `pnpm typecheck`    | Generate Next.js route types and check app/shared UI types     |
| `pnpm format:check` | Check formatting                                               |
| `pnpm format`       | Apply formatting                                               |
| `pnpm test:e2e`     | Test the existing static export on desktop and mobile Chromium |

Before the first browser test, run
`pnpm --filter @uselotuz/web exec playwright install chromium`, then `pnpm build`.
The test server binds only to `127.0.0.1:3100`, separate from development on port
3000; keep port 3100 free. Linux CI
installs browser system dependencies using Playwright's `--with-deps` flag.
CI runs formatting, lint, types, build, and browser checks; it does not deploy.

Tooling compatibility note: the Next.js React/accessibility lint plugins currently
declare support through ESLint 9. This workspace uses the compatible ESLint 9
release despite npm's unsupported-version warning; revisit when those plugins
support ESLint 10. No lint peer-dependency overrides are applied.

### Workspace boundaries

Use `pnpm dev:inventory` for Inventory on port 3001 and `pnpm build:inventory`
for its independent build. Use `pnpm dev:workspace`, `pnpm build:workspace`, and
`pnpm test:workspace` for the independent central Workspace on port 3002.
Auth0 configuration and the PostgreSQL host port **5433** are documented in
[Auth0 and Workspace](docs/AUTH0_WORKSPACE.md). `pnpm build` and `pnpm dev` still target only the
marketing site. Backend commands, required database/OIDC variables and operator
provisioning are documented in [Inventory Phase 1](docs/INVENTORY_PHASE_1.md).

- `apps/web`: public, static product-discovery site. Inventory is described as
  a proposed product under validation; no Inventory functionality is implemented.
- `apps/inventory`: independently accessible authenticated Inventory shell.
- `apps/workspace`: business and product administration; creating a business activates no products. Product activation is operator-approved.
- `packages/ui`: semantic Tailwind theme and small, server-compatible UI components.
  Add shadcn/ui primitives here when interactive components require them; the
  initial native links and cards do not need a primitive dependency.
- `packages/config`: strict TypeScript settings shared by web and UI.

Next.js compiles shared UI source directly; no separate package build is needed.
Tailwind explicitly scans the shared UI source. The marketing website requires
no environment variables or backend services. Inventory requires a configured
backend/database and OIDC provider for authenticated use. Geist and the wordmark's Comfortaa are downloaded
at build time through `next/font` and served with the static site; the browser
does not fetch Google Fonts.

### Branding and deployment status

Approved artwork is organized in `apps/web/public/brand/` for the header/footer
logo, browser favicon, Apple touch/application icons, and Open Graph/Twitter
sharing image. Production artwork is copied byte-for-byte from the supplied
parent-brand bundle; no logo was generated or redesigned. `site.webmanifest`
references the application icons in browser mode, without adding PWA services.

The original parent and Inventory bundles are preserved byte-for-byte under
`assets/brand-source/uselotuz/` and `assets/brand-source/inventory/`, respectively.
The temporary `apps/web/public/brand-assets/` directory has been removed; source
archives are outside the website's public files and static export. All 37 source
files are retained, including unused variants and duplicate Inventory exports.
See the [asset audit](docs/BRAND_ASSETS.md) for provenance and duplicate details.
Inventory assets are not used by the main site.

The website is configured for Next.js static export, following the
[Next.js static export guide](https://nextjs.org/docs/app/guides/static-exports).
The marketing website is deployed to Cloudflare Pages; this Phase 1 change makes
no hosting or domain changes. The Cloudflare Pages build runs from the repository root
with `pnpm install --frozen-lockfile` and `pnpm build`, publishing `apps/web/out`.
Use the pinned Node.js and pnpm versions. Keep the canonical, sitemap and sharing
URLs at `https://uselotuz.io` in both production and previews. See the
[deployment runbook](docs/DEPLOYMENT.md) for exact build variables, preview
indexing protection and the separately approved custom-domain procedure.

## License

Proprietary. All rights reserved.
