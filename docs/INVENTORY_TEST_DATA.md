# Inventory test data

The development-only generator populates **one existing, empty test business** in the repository's local PostgreSQL development database. It does not create a business, user, database, container, backend, frontend or identity. It runs only when explicitly invoked and requires interactive confirmation.

Before running it:

- Start the existing PostgreSQL 18 service using `infra/compose.yaml`. The script accepts only that Compose service bound to `127.0.0.1:5433` and the local `lotuz` database. Remote databases and production profiles are refused.
- Choose an existing disposable business whose name contains the separate word **Test**, such as `Inventory Test Store`. Inventory must already be enabled and its default location provisioned. The business must have no items, categories, suppliers, movements, thresholds, reorder plans or stock counts, including archived records.
- Choose an existing user with an active membership and an active Inventory **Owner** or **Admin** grant for that business. Set `DATABASE_USER` and `DATABASE_PASSWORD` in your shell using your usual local development credentials; do not put passwords in the command, source control or chat. If `DATABASE_URL` is set, it must be `jdbc:postgresql://localhost:5433/lotuz` or `jdbc:postgresql://127.0.0.1:5433/lotuz`.
- Do not use the selected business in the application while generation is running. Other businesses are not modified.

From the repository root, replace both UUIDs with the selected business and authorized user:

```sh
bash scripts/generate-inventory-test-data.sh --business BUSINESS_UUID --user USER_UUID --seed 42
```

The command asks you to type the business UUID before making changes. It validates the target, permissions, location and empty inventory; a repeat run is refused. Catalog and stock changes are made in one transaction through existing services, and an error rolls them back. Flyway is disabled and Hibernate only validates the existing schema for this invocation.

The seed controls the quantities and movement choices; product names, SKUs and units follow a fixed catalog. Entity IDs and timestamps vary. The result is 500 products across ten categories and suppliers, with exactly 500 opening balances, 800 receipts, 700 consumptions and 500 adjustments. Fifty items are out of stock and fifty are low stock; all 100 qualify for reorder planning. No prices are generated because the catalog does not support them.

The generator verifies movement counts, ledger balances, alerts, reorder suggestions and report totals before committing. Run the separate `InventoryTestDataSafetyTest` unit test to check target safeguards without generating data; tests using mocks do not prove that a particular business is empty or safe to populate.
