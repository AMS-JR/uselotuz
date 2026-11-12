# Lotuz — Auth0 and Workspace

This extends the approved Inventory Phase 1 foundation. Workspace is a tenant and
product administration frontend, not a required gateway to Inventory.
**Live Auth0 authentication is not verified.** Automated OAuth tests use a local
test provider with signed test tokens; browser tests use API fixtures.
No production deployment or DNS changes are part of this work.

## Applications and ownership

| Address                                  | Responsibility                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `uselotuz.io` / localhost:3000           | Existing public marketing site; independent static build                 |
| `auth.uselotuz.io`                       | Future Auth0 Universal Login custom domain; no separate auth frontend    |
| `workspace.uselotuz.io` / localhost:3002 | Business creation/selection, settings, membership and product navigation |
| `inventory.uselotuz.io` / localhost:3001 | Independently accessible Inventory shell                                 |
| `api.uselotuz.io` / localhost:8080       | Existing modular Spring Boot backend and session owner                   |
| `pos.uselotuz.io`                        | Future product only; no application or functionality added               |

One Auth0 **Regular Web Application** represents the current confidential backend.
The frontends have no Auth0 SDK, client secret or provider tokens. They make
credentialed requests to the same API. Identity, Business and Access remain
platform modules; Inventory owns its location and domain data. A business and a
workspace are the same tenant, represented by the existing `business` table.

No schema migration or duplicate identity, membership or entitlement tables is
needed. The original V1 migration remains unchanged. Product metadata currently
describes only Inventory; adding another application requires a separate scope.

## Backend contracts

All protected routes require an enabled, configured provider and an authenticated,
mapped OIDC user. Unknown accounts are mapped by **issuer + subject**, never email.
Signup/login creates a user mapping only, not a business, grant or entitlement.

| Route                                                      | Access and behavior                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /api/auth/config`                                     | Public enabled flag; no credentials                                                      |
| `GET /api/auth/csrf`                                       | Public session-bound CSRF token                                                          |
| `GET /oauth2/authorization/lotuz?app=workspace&returnTo=/` | Universal Login start; `app` can be `workspace` or `inventory`                           |
| Same route plus `screen_hint=signup`                       | Opens Auth0 signup                                                                       |
| `GET /login/oauth2/code/lotuz`                             | Existing Spring OAuth callback                                                           |
| `POST /api/auth/logout?app=workspace`                      | CSRF-protected local logout; 204 plus exposed `Location` for top-level provider logout   |
| `POST /api/auth/logout`                                    | Preserved Phase 1 local-only 204 logout contract                                         |
| `GET /api/me`                                              | Current mapped user ID and display name                                                  |
| `GET /api/businesses`                                      | Current user's active memberships only                                                   |
| `POST /api/businesses`                                     | Creates business and OWNER membership in one transaction; body `{"name":"Corner store"}` |
| `GET /api/businesses/{id}`                                 | Active member; own business role and management capability                               |
| `PATCH /api/businesses/{id}`                               | Business OWNER/ADMIN; validates name, requires CSRF                                      |
| `GET /api/businesses/{id}/members`                         | OWNER/ADMIN see active members; STAFF sees only their membership                         |
| `GET /api/businesses/{id}/products`                        | Member; activation status and current user's product accessibility                       |
| Existing Inventory GET/PATCH routes                        | Membership + active entitlement + active product grant + product permission              |

Creating a business activates **no products** and creates no Inventory location.
The server chooses the creator's OWNER membership from the authenticated identity;
request bodies cannot choose another owner or grant a product entitlement.
Business management uses business roles; Inventory operations use product roles.
A business owner with a STAFF Inventory grant cannot perform Inventory management.

There is no customer activation endpoint. Available-product cards explain that
Lotuz approval is required. An activated product is not necessarily accessible to
every member. Only an active user grant produces an Inventory navigation link.
Inventory rechecks access when the link is opened; a business UUID in a URL is
a selection hint, never an authorization credential.

## Auth0 dashboard setup (requires your tenant)

1. Create/select one **Regular Web Application** in the intended Auth0 tenant.
2. Enable **Universal Login** and the intended connection. Enable signup on the
   database connection if customers should create accounts. Password storage,
   reset, verification emails and recovery remain Auth0 responsibilities.
3. Enable Authorization Code grant and use confidential client authentication
   `client_secret_basic` (the dashboard may label it **Basic**).
4. Set **Allowed Callback URLs** to
   `http://localhost:8080/login/oauth2/code/lotuz` for local development.
5. Set **Allowed Logout URLs** to these exact values (including final slash):
   `http://localhost:3001/`, `http://localhost:3002/`.
6. Ensure **RP-Initiated Logout End Session Endpoint Discovery** is enabled in
   tenant advanced login/logout settings. New tenants usually enable it already.
   Startup rejects discovery without a logout endpoint on the issuer origin.
7. Copy the exact issuer (including trailing slash), client ID and client secret
   into the backend process environment. Do not paste secrets into frontend files,
   source control, logs, screenshots or chat.
8. No browser Auth0 SDK, wildcard origins, Auth0 Management API client, API audience,
   Auth0 Organizations, or Auth0-managed application roles are needed for this
   implementation. API CORS is configured in Spring, not by adding wildcard Auth0
   Allowed Web Origins.
9. Register the separate approved HTTPS API callback and frontend logout URLs
   when production hosting is selected. Local dashboard settings are not proof
   of a production configuration.

Sources: [application settings](https://auth0.com/docs/get-started/applications/application-settings),
[Universal Login signup](https://auth0.com/docs/authenticate/login/auth0-universal-login/universal-login-vs-classic-login/universal-experience),
[OIDC logout](https://auth0.com/docs/authenticate/login/logout/log-users-out-of-auth0).

## Local startup (Windows PowerShell)

Use the pinned Node/pnpm versions and Java 21. Keep the existing PostgreSQL
credentials and volume: changing the initialization password in Compose does
not change an already initialized database user's password.

From repository root, in the backend terminal:

```powershell
$env:DATABASE_USER = '<existing-local-database-user>'
$env:DATABASE_PASSWORD = '<existing-local-database-password>'
$env:DATABASE_URL = 'jdbc:postgresql://localhost:5433/lotuz'
$env:API_ORIGIN = 'http://localhost:8080'
$env:INVENTORY_ORIGIN = 'http://localhost:3001'
$env:WORKSPACE_ORIGIN = 'http://localhost:3002'
$env:SESSION_COOKIE_SECURE = 'false' # local HTTP only

# Leave false to check the safe unconfigured state.
$env:OIDC_ENABLED = 'false'
docker compose -f infra/compose.yaml up -d --wait

# Set these only after completing the Auth0 dashboard steps.
$env:OIDC_ISSUER = 'https://YOUR_TENANT.REGION.auth0.com/'
$env:OIDC_CLIENT_ID = '<Auth0-Regular-Web-Application-client-id>'
$env:OIDC_CLIENT_SECRET = '<Auth0-client-secret>'
$env:OIDC_ENABLED = 'true'

cd backend
.\mvnw.cmd spring-boot:run
```

`backend/.env.example` is reference material, not automatically loaded by Spring.
If you have not configured Auth0 yet, omit the final OIDC assignments and leave
authentication disabled. Missing/partial settings or discovery failure never
enable anonymous access.

In separate terminals at repository root:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd dev:workspace # http://localhost:3002
```

```powershell
pnpm.cmd dev:inventory # http://localhost:3001
```

```powershell
pnpm.cmd dev # optional marketing site, http://localhost:3000
```

The API remains on 8080; PostgreSQL remains on host 5433, container 5432.
Compose's existing service and named volume are unchanged. Do not use
`docker compose down -v` to restart this setup. Use localhost consistently;
cookies are host-scoped, not port-scoped, so mixing localhost and 127.0.0.1
breaks local session assumptions.

Both frontends default to `http://localhost:8080`. Override their public
`NEXT_PUBLIC_API_URL` through the frontend environment if needed. This value is
baked into builds and contains no credentials.

## Operator-approved Inventory activation

After a user creates a business in Workspace, obtain its business ID and the
active owner's platform user ID from the membership view. An operator with
database access reviews the request and runs this from repository root, with
the existing database variables set:

```powershell
Get-Content -Raw backend/scripts/activate-inventory.sql | docker compose -f infra/compose.yaml exec -T postgres psql -v ON_ERROR_STOP=1 -U $env:DATABASE_USER -d lotuz -v business_id='<business-uuid>' -v user_id='<active-owner-platform-uuid>'
```

The script locks the business and active OWNER membership, validates that owner,
then atomically activates the Inventory entitlement, creates an initial OWNER
product grant if absent, and provisions the default location if absent.
Failure rolls back the transaction. Concurrent/repeated calls do not duplicate
records, rename locations, replace IDs, change existing roles or undo a user's
revoked product grant. Running the script explicitly reactivates the business's
Inventory entitlement; that is an operator approval, not a customer action.

Existing businesses, grants, location names and other products are preserved.
No Staff/Admin can execute this through an HTTP endpoint. SQL access is a trusted
operator capability, not an application permission. The original
`provision-business.sql` remains a legacy Phase 1 bootstrap that creates a new
business each time; use Workspace plus the idempotent activation script for
this workflow. An existing revoked grant requires a separate deliberate operator
decision; repeating activation does not silently restore it.

## Production sessions, cookies and proxy requirements

Production compatibility remains **unverified**. Before deployment, use:

- `API_ORIGIN=https://api.uselotuz.io`
- `INVENTORY_ORIGIN=https://inventory.uselotuz.io`
- `WORKSPACE_ORIGIN=https://workspace.uselotuz.io`
- `SESSION_COOKIE_SECURE=true` and the approved Auth0 issuer/client settings.
- Callback `https://api.uselotuz.io/login/oauth2/code/lotuz`.
- Exact allowed logout URLs `https://inventory.uselotuz.io/` and
  `https://workspace.uselotuz.io/`.

Spring owns `LOTUZ_SESSION` on the **API host only**, with Path=/, HttpOnly,
Secure and SameSite=Lax. Do not set Domain=.uselotuz.io. Both HTTPS frontends make
`credentials: include` requests to the same API, which receives its own cookie.
These are different origins but the same schemeful site under uselotuz.io.
CORS allows exactly those configured frontend origins, with credentials and the
CSRF header; the marketing origin and wildcard subdomains are not authorized.

A frontend served from a provider preview domain such as pages.dev/vercel.app
is cross-site to api.uselotuz.io. Lax cookies do not support that arrangement.
Do not infer production support from localhost ports or loosen cookies/CORS to
make arbitrary previews work. Use approved same-site HTTPS preview domains or
make a separate reviewed authentication decision.

The reverse proxy must terminate valid HTTPS and preserve the public API host,
path, query and HTTP methods for /api, /oauth2 and /login/oauth2/code/lotuz. Do
not cache authentication responses, private API responses, redirects or cookies.
Do not rewrite Set-Cookie to a parent-domain cookie or strip credentialed CORS
headers. Restrict the Java listener to trusted ingress; sanitize client-supplied
Forwarded/X-Forwarded-* headers at that ingress.

Keep verbose HTTP body/security logging disabled around credential and token exchanges.

Forwarded-header interpretation defaults to **none**. The OAuth callback is built
from explicit validated API_ORIGIN, not an untrusted Host/Forwarded header.
If the selected proxy requires Spring to interpret forwarded headers, set
`SERVER_FORWARD_HEADERS_STRATEGY=framework` only behind that trusted, sanitizing
ingress; verify redirects and secure-cookie behavior through the actual HTTPS
proxy. Do not enable trust globally on an internet-exposed Java listener.

Sessions are currently in memory: restart logs users out. Multiple backend
replicas require an approved session strategy before deployment. There is no
persistent session store, load-balancer configuration or production host added.

## Redirect and logout behavior

Login accepts only configured application identifiers and conservative local
paths. Encoded paths, protocol-relative URLs, backslashes, dot segments, fragments
and control characters are rejected. Requests use Spring S256 PKCE support.
Spring stores the destination alongside its
OAuth state in the session; callback query parameters cannot change it. State is
single-use. One pending login per browser session follows Spring's existing
authorization-request repository; starting another login may invalidate an earlier
tab's pending request. Retry login in that tab if necessary.

The frontend's CSRF-protected logout clears the shared backend session first,
then follows the returned Location at top level to Auth0. That URL carries only
client ID, a session hint when available, and an exact allowed logout destination.
It never returns an ID/access/refresh token to JavaScript. Auth0 may display a
logout consent prompt when no session hint is available. If provider navigation
fails, local access is still ended. Logging out affects both frontends using
this API session; other tabs clear access on their next protected request.
It does not promise logout from Google/other upstream identity providers, other
devices, or all future independently authenticated services.

Auth0 plan check on 2026-11-11: its public comparison lists **Cross APP SSO**
outside Free/Essentials and included on Professional/Enterprise. One custom
domain is listed on Free, with credit-card verification. The current single
backend/client session design is not a guarantee that Auth0 licenses the whole
ecosystem on Free. Confirm actual tenant entitlements and intended usage with
Auth0 before making a production SSO promise. No plan upgrade is performed.
See [Auth0 pricing](https://auth0.com/pricing).

The custom auth domain is deferred. Changing from a tenant issuer to a custom
domain can change issuer-based identity keys: plan that transition explicitly.
Do not merge accounts by email or silently create replacement production users.

## Automated checks

```powershell
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd format:check
pnpm.cmd build
pnpm.cmd build:inventory
pnpm.cmd build:workspace
pnpm.cmd test:e2e
pnpm.cmd test:inventory
pnpm.cmd test:workspace
cd backend
.\mvnw.cmd verify
```

Browser test servers use ports 3100 (marketing), 3101 (Inventory), and 3102
(Workspace), separate from development. Workspace tests do not require Inventory
or the marketing site to be running.

Maven defaults to test-only H2. Database-constraint rollback and activation-script tests require disposable
PostgreSQL and are skipped on H2. For PostgreSQL-backed verification, set
TEST_DATABASE_URL (JDBC), TEST_DATABASE_USER, TEST_DATABASE_PASSWORD,
TEST_MIGRATIONS=true and TEST_DDL=validate before running Maven.
**Tests delete test tables: never use the working business database.**

Tests cover signed OIDC callback validation, OAuth state, redirects, signup,
shared sessions, logout, unauthorized access, business isolation, role checks,
CSRF/CORS, neutral business creation, rollback and actual operator SQL
idempotency/concurrency. This remains separate from live Auth0 verification.

## Manual end-to-end acceptance (pending your tenant)

1. Without OIDC configured, check both frontends show sign-in unavailable and
   protected API requests receive no data. Partially enabled configuration must
   fail startup rather than allowing access.
2. Configure the Auth0 client above and restart the backend. Open Workspace in a
   private browser, choose Create an account, and complete Auth0 signup/login.
3. Confirm you return to Workspace, see your display name and no unrelated
   businesses. Create a business; confirm your OWNER membership and that
   Inventory is **not activated**, with no Open Inventory link.
4. Create a second business and switch between them. Rename one; verify the other
   is unchanged. Reload to confirm persistence.
5. Have an operator run the activation command for the first business. Refresh
   Workspace: Inventory becomes accessible. The other business remains inactive.
   Repeat activation and verify no duplicate/default-reset behavior.
6. Open Inventory from Workspace. Confirm the intended business and default
   location are selected. No second application-specific login should be needed
   while the shared API session is valid; validate this with your tenant/plan.
7. Sign out. Open Inventory directly at localhost:3001 in a new private browser.
   Sign in there and confirm return to Inventory, without a Workspace visit.
   Repeat with /?businessId=<authorized-business-uuid>.
8. In separate browser profiles, test two users/businesses. Change a business UUID
   in GET/PATCH requests: a non-member receives 403 and no other business data.
   Use properly operator-provisioned STAFF/ADMIN grants to test their permissions;
   do not introduce a development authentication bypass or self-grant UI.
9. With real test memberships, verify STAFF can view Inventory but cannot rename
   its location or edit business settings. Disable a grant/entitlement or revoke
   membership through a trusted operator and confirm the next request is denied.
10. Inspect developer tools: API session cookie is HttpOnly, tokens/secrets are
    absent from application JavaScript/storage/API payloads. Local HTTP has
    Secure=false only because it was explicitly configured.
11. Attempt writes without a CSRF token or with another session's token: 403.
    Attempt login with an unknown app or external returnTo: no external redirect.
12. Keep both frontends open; sign out from either. Confirm backend access ends,
    Auth0 logout completes, and the other app receives 401 on its next request.
    Check session expiry and backend restart; existing sessions must not survive.
13. Before production, repeat through real HTTPS subdomains and the selected proxy:
    verify secure host-only cookies, exact redirects, CORS/preflight, CSRF, logout,
    session affinity/persistence decisions and cache controls. Local HTTP checks
    do not satisfy this production acceptance.

Stop here. Inventory catalog/stock, POS, billing and deployment remain excluded.
