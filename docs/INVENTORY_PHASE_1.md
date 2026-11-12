# Lotuz Inventory — Phase 1

Lotuz is a connected SaaS ecosystem under Menes. Identity, Business and Access
are shared UseLotuz platform modules. Inventory is the first product module;
future products must work independently and connect only through approved contracts.

## Implemented boundary

- `apps/inventory` (`@uselotuz/inventory`): authenticated application shell,
  business selection, no-business/access-denied/session-expired/error states.
- `backend`: one Java 21 / Spring Boot 4.1.2 application with package boundaries
  `identity`, `business`, `access`, `inventory`, and small technical `common` code.
- Platform: OIDC subject mapping, business membership, per-product entitlement
  and per-user product role. Each request rechecks database access, so revocation
  takes effect without waiting for the identity-provider session to expire.
- Inventory: one default location per business and an owner/admin-only endpoint
  for renaming that location. No catalog, balances, movements, dashboard metrics,
  reports, CSV, POS, recipe costing, billing or integration infrastructure exists.
- Controllers expose DTOs; product code calls platform application services rather
  than importing their repositories/entities. Inventory stores the business UUID
  as an external platform identifier. Its table has no cross-module JPA relationship.

`apps/web` and its static export/build command remain independent. The Inventory
application uses the same frontend versions, theme tokens, cards and button links;
it has its own server-capable Next.js configuration. No Inventory-specific logo
is substituted or generated; supplied source files are absent from this checkout.

## Schema

Flyway `V1__platform_and_inventory_foundation.sql` creates only:

| Module    | Tables                                  |
| --------- | --------------------------------------- |
| Identity  | `platform_user`, `external_identity`    |
| Business  | `business`, `business_membership`       |
| Access    | `product_entitlement`, `product_access` |
| Inventory | `inventory_location`                    |

External identities are unique by issuer and subject; email is not an identity key.
Product grants require the matching business membership and entitlement through
database constraints. The unique location business ID enforces one location for
MVP. Location IDs remain stable; a future migration can relax that uniqueness
and introduce location-aware stock without changing current identifiers.

Future stock decisions are approved but not implemented: BigDecimal/NUMERIC,
pieces/g/kg/mL/L, whole-number pieces, compatible conversions, negative-stock
rejection, auditable corrections, manual entry first and early CSV import/export.
No unit or stock tables are necessary for this phase.

## Roles and endpoints

Business membership alone grants no product access. Access requires active
membership, an active Inventory entitlement, and an active Inventory grant.
OWNER and ADMIN product roles can manage the default location; STAFF can view it.
Even a business owner with only a STAFF product grant cannot perform management
operations. Sensitive stock corrections will require OWNER/ADMIN in a later phase.
All roles can be provisioned through operator-controlled SQL; no management UI
or public grant/entitlement provisioning endpoint has been added.

| Endpoint                                        | Access                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `GET /api/auth/config`                          | Public; enabled flag only                                         |
| `GET /api/auth/csrf`                            | Public session-bound CSRF token                                   |
| `GET /oauth2/authorization/lotuz`               | Login entry, only when configured                                 |
| `GET /api/me`                                   | Authenticated, mapped OIDC identity                               |
| `GET /api/businesses`                           | Active memberships for the current user only                      |
| `GET /api/businesses/{id}/inventory`            | Membership + entitlement + VIEW                                   |
| `PATCH /api/businesses/{id}/inventory/location` | Same checks + OWNER/ADMIN + CSRF; body `{"name":"Main location"}` |
| `POST /api/auth/logout`                         | CSRF-protected local session logout                               |

## Authentication configuration

Auth0 is the selected managed provider; tenant credentials remain external.
The approved Workspace extension is documented in [Auth0 and Workspace](AUTH0_WORKSPACE.md).
It adds independent Workspace/direct Inventory login returns and provider logout while
preserving the callback path and Phase 1 access checks. Spring Security uses standard OIDC
discovery and authorization-code login. Provider tokens remain on the backend;
the browser uses an HTTP-only session cookie and credentialed API requests.
CSRF stays enabled. CORS permits exactly `INVENTORY_ORIGIN` and `WORKSPACE_ORIGIN`, not the marketing
origin or a wildcard. The cookie has no parent-domain scope and defaults to
Secure, HttpOnly, SameSite=Lax with a 30-minute inactivity timeout.

With `OIDC_ENABLED=false` (default), protected requests fail closed, including
requests carrying a principal. With OIDC enabled, missing credentials or failed
issuer discovery prevents startup. No development authentication bypass exists.
First login creates only a user/identity mapping, never business access.

Required provider-side setup:

1. Create a confidential OIDC web client with code flow and `openid profile email`.
2. Register the exact callback `http://localhost:8080/login/oauth2/code/lotuz` for
   local development; register the approved HTTPS API callback separately later.
3. Set `OIDC_ENABLED=true`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and
   `OIDC_CLIENT_SECRET` through environment/secrets. Never commit credentials.
4. Set `INVENTORY_ORIGIN` to the frontend's exact origin. Configure trusted proxy
   handling and callback URLs for the chosen host; do not trust arbitrary forwarded headers.

Sessions are in-memory for this single-process foundation. Restart logs users out;
multi-instance hosting or persistent sessions needs a later approved deployment
decision. The original local-only logout contract remains available. Frontend logout now
also navigates to Auth0 to end its browser session; see `AUTH0_WORKSPACE.md`. No browser tokens
are stored in localStorage. Authentication cache/session responses are not public data.

## Local development (PowerShell)

Prerequisites: the pinned Node/pnpm versions, Java 21, and Docker Desktop running.
The Maven wrapper pins Maven 3.9.9. Use `mvnw` instead of `mvnw.cmd` on Unix.

Set database credentials in the shell; choose your own password:

```powershell
$env:DATABASE_USER = 'lotuz'
$env:DATABASE_PASSWORD = '<your-local-database-password>'
docker compose -f infra/compose.yaml up -d --wait
```

In the backend terminal, retain those variables and set:

```powershell
$env:DATABASE_URL = 'jdbc:postgresql://localhost:5433/lotuz'
$env:INVENTORY_ORIGIN = 'http://localhost:3001'
$env:SESSION_COOKIE_SECURE = 'false' # local HTTP only
cd backend
.\mvnw.cmd spring-boot:run
```

In another terminal at repository root:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd dev:inventory
```

The shell runs at `http://localhost:3001`; the API at `http://localhost:8080`.
Use **localhost consistently**, not a mixture with 127.0.0.1, for session cookies.
Without provider configuration the application shows "Sign-in is not configured".
To exercise authenticated behavior, set the OIDC variables above and restart the
backend. `apps/inventory/.env.example` documents the public API origin override;
`NEXT_PUBLIC_API_URL` is baked into the frontend build and must never contain secrets.
Spring does not automatically load `backend/.env.example`; it is an environment reference.

For the preferred workflow, create a business in Workspace and use the idempotent
`activate-inventory.sql` script documented in `AUTH0_WORKSPACE.md`. The original
bootstrap below is retained for Phase 1 compatibility and creates a new business.

After an owner signs in once, an operator can look up their platform UUID in
`platform_user`/`external_identity` and provision a pilot workspace. From repository
root, replace the UUID/name and use the same database environment:

```powershell
Get-Content -Raw backend/scripts/provision-business.sql | docker compose -f infra/compose.yaml exec -T postgres psql -v ON_ERROR_STOP=1 -U $env:DATABASE_USER -d lotuz -v user_id='<platform-user-uuid>' -v business_name='Pilot store'
```

This operator-only transaction creates a business, owner membership, Inventory
entitlement, owner product grant and default location. It creates no passwords,
accounts or subscriptions with a payment provider. An unknown owner UUID causes
the transaction to fail. Re-running creates a separate business; it is not an upsert.

## Verification

- `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd format:check`
- `pnpm.cmd build` (marketing); `pnpm.cmd build:inventory`
- `pnpm.cmd test:e2e` (marketing); `pnpm.cmd test:inventory` after its build
- `cd backend; .\mvnw.cmd test` runs security/application tests using test-only H2.
- To exercise actual PostgreSQL/Flyway, target a **disposable test database** and
  set `TEST_DATABASE_URL` (JDBC), `TEST_DATABASE_USER`, `TEST_DATABASE_PASSWORD`,
  `TEST_MIGRATIONS=true`, `TEST_DDL=validate`, then run the same Maven tests.
  Tests clear their tables between methods: never point them at business data.
- If an IDE compiles into `backend/target` while Maven tests run, pass
  `-Dlotuz.build.directory=<absolute-path>/backend/.verify-target` (quote the
  whole argument in PowerShell). This ignored output directory isolates Maven
  classes from IDE compilation; it does not alter runtime configuration.
- CI supplies a disposable PostgreSQL service and runs Flyway-backed tests.

Backend tests cover unauthorized/disabled login, issuer isolation, tenant IDs,
membership and grant revocation, missing/disabled entitlements, staff management
denial, owner/admin management, CSRF and the exact CORS origin. Browser tests
stub API responses only to test shell states; they are not evidence of backend
authorization or a live managed-provider login. Actual provider callback, cookie
behavior behind a production proxy, TLS and hosting remain externally configured.

Phase 1 stops here. Catalog, stock engine, CSV, reports and additional products
require the next approved implementation scope.
