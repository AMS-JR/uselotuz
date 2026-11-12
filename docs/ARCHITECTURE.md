# Lotuz — Architecture and Technology Decisions

## 1. System shape

The customer-facing brand is **Lotuz** at `uselotuz.io`; its first product is
**Lotuz Inventory** at `inventory.uselotuz.io`. UseLotuz is the domain/repository
identity. Existing repository paths, `@uselotuz/*` workspaces, Java namespaces,
asset filenames and domains retain their technical names.

Lotuz is a connected SaaS ecosystem under Menes, with a product-discovery website and independent business applications. Customers use one Lotuz identity and shared business/workspace membership, with product-specific access and entitlements. Each product remains usable without subscribing to another. Cross-product sharing is opt-in, business-scoped and revocable.

Use **one GitHub monorepo**, independent frontend apps, shared frontend packages and initially **one modular Spring Boot backend**, not separately deployed microservices. The backend owns core business logic and data access.

## 2. Technology choices

| Area               | Choice                                                | Notes                                                |
| ------------------ | ----------------------------------------------------- | ---------------------------------------------------- |
| Frontend           | Next.js App Router, React, TypeScript strict mode     | Main website uses static export for Cloudflare Pages |
| Styling/components | Tailwind CSS, shadcn/ui, Lucide React                 | Visual rules in `DESIGN_SYSTEM.md`                   |
| Frontend tooling   | pnpm workspaces                                       | Shared packages across apps                          |
| Forms/validation   | React Hook Form, Zod                                  | Use where appropriate                                |
| Backend            | Java 21, Spring Boot, Maven                           | Single modular application initially                 |
| API/security       | REST, Spring Security                                 | Shared identity; business and product authorization  |
| Persistence        | Spring Data JPA/Hibernate, PostgreSQL, Flyway         | One database initially; migrations are versioned     |
| Backend tests      | Boot-managed JUnit Jupiter, Mockito, Spring Boot Test | PostgreSQL-backed checks in CI                       |
| Local services     | Docker Compose                                        | Start locally before production hosting              |
| Coding agent       | OpenAI Codex initially                                | Tool-specific skills are not required                |

Exact framework versions and third-party providers should be chosen at scaffolding time, documented, and kept compatible.

### Initial frontend implementation

The initial workspace uses Node.js 24.18.0, pnpm 10.34.9, Next.js 16.4.6,
React 19.3.1, TypeScript 5.9.3 and Tailwind CSS 4.3.5. Exact resolved
dependencies are recorded in `pnpm-lock.yaml`.

`apps/web`, `apps/inventory`, `apps/workspace`, `packages/ui` and `packages/config` are implemented.
The Inventory Phase 1 foundation adds a Java 21 / Spring Boot 4.1.2 Maven backend
and local PostgreSQL 18 via Docker Compose. See `INVENTORY_PHASE_1.md` for scope,
environment variables, provisioning and test commands.
Shared UI exports TypeScript source for Next.js to compile and semantic theme
tokens for Tailwind. The config package holds shared strict TypeScript settings.
pnpm scripts coordinate checks; an additional build orchestrator is unnecessary.
Geist is the approved font. Native links/cards need no shadcn/ui primitive yet;
add selected primitives to the shared UI package as interactions require them.
Forms and runtime validation libraries are likewise deferred until used.

The main site exports static files to `apps/web/out` and has no API, authentication,
server-side runtime, or environment-variable requirement. CI checks the static
export on desktop and mobile Chromium without deploying it. Approved parent-brand
artwork lives in `apps/web/public/brand/`; original supplied bundles are preserved
outside the website under `assets/brand-source/uselotuz/` and
`assets/brand-source/inventory/`. The temporary public source directory has been
removed; only selected production artwork is exported. A static browser-mode manifest exposes
application icons without adding PWA services. See `BRAND_ASSETS.md` for the audit.
Marketing hosting remains unchanged. Product hosting, session persistence and other
remaining infrastructure choices stay TBD; Auth0 is now the approved identity provider.

## 3. Planned repository layout

```text
uselotuz/
├── apps/
│   ├── web/                 # Main Lotuz site; build first
│   ├── inventory/           # Phase 1 authenticated application shell
│   ├── workspace/           # Lightweight central business/product administration
│   └── foodcost/            # Future, do not scaffold now
├── packages/
│   ├── ui/                  # Shared components and design tokens
│   ├── config/              # Shared frontend configuration, if needed
│   └── types/               # Shared TS contracts, if needed
├── backend/                 # Java modular monolith
├── infra/                   # Docker Compose and infrastructure config
├── docs/
├── AGENTS.md
└── README.md
```

Folders are illustrative, not a requirement to create empty directories. Use a feature-based backend package structure; see `CODING_STANDARDS.md` for its internal layers.

## 4. Application and module boundaries

- `apps/web`: brand homepage, product discovery, links, public information; no server-only Next.js dependency while using static export.
- Product frontends: independently deployable and product-specific user experiences, sharing approved UI components and API conventions.
- Implemented shared platform modules: `identity`, `business`, `access`. The first product module is `inventory`, currently limited to its access context and default location. Future product modules are added only when their development is approved.
- Each module owns its persistence. Other modules use explicit application interfaces, not repositories or entities. Future product connections use authorized APIs/events rather than shared-table access; no broker or connector infrastructure is implemented in Phase 1.
- Frontends call the backend over HTTPS; backend enforces business rules and permissions. Do not rely on frontend access checks for security.

## 5. Identity, tenancy and connections

Managed OIDC with Spring Security server-side sessions is approved. Provider selection
is **Auth0**, using one confidential Regular Web Application for the current backend.
Issuer/client credentials are environment-configured; Universal Login handles signup and recovery. Authentication
fails closed when disabled or incompletely configured. Sessions are in-memory for
the single-process foundation, using host-scoped HTTP-only cookies, CSRF protection
and exact configured Inventory/Workspace CORS origins. Deployment/session persistence remains a later decision.
A single login does not automatically imply access to any business or product.
Workspace is an optional central administration/navigation frontend. Business creation
adds an OWNER membership but no products. Trusted operators approve product activation;
Inventory provisioning is transactional and idempotent. No duplicate tenant/identity tables
or customer entitlement-grant endpoint are added. See `AUTH0_WORKSPACE.md` for contracts,
Auth0 plan limitations, safe redirects, shared sessions and production proxy requirements.

Enforce business-level authorization on every tenant-owned operation. Verify membership/permissions server-side, including when business IDs are supplied by clients. Sharing data between products requires explicit scoped authorization and revocation; do not expose sales, margins or customer data to Marketing by default.

## 6. Data and integrations

Start with one PostgreSQL database, domain-specific tables, Flyway migrations and explicit business ownership for tenant data. Inventory must use auditable stock movements rather than untracked quantity overwrites. Sales-import accuracy depends on item-level data and reliable SKU mapping; do not claim real-time inventory without an appropriate data source.

File storage (e.g. private reports/images), payment provider and production managed database are **TBD**. POS integrations, email parsing and advanced cross-product automation are later-stage possibilities, not initial infrastructure commitments.

## 7. Domains, DNS and deployment

| Address                 | Purpose                             | Planned hosting           |
| ----------------------- | ----------------------------------- | ------------------------- |
| `uselotuz.io`           | Main product-directory website      | Cloudflare Pages          |
| `inventory.uselotuz.io` | Inventory frontend                  | TBD                       |
| `api.uselotuz.io`       | Spring Boot API                     | TBD, Java-compatible host |
| `workspace.uselotuz.io` | Central Workspace frontend          | TBD                       |
| `auth.uselotuz.io`      | Auth0 Universal Login custom domain | Future configuration      |
| `pos.uselotuz.io`       | Future independent product          | TBD                       |
| `foodcost.uselotuz.io`  | Future product                      | TBD                       |

- Domain registrar: **Hostinger**; DNS: **Cloudflare** (planned configuration).
- The main website is deployed to Cloudflare Pages using `apps/web` static export and its independent workspace-aware build. Inventory does not change that configuration.
- Other SaaS frontends may need server-side Next.js capabilities, so their hosting is not automatically Cloudflare Pages static hosting.
- Spring Boot runs on separate Java-capable infrastructure; Cloudflare Pages does not host the persistent Java server.
- Use preview deployments for demos/testing where suitable. No production deployment without approval.

## 8. Local development and architectural evolution

Use pnpm for frontend workspaces, Maven for Java, and Docker Compose for local database/services. Keep environment-specific secrets out of source control. Favor one backend deployment and predictable operating costs until actual needs justify splitting services.

See `PRODUCT_ROADMAP.md` for what to build and when; see `CODING_STANDARDS.md` for implementation-level conventions.

## 9. Open architectural decisions

- Auth0 plan entitlement confirmation, production callback origins and session persistence/deployment topology
- Backend host and managed PostgreSQL provider
- Storage, payment integration and monitoring choices
- Whether/when Inventory requires server-rendered Next.js features
