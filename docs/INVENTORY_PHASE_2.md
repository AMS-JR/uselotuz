# Lotuz Inventory - Phase 2: Catalog

Phase 2 adds catalog management only. It preserves the shared Identity, Business
and Access modules, Auth0/server-side sessions, Workspace and independent frontend
builds. No stock balances, movements, opening quantities, prices, purchasing,
recipes, reporting, billing or multi-location management are implemented.

## Implementation and ownership

`backend/.../inventory/catalog/` owns catalog controllers, application services,
DTOs, JPA entities/repositories, CSV handling and the measurement-unit enum.
It calls `AccessService` and `IdentityService` application contracts; it never
imports another module's entities or repositories. Every business-scoped operation
rechecks membership, entitlement, product grant and product permission. Product
OWNER/ADMIN can create/edit/archive/import; STAFF can read/search/export. Business
ownership alone does not override a STAFF product grant. All writes require CSRF.
CORS gains PUT for catalog editing, retaining exactly the existing approved origins.

Each item belongs to one business, with one optional category and one optional
primary supplier. Categories are flat. Supplier names are not unique (different
suppliers can have the same trading name). Category names and SKUs are trimmed
and case-insensitively unique per business. Barcodes are trimmed, case-sensitive
text, unique per business when present; they are not assumed to be GTINs. Empty
optional identifiers become null. Archived records retain names/SKUs/barcodes, so
identifiers cannot be reused accidentally. There is no physical deletion or restore
endpoint. Archive requests are idempotent and archived records cannot be edited.

Archiving categories/suppliers preserves existing associations; they remain
visible but cannot be assigned on new or edited items. To edit an item whose
reference is archived, select an active replacement or clear that reference.
Item writes lock selected references against concurrent archival. Unique database
constraints arbitrate concurrent identifier creation; conflicts return HTTP 409.
No product imports an Inventory entity; future stock operations must explicitly
reject archived items and treat items/references as Inventory-owned data.

## Schema and migration

`V2__inventory_catalog.sql` adds `inventory_item`, `inventory_category`, and
`inventory_supplier`, with UUID IDs, business IDs, archive flags and timestamps.
Composite foreign keys enforce same-business item/category/supplier references;
unique constraints enforce identifiers, including archived records. Business IDs
remain external platform identifiers, consistent with the Phase 1 location model.
No applied migration is changed, no platform table or location is replaced, and
no quantity column is added. Flyway applies V2 on backend startup; back up the
working database using your normal local process before first startup.

Catalog fields have bounded lengths: names/contact 200, descriptions/notes 2000,
SKU/barcode 100, email 254, phone 50, address 1000. Lists use page/size (maximum 100
items per page, default 25) and stable name/ID sorting. Category/supplier reference
lists are unpaginated for this MVP. API validation uses ProblemDetail responses;
CSV validation adds an `errors` array with logical CSV row numbers and messages.

## Units

API unit codes: PIECE (COUNT), GRAM/KILOGRAM (MASS), MILLILITER/LITER (VOLUME).
`MeasurementUnit` uses BigDecimal exclusively. Canonical units are pieces, grams
and milliliters, with factors 1 or 1000; items retain their selected base unit.
Compatible conversions must be exact to six decimal places; rounding is rejected.
Nonnegative values must fit NUMERIC(20,6), including the converted result. Pieces
must be whole numbers (trailing zero decimals are accepted). Future quantity APIs
must use decimal strings and quantity columns must use PostgreSQL NUMERIC(20,6).
There is no conversion HTTP endpoint or stored stock quantity in this phase.
Changing an item's unit is allowed now because no stock exists; the stock phase
must protect unit changes once movement history exists.

## API

All paths below are relative to `/api/businesses/{businessId}/inventory/catalog`.
All require authenticated, mapped OIDC identity plus Inventory access.

| Method/path                     | Purpose                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/items`                    | Search/filter/paginate; `q` (name/SKU/barcode), `type` PRODUCT/INGREDIENT, `categoryId`, `status` active/archived/all, `page`, `size` |
| GET `/items/{id}`               | Item details                                                                                                                          |
| POST `/items`                   | Create item (201)                                                                                                                     |
| PUT `/items/{id}`               | Replace editable item fields                                                                                                          |
| POST `/items/{id}/archive`      | Archive item (204)                                                                                                                    |
| GET/POST `/categories`          | List all statuses / create category                                                                                                   |
| PUT `/categories/{id}`          | Rename category                                                                                                                       |
| POST `/categories/{id}/archive` | Archive category                                                                                                                      |
| GET/POST `/suppliers`           | List all statuses / create supplier                                                                                                   |
| GET `/suppliers/{id}`           | Supplier details                                                                                                                      |
| PUT `/suppliers/{id}`           | Replace editable supplier fields                                                                                                      |
| POST `/suppliers/{id}/archive`  | Archive supplier                                                                                                                      |
| GET `/units`                    | Supported unit codes and dimensions                                                                                                   |
| GET `/template`                 | CSV header template                                                                                                                   |
| POST `/import`                  | Atomic create-only multipart CSV import (`file`)                                                                                      |
| GET `/export`                   | Entire current-business catalog, including archived items                                                                             |

Item JSON fields: `name`, `description`, `sku`, `barcode`, `itemType`, `unit`,
`categoryId`, `supplierId`. Name, itemType and unit are required. Optional references
are UUIDs or null. Category JSON: `name`. Supplier JSON: `name`, `contactPerson`,
`email`, `phone`, `address`, `notes`. Responses include IDs, archive flags and
created/updated timestamps. Item list response: `{items, total, page, size}`.
No endpoint accepts client ownership, permissions or stock quantities.

## CSV contract

UTF-8, optional BOM, comma-delimited, exact header order (case-sensitive):

```csv
name,description,sku,barcode,item_type,unit,category_id,supplier_id,status
Rice,White rice,RICE-01,000123,PRODUCT,KILOGRAM,,,active
```

Quoted commas, newlines and doubled quotes are supported. Row errors refer to
logical records (header = row 1), even if a quoted field spans physical lines.
Maximum 1 MiB/file and 1,000 data rows; multipart request maximum 2 MiB. Header-only
files, malformed quoting/UTF-8, extra columns, unknown units, invalid or foreign
reference IDs, archived references, duplicate SKUs/barcodes and duplicate normalized
records fail validation. Reference IDs must already exist; no category/supplier is
automatically created. Find IDs in category/supplier detail views or their APIs.
An empty category means uncategorized; an empty supplier means no primary supplier.

Imports are **create-only**: matching existing SKUs/barcodes (including archives)
produce row errors, never an update/overwrite. All rows are validated before saving;
any error rolls back the whole import. Concurrent database conflicts return 409
and also roll back the whole file. Success returns `{imported: N}`. Do not retry a
successful import as an upsert. All imported rows must have `status=active`.
Exports include archived records, so they are archival downloads, not an update or
restore mechanism; importing an unchanged export into the same business is rejected.
There is no opening-stock field; extra quantity columns are rejected.

Exports quote every field and prefix dangerous formula/control/whitespace prefixes
with an apostrophe. Numeric-leading values are also prefixed to protect leading
zeros and long SKU/barcode digits in spreadsheet applications. Import removes
one such protective prefix; an original leading apostrophe is escaped with another
apostrophe on export. CSV itself has no cell types: choose text columns in the
spreadsheet import dialog and do not remove protective prefixes from untrusted data.
Export is scoped to the selected business; current search filters do not limit it.

## Local startup

Keep the existing Auth0 and database environment from [AUTH0_WORKSPACE.md](AUTH0_WORKSPACE.md).
No new credentials, dependency install or infrastructure is required.
From repository root, with the existing DATABASE_USER/DATABASE_PASSWORD set:

```powershell
docker compose -f infra/compose.yaml up -d --wait
$env:DATABASE_URL = 'jdbc:postgresql://localhost:5433/lotuz'
# Keep the previously configured OIDC_* and local SESSION_COOKIE_SECURE=false.
cd backend
.\mvnw.cmd spring-boot:run
```

In separate repository-root terminals:

```powershell
pnpm.cmd dev:inventory # localhost:3001
pnpm.cmd dev:workspace # localhost:3002, optional for direct Inventory access
```

Existing local Auth0 credentials remain external and unchanged. V2 is applied
by Flyway on startup. Preserve the existing PostgreSQL volume; never use down -v.

## Verification and manual acceptance

Run `pnpm.cmd lint`, `pnpm.cmd typecheck`, `pnpm.cmd format:check`, all three
independent builds (`build`, `build:inventory`, `build:workspace`) and all three
browser suites (`test:e2e`, `test:inventory`, `test:workspace`). Backend:
`cd backend; .\mvnw.cmd verify`. For PostgreSQL-backed verification use a
**disposable** test database with TEST_DATABASE_URL/USER/PASSWORD,
TEST_MIGRATIONS=true and TEST_DDL=validate. Tests delete their fixture tables:
never target the working database. Existing CI already runs this matrix.

1. Sign in through the existing Auth0 tenant. Select an activated business as
   Inventory OWNER/ADMIN. Create a category and supplier, including contact data.
2. Add a product and ingredient, using different units. Test no category/supplier,
   optional SKU/barcode, leading zeros, required names and duplicate identifiers.
3. View/edit details; search name/SKU/barcode and filter type/category/status.
   Check desktop, tablet and mobile layouts and keyboard controls.
4. Archive/cancel archive for each record type. Confirm active lists hide archived
   records; status filters reveal them read-only. Archived references cannot be
   newly assigned and identifiers remain reserved.
5. Download the template, import a valid CSV, then try unknown units, invalid UUIDs,
   duplicates, mixed valid/invalid rows, archived records and an oversized file.
   Confirm errors name rows and no partial records appear. Export and inspect
   leading zeros, formula-like names and escaped commas/newlines safely as text.
6. Switch between two businesses: catalog/forms must reset and data remain isolated.
   Try foreign item/reference IDs and revoked memberships/entitlements/grants.
7. With STAFF access, verify read/search/export and absence of management controls;
   forged write requests must still receive 403. Missing CSRF must also receive 403.
8. Verify direct Inventory login, Workspace product navigation, logout and the
   marketing site continue working. Recheck persistence after backend restart.

Automated frontend tests use API fixtures, while backend tests enforce real
application permissions and PostgreSQL constraints. They do not replace a manual
catalog smoke test using the user's live Auth0 tenant. Production remains deferred.
Phase 3 is not authorized by this change.

## Dashboard and navigation improvement (still Phase 2)

Inventory now uses a persistent authenticated application layout with app-owned
branding, a compact business switcher, an account disclosure menu and sidebar
navigation. On mobile the Menu button expands navigation; choosing a page closes
it. The marketing site and Workspace retain their independent layouts and builds.

| Route            | Purpose                                                               |
| ---------------- | --------------------------------------------------------------------- |
| `/`              | Catalog overview and quick actions                                    |
| `/items`         | Searchable, filtered, paginated item table and create/view/edit forms |
| `/categories`    | Flat category management                                              |
| `/suppliers`     | Supplier management                                                   |
| `/import-export` | Existing CSV template/import/export workflows                         |
| `/settings`      | Current business details and the existing default-location rename     |

Each route carries `?businessId=<uuid>`. Existing Workspace links to
`/?businessId=<uuid>` still work and take priority over browser preferences.
Navigation and switches preserve the destination page but discard old-business
forms, filters, selected files and cached page data. Responses from cancelled
requests cannot populate the new business. Item tables scroll within a labelled,
keyboard-focusable region on small screens rather than widening the page.

### Automatic business selection

The frontend reads `/api/me` for the authenticated platform user ID and
`/api/businesses` for memberships. For each membership it checks the existing
`/products` endpoint and offers only businesses whose Inventory product is
accessible. Before rendering a business, `/inventory` rechecks current access and
provides the product role/location. The ordering is:

1. An accessible explicit business ID in the URL (including Workspace links).
2. The user's last-used accessible business.
3. The accessible business with the lexically smallest UUID (stable across list
   order changes or business renames).

The optional browser preference key is `lotuz.inventory.business.<platformUserId>`.
It stores only a business UUID, not names, credentials or an access decision.
Blocked/full storage falls back to automatic selection. Every entry revalidates
access through the backend. Invalid/inaccessible preferences are discarded;
explicit inaccessible links show a notice and fall back to an available business.
A 403 removes stale content, refreshes available businesses and chooses a fallback;
a 401 clears protected content and returns to sign-in. No businesses are deleted.
The no-access state links to Lotuz Workspace and explains activation requirements.

Signing out clears protected content and the in-memory selection, using the
unchanged CSRF-protected shared backend/provider logout. The user-scoped UUID
preference remains so the same user can resume after signing in again; it is
revalidated before use. Other users' preferences are never read. Tab focus rechecks identity/access without discarding in-progress work when
the same user/business remains authorized. Request-time checks remain authoritative;
there is no promise of instantaneous cross-tab revocation before a server check.
If temporarily denied access is restored, use Refresh access or reload.

`NEXT_PUBLIC_WORKSPACE_URL` configures Workspace links; default is
`http://localhost:3002`. Set the approved HTTPS Workspace URL for hosted builds.
Like NEXT_PUBLIC_API_URL, this is public build-time configuration, never a secret.
Login return destinations retain the known page and a valid UUID business hint;
backend redirect validation and Auth0 configuration remain unchanged.

### Authorized catalog summary

`GET /api/businesses/{businessId}/inventory/catalog/summary` requires the same
VIEW permission as catalog reads (including STAFF). It returns:

```json
{
  "activeItems": 0,
  "categories": 0,
  "suppliers": 0,
  "products": 0,
  "ingredients": 0,
  "recentItems": []
}
```

All counts exclude archived records. Products/ingredients are the active-item
breakdown; recentItems contains at most six active ItemView records ordered by
updatedAt descending, then ID ascending. Database aggregates and a bounded recent
query avoid downloading the full catalog. The overview reloads on entry and
business changes, with explicit loading/error/empty states. It displays no stock,
low-stock, valuation or sales metrics. No new table, migration or dependency is
needed. Existing CRUD/CSV endpoints and permission rules remain unchanged.

### Dashboard manual acceptance

1. Enter directly with one accessible business: Overview opens automatically.
   With multiple businesses, switch, revisit `/`, and confirm restoration. Confirm
   another signed-in account cannot inherit that selection. Block browser storage
   and confirm Inventory still opens with a deterministic default.
2. Open Inventory from Workspace for a different authorized business: its explicit
   ID must win over the stored selection. Try an inaccessible/stale ID and confirm
   a clear notice, safe fallback and no unauthorized business option/data.
3. Navigate all six pages, refresh each route, and use Back/Forward. The current
   business must stay consistent with the URL. On mobile, check Menu, account
   disclosure and the business switcher using touch and keyboard.
4. Add/edit/archive products, ingredients, categories and suppliers. Verify the
   item table search, filters and pagination; use the table's horizontal scroll on
   mobile. Switch businesses with an open form: old values and results must clear.
5. On Import / Export, test template download, CSV errors, successful atomic import
   and export. Switch with a file selected; the next business must have no file
   selected. Verify CSV controls are absent from Items and reference pages.
6. Confirm Overview counts/breakdown/recent items against active catalog records.
   Create/edit/archive records and return to Overview. Test empty and backend-error
   states; quick actions should appear only for OWNER/ADMIN.
7. Verify STAFF can browse/export but cannot mutate or rename a location. Test an
   OWNER/ADMIN location rename in Settings and its success feedback. No new settings
   are offered. Revoke membership, entitlement or a product grant and confirm the
   next protected request clears the old context and refreshes/falls back safely.
8. Sign out from the account menu and verify the existing shared-session logout;
   check direct login returns to its page/business. Repeat live Auth0 acceptance
   locally; automated browser tests use API fixtures, not a live provider.

These changes improve Phase 2 UX only. Stock workflows and Phase 3 remain deferred.

## UI consistency and overview troubleshooting

Inventory's header uses the unchanged app-owned lotus as an icon-only link to the selected business overview, beside the business switcher. Accessible product identity and browser metadata remain intact. The shared profile avatar shows available OIDC display information and retains CSRF-protected session logout. Workspace has its own business-focused navigation; it does not duplicate the catalog dashboard.

`GET /api/businesses/{businessId}/inventory/catalog/summary` returns real counts and recent items. An empty authorized catalog returns HTTP 200, zero counts and an empty recent-items list. The UI then offers Add item and Import CSV. Genuine failures, including a missing route, remain errors; the UI never substitutes fake zero statistics.

A reported local HTTP 404 for this path means the running API is not serving the route; empty catalog data does not cause this response. The current backend source already defines the endpoint. Restart/rebuild the intended backend with its existing database and Auth0 environment (from `backend`, run `.\mvnw.cmd spring-boot:run`, or restart the IDE Spring Boot run configuration). Confirm Inventory's `NEXT_PUBLIC_API_URL` points to that backend. Restart the frontend development server or rebuild if its public API URL changes. Do not change authentication, seed dummy data or recreate database volumes to resolve this route mismatch.

Manual checks after restart: empty and populated catalogs, Owner/Admin/Staff access, switching and restored businesses, revoked access, direct Workspace links, catalog create/edit and CSV import/export, desktop/mobile navigation and shared logout. No Phase 3 stock functionality, dependencies or database migrations were added by this UI pass.
