# Lotuz main website deployment

This is a reviewed configuration and runbook, not a record of a deployment.
No Pages project, domain, DNS, or production infrastructure was changed.

## Build and portability

Run from the repository root. pnpm resolves `apps/web`, shared UI source, and
shared TypeScript configuration together. `pnpm build` runs the web workspace's
`next build`; `output: "export"` and `trailingSlash: true` produce
`apps/web/out/index.html`, `404.html`, static navigation payloads, fonts and assets.
The SVG logo is unoptimized, compatible with static hosting. Geist and the
wordmark's Comfortaa font are fetched at build time and served locally afterward;
the build environment needs outbound font-download access.

The application uses portable Next.js APIs and plain static output. Any static
host can serve the same export with its 404 handling; Vercel or another provider
can rebuild the same monorepo without changing brand assets or application code.
No Cloudflare adapter, Functions, Workers binding, runtime secret or database is
required. Preserve the trailing-slash routing and correct MIME types on migration.

## Exact Cloudflare Pages settings

| Setting                   | Value                                                       |
| ------------------------- | ----------------------------------------------------------- |
| Project type              | Pages, connected to the GitHub repository                   |
| Suggested project name    | `lotuz-web` (subject to availability)                       |
| Production branch         | `main`                                                      |
| Build system              | v3                                                          |
| Root directory            | Repository root: leave blank (shown as `/`), not `apps/web` |
| Framework preset          | Next.js (Static HTML Export); override its defaults below   |
| Build command             | `pnpm install --frozen-lockfile && pnpm build`              |
| Build output directory    | `apps/web/out` (relative to repository root)                |
| `NODE_VERSION`            | `24.18.0`                                                   |
| `PNPM_VERSION`            | `10.34.9`                                                   |
| `SKIP_DEPENDENCY_INSTALL` | `1` (the build command owns the install)                    |

Set these build variables for both Production and Preview. They match
`.node-version`, root `engines`, and `packageManager`. Explicit versions avoid
depending on the image's defaults or pnpm version inference. Install development
dependencies too; the build requires TypeScript and Tailwind tooling. Leave
`NODE_ENV` unset during dependency installation. No application secrets are needed.
Initially retain default build watch paths so shared package or lockfile changes
cannot be accidentally excluded.

References: [static Next.js Pages guide](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/),
[build image and version overrides](https://developers.cloudflare.com/pages/configuration/build-image/),
[monorepos](https://developers.cloudflare.com/pages/configuration/monorepos/), and
[build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/).

## Release procedure — execute only after deployment approval

1. Review and commit the intended changes, including `pnpm-lock.yaml`, then push
   to the connected repository. The current workspace contains uncommitted work;
   a Git-connected deployment only receives committed, pushed source.
2. Run the existing CI checks: frozen-lockfile install, formatting, lint, types,
   production build and Playwright Chromium tests. Require green checks before
   merging to `main`. GitHub branch protection is an external setting to configure
   separately; Pages Git integration can build concurrently and does not itself
   wait for the GitHub Actions workflow to succeed.
3. In Cloudflare, open Workers & Pages, create an application, select Pages and
   connect GitHub. Select this repository and apply the table above before the
   first build. Creating/saving the project can trigger deployment: do not do this
   while deployment is unapproved.
4. After approval, deploy and inspect the build log for the pinned versions and
   successful frozen install. Confirm the output is `apps/web/out`.
5. On the assigned `*.pages.dev` URL verify the homepage, all navigation anchors,
   keyboard skip link, responsive header/footer, and a real HTTP 404 for an
   unknown path. Check `/robots.txt`, `/sitemap.xml`, `/site.webmanifest`, all six
   `/brand/` assets and locally served fonts. Source archives must return 404.
6. For branch previews, confirm the `X-Robots-Tag: noindex` header that
   [Pages supplies by default](https://developers.cloudflare.com/pages/configuration/preview-deployments/).
   The production branch's `pages.dev` address is different from a branch preview;
   do not assume it has that protection. Use a branch preview for prelaunch
   review and verify its noindex header before sharing the URL. Keep the
   production canonical, sitemap and sharing-image URLs at `https://uselotuz.io`;
   do not point them at temporary preview URLs.
7. Custom-domain/DNS setup requires separate explicit approval. Add `uselotuz.io`
   through the Pages project's Custom domains flow. Apex hosting requires the
   domain to be a zone in the same Cloudflare account using Cloudflare nameservers.
   If still on Hostinger DNS, first inventory all records, including mail records,
   and plan a separate nameserver migration; registration can remain at Hostinger.
   Follow [Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).
   Do not alter Inventory or API subdomains as part of the main-site release.
8. After domain approval and activation, verify HTTPS and the canonical URL,
   then configure approved host-level redirects for any `www` or production
   `pages.dev` aliases to the canonical apex. These are hosting settings, not
   application dependencies. Verify actual Open Graph/Twitter fetches at the
   canonical host and submit the sitemap in the chosen search-console account.

## Readiness and outstanding checks

- Homepage metadata includes Lotuz title/description, canonical apex URL, Open
  Graph/Twitter image URLs, accessible image descriptions, favicon, Apple touch
  icon and a browser-mode manifest. Only the homepage is a public content route;
  sitemap entries exclude hash anchors, errors and the unimplemented Inventory app.
- `robots.txt` allows the public site and advertises the production sitemap.
  Preview indexing protection is a hosting concern, not a production robots ban.
- Production assets are separate from the non-public source archives. Navigation
  uses local anchors and a home link; no unavailable product launch link is exposed.
- ESLint 9 is retained for compatibility with the installed Next.js lint plugins;
  npm's unsupported-version warning is already documented in the README. Review
  dependency advisories before release; this task does not upgrade dependencies.
- Existing CI configuration is suitable and remains deployment-free. Local checks
  cannot prove a successful Linux CI run or Cloudflare build. Those logs, domain
  ownership, TLS, redirects and real social previews still need verification after
  the corresponding external actions are approved.
