# Lotuz — Product Roadmap

## Vision and customers

Lotuz provides focused, independently usable SaaS products for convenience stores, mini-markets, independent grocers, small retailers, independent restaurants, takeout businesses and small cafés. The parent website helps customers discover products; shared accounts and optional integrations can come as the platform develops.

## Portfolio and status

The main brand is **Lotuz**, with its website at `uselotuz.io`. The first product
name is **Lotuz Inventory**, with `inventory.uselotuz.io` reserved in the planned
domain structure. UseLotuz refers to the domain/repository identity. Future names
such as Lotuz POS, Lotuz Invoicing and Lotuz CRM follow the brand prefix without
changing the roadmap or authorizing new applications.

| Product | Customer job | Status |
| --- | --- | --- |
| Lotuz main website | Discover and learn about products | Deployed to Cloudflare Pages |
| Lotuz Inventory | Track stock and plan reorders | **Selected MVP; Phase 1 access foundation implemented** |
| Lotuz Restaurant Food Cost & Menu Pricing | Calculate ingredient/recipe cost and prices | Future candidate |
| Lotuz Daily Sales & Profit Tracker | Review itemized sales and margins | Future candidate |
| Lotuz Supplier Price Tracker | Compare supplier prices | Future |
| Lotuz AI Marketing Assistant | Draft promotional content | Future |
| Lotuz Social Media Scheduler | Schedule approved posts | Future |
| Lotuz Review Reply Helper | Draft responses to reviews | Future |
| Lotuz Waste Tracker | Record spoilage and waste | Future |

**Only one SaaS MVP is being built initially: Lotuz Inventory.** It supports retail
products and restaurant ingredients independently of POS and Food Cost. Continue
customer validation while building; selection is not proof of market demand.
Phase 1 is restricted to the shared platform/access foundation and Inventory shell.
See `INVENTORY_PHASE_1.md` and `AUTH0_WORKSPACE.md`. The approved platform extension
adds Auth0 and a lightweight central Workspace, with product-neutral business creation
and operator-approved Inventory activation. Catalog, stock, CSV and reporting remain subsequent work.

## Phase 1 — Foundation and website

- Finalize lean project documentation and repository.
- Scaffold only the applications and shared packages currently needed.
- Build the main product-directory website and reusable design foundation.
- Test locally, then configure Cloudflare Pages and connect the domain when approved.

**Exit:** Main website builds and can be demonstrated or deployed without requiring all future SaaS products.

## Phase 2 — Validate and build one MVP

Validate workflows with retail and restaurant owners while developing Inventory.
Manual entry comes first; prioritize CSV import/export early. POS reports are a
future integration input, not a prerequisite for using Inventory.

The Inventory sequence is: business/user access, products and ingredients with units, manual stock receiving and adjustments, auditable movements, early CSV import/export, low-stock views and reorder lists, then basic reporting. POS sales imports are optional later integrations; don't assume revenue-only exports can update inventory.

**Exit:** An owner completes one core workflow reliably using representative or real data.

## Phase 3 — Pilot

Test with owners, fix usability and security issues, validate willingness to pay, improve onboarding and add billing when a paid pilot is ready. Working target: **3–5 paying pilot customers**, not a guarantee.

## Phase 4 — Improve based on use

Prioritize retention, reliability, mobile usability, reporting and requested integrations based on evidence. Do not add complex integrations or AI features solely because they are technically possible.

## Phase 5 — Expand selectively

Consider a second independent SaaS only after the first shows repeat use and demand. Future possibilities include shared subscriptions, optional product data connections, POS APIs, analytics, PWAs and AI assistance.

## Open product decisions

- Which store/restaurant owners will test the prototype?
- Which POS item-level exports are actually available?
- What initial pricing and onboarding promise will be tested?
- When does evidence justify building another product?

Technology and hosting decisions are maintained in `ARCHITECTURE.md`, not repeated here.
