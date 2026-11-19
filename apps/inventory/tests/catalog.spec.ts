import { test, expect, type Page } from "@playwright/test";
import {
  A,
  B,
  mockInventory,
  navigate,
  emptySummary,
} from "./fixtures/inventory";

type RecordData = Record<string, unknown> & {
  id: string;
  name: string;
  archived: boolean;
};
async function setup(page: Page, role = "ADMIN") {
  await mockInventory(page, { role });
  const data: Record<string, RecordData[]> = {
    items: [],
    categories: [],
    suppliers: [],
  };
  const otherData: Record<string, RecordData[]> = {
    items: [],
    categories: [],
    suppliers: [],
  };
  const requests: { method: string; path: string; body: unknown }[] = [];
  let revoked = false;
  await page.route("**/inventory/catalog/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (revoked) return route.fulfill({ status: 403 });
    if (!path.includes("/catalog/")) return route.fulfill({ status: 404 });
    const tail = path.split("/catalog/")[1];
    const [resource, id, action] = tail.split("/");
    const records = path.includes(`/businesses/${A}/`) ? data : otherData;
    if (resource === "summary") return route.fulfill({ json: emptySummary });
    if (["export", "template"].includes(resource))
      return route.fulfill({
        contentType: "text/csv",
        body: "name,description,sku,barcode,item_type,unit,category_id,supplier_id,status\r\n",
      });
    if (resource === "import")
      return route.fulfill({
        status: 400,
        json: {
          detail: "No records imported.",
          errors: [{ row: 3, message: "Duplicate SKU in this file" }],
        },
      });
    if (!records[resource]) return route.fulfill({ status: 404 });
    if (request.method() !== "GET") {
      expect(request.headers()["x-csrf-token"]).toBe("session-token");
      const body = action
        ? null
        : (request.postDataJSON() as Record<string, unknown>);
      requests.push({ method: request.method(), path, body });
      if (action === "archive") {
        records[resource].find((row) => row.id === id)!.archived = true;
        return route.fulfill({ status: 204 });
      }
      if (id)
        Object.assign(
          records[resource].find((row) => row.id === id)!,
          body,
        );
      else
        records[resource].push({
          ...body,
          id: String(records[resource].length + 1),
          name: String(body!.name),
          archived: false,
          createdAt: "2026-11-11T12:00:00Z",
          updatedAt: "2026-11-11T12:00:00Z",
        });
      return route.fulfill({
        status: id ? 200 : 201,
        json: records[resource].at(-1),
      });
    }
    if (resource !== "items") return route.fulfill({ json: records[resource] });
    const filtered = records.items.filter(
      (row) =>
        (url.searchParams.get("status") === "all" ||
          row.archived === (url.searchParams.get("status") === "archived")) &&
        (!url.searchParams.get("q") ||
          `${row.name} ${row.sku} ${row.barcode}`
            .toLowerCase()
            .includes(url.searchParams.get("q")!.toLowerCase())) &&
        (!url.searchParams.get("type") ||
          row.itemType === url.searchParams.get("type")) &&
        (!url.searchParams.get("categoryId") ||
          row.categoryId === url.searchParams.get("categoryId")),
    );
    return route.fulfill({ json: { items: filtered, total: filtered.length } });
  });
  await page.goto("/items");
  await expect(
    page.getByRole("heading", { name: "Items", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Loading catalog...")).toHaveCount(0);
  return {
    data,
    requests,
    revoke: () => {
      revoked = true;
    },
  };
}

test("manage categories, suppliers and item details, then search and archive", async ({
  page,
}) => {
  test.setTimeout(60000);
  const { requests } = await setup(page);
  await navigate(page, "Categories");
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Dry food");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dry food", exact: true }),
  ).toBeVisible();
  await navigate(page, "Suppliers");
  await page.getByRole("button", { name: "Add supplier", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Local supplier");
  await page.getByLabel("Email", { exact: true }).fill("hello@example.com");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Local supplier", exact: true }),
  ).toBeVisible();
  await navigate(page, "Items");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  const form = page.getByRole("form", { name: "Add item" });
  await form.getByRole("button", { name: "Save", exact: true }).click();
  expect(
    await form
      .getByLabel("Name", { exact: true })
      .evaluate((input: HTMLInputElement) => input.validity.valueMissing),
  ).toBe(true);
  await form.getByLabel("Name", { exact: true }).fill("Rice");
  await form.getByLabel("SKU", { exact: true }).fill("001");
  await form.getByLabel("Barcode", { exact: true }).fill("00001");
  await form
    .getByRole("combobox", { name: "Base unit", exact: true })
    .selectOption("KILOGRAM");
  await form
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("1");
  await form
    .getByRole("combobox", { name: "Primary supplier", exact: true })
    .selectOption("1");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Rice", exact: true }),
  ).toBeVisible();
  expect(requests.at(-1)?.body).toMatchObject({
    sku: "001",
    barcode: "00001",
    categoryId: "1",
    supplierId: "1",
    unit: "KILOGRAM",
  });
  await page.getByLabel("Actions for Rice", { exact: true }).click();
  await page.getByRole("button", { name: "Edit Rice", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Brown rice");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Brown rice", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search items", { exact: true }).fill("missing");
  await expect(page.getByText("No items found", { exact: true })).toBeVisible();
  await page.getByLabel("Search items", { exact: true }).fill("001");
  await expect(
    page.getByRole("cell", { name: "Brown rice", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Actions for Brown rice", { exact: true }).click();
  await page
    .getByRole("button", { name: "Archive Brown rice", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Brown rice", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Actions for Brown rice", { exact: true }).click();
  await page
    .getByRole("button", { name: "Archive Brown rice", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm archive", exact: true })
    .click();
  await expect(page.getByText("No items found", { exact: true })).toBeVisible();
  await page
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("archived");
  await page.getByLabel("Actions for Brown rice", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "View Brown rice", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: test.info().outputPath("catalog.png"),
    fullPage: true,
  });
});

test("staff can view but cannot manage or import", async ({ page }) => {
  await setup(page, "STAFF");
  await expect(
    page.getByText("View-only access", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add item", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Import CSV", exact: true }),
  ).toHaveCount(0);
  await navigate(page, "Import / Export");
  await expect(
    page.getByRole("button", { name: "Export catalog", exact: true }),
  ).toBeVisible();
  await navigate(page, "Categories");
  await expect(
    page.getByRole("button", { name: "Add category", exact: true }),
  ).toHaveCount(0);
});

test("CSV import displays row errors and export downloads a catalog", async ({
  page,
}) => {
  await setup(page);
  await navigate(page, "Import / Export");
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({
    name: "items.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name\nRice"),
  });
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Row 3: Duplicate SKU",
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export catalog", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("lotuz-catalog.csv");
});

test("revoked access removes catalog and switching business clears unsaved data", async ({
  page,
}) => {
  const { revoke } = await setup(page);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Unsaved secret");
  await page.getByLabel("Business", { exact: true }).selectOption(B);
  await expect(page.getByRole("form", { name: "Add item" })).toHaveCount(0);
  revoke();
  await page.getByLabel("Search items", { exact: true }).fill("test");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "unavailable",
  );
  await expect(
    page.getByRole("heading", { name: "Items", exact: true }),
  ).toHaveCount(0);
});

test("a successful CSV import clears the uploaded file and reports the result", async ({
  page,
}) => {
  await mockInventory(page);
  await page.route("**/inventory/catalog/import", (route) => {
    expect(route.request().headers()["x-csrf-token"]).toBe("session-token");
    return route.fulfill({ json: { imported: 2 } });
  });
  await page.goto("/import-export");
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({
    name: "items.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "name,description,sku,barcode,item_type,unit,category_id,supplier_id,status\nRice,,R,,PRODUCT,GRAM,,,active",
    ),
  });
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Imported 2 items.");
  await expect(page.getByLabel("CSV file", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Import CSV", exact: true }),
  ).toBeDisabled();
});
test("returning focus preserves an authorized user's in-progress form", async ({
  page,
}) => {
  await setup(page);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Unsaved rice");
  const checked = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/businesses/${A}/inventory`,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await checked;
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Unsaved rice",
  );
});

test("opening stock distinguishes uninitialized and confirmed zero", async ({
  page,
}) => {
  const { data } = await setup(page);
  data.items.push({
    id: "rice",
    name: "Rice",
    archived: false,
    unit: "PIECE",
    itemType: "PRODUCT",
  });
  let quantity: string | null = null;
  let writes = 0;
  await page.route("**/inventory/stock/**", async (route) => {
    if (route.request().method() === "POST") {
      writes++;
      expect(route.request().postDataJSON().quantity).toBe("0");
      quantity = "0";
      return route.fulfill({ status: 201, json: { itemId: "rice", quantity } });
    }
    return route.fulfill({ json: [{ itemId: "rice", quantity }] });
  });
  await page.reload();
  await expect(page.getByText("Not established")).toBeVisible();
  await page.getByLabel("Actions for Rice", { exact: true }).click();
  await expect(page.getByRole("button", { name: /Consume stock/ })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Receive stock for Rice" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Set opening stock for Rice" })
    .click();
  await expect(page.getByText(/Location: Store room/)).toBeVisible();
  await page.getByLabel("Opening quantity").fill("0");
  await page.getByRole("button", { name: "Save opening stock" }).click();
  await expect(page.getByText("0 Pieces")).toBeVisible();
  await expect(
    page.getByText("Opening stock established for Rice."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Set opening stock for Rice" }),
  ).toHaveCount(0);
  expect(writes).toBe(1);
  await page.reload();
  await expect(page.getByText("0 Pieces")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Set opening stock for Rice" }),
  ).toHaveCount(0);
});

test("staff can see stock without an opening action", async ({ page }) => {
  const { data } = await setup(page, "STAFF");
  data.items.push({
    id: "rice",
    name: "Rice",
    archived: false,
    unit: "KILOGRAM",
    itemType: "PRODUCT",
  });
  data.items.push({
    id: "pieces",
    name: "Rice bags",
    archived: false,
    unit: "PIECE",
    itemType: "PRODUCT",
  });
  await page.route("**/inventory/stock/batch**", (route) =>
    route.fulfill({
      json: [
        { itemId: "rice", quantity: "1.250000" },
        { itemId: "pieces", quantity: "25.000000" },
      ],
    }),
  );
  await page.reload();
  await expect(page.getByText("1.25 Kilograms")).toBeVisible();
  await expect(page.getByText("25 Pieces")).toBeVisible();
  await page.getByLabel("Actions for Rice", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Set opening stock/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Receive stock/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: /Consume stock/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: /Set minimum/ })).toHaveCount(
    0,
  );
});

test("receiving updates established stock and keeps catalog actions", async ({
  page,
}) => {
  const { data } = await setup(page);
  data.items.push({
    id: "rice",
    name: "Rice",
    archived: false,
    unit: "PIECE",
    itemType: "PRODUCT",
  });
  let balance = "25.000000";
  let calls = 0;
  await page.route("**/inventory/stock/**", async (route) => {
    if (route.request().method() === "POST") {
      calls++;
      expect(route.request().postDataJSON()).toMatchObject({
        quantity: "15",
        supplierId: null,
      });
      balance = "40.000000";
      return route.fulfill({ status: 201, json: { currentQuantity: balance } });
    }
    return route.fulfill({ json: [{ itemId: "rice", quantity: balance }] });
  });
  await page.reload();
  await expect(page.getByText("25 Pieces")).toBeVisible();
  await page.getByLabel("Actions for Rice", { exact: true }).click();
  await page.getByRole("button", { name: "Receive stock for Rice" }).click();
  const form = page.getByRole("form", { name: "Receive stock" });
  await form.getByLabel("Quantity received").fill("15");
  await form.getByRole("button", { name: "Receive stock" }).click();
  await expect(page.getByText("40 Pieces")).toBeVisible();
  await expect(page.getByText("Stock received for Rice.")).toBeVisible();
  await page.getByLabel("Actions for Rice", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit Rice" })).toBeVisible();
  expect(calls).toBe(1);
  await page.reload();
  await expect(page.getByText("40 Pieces")).toBeVisible();
});

test("receiving reports errors without changing the balance", async ({
  page,
}) => {
  const { data } = await setup(page);
  data.items.push({
    id: "rice",
    name: "Rice",
    archived: false,
    unit: "PIECE",
    itemType: "PRODUCT",
  });
  await page.route("**/inventory/stock/**", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 409,
          json: { detail: "Establish opening stock first." },
        })
      : route.fulfill({ json: [{ itemId: "rice", quantity: "25" }] }),
  );
  await page.reload();
  await page.getByLabel("Actions for Rice", { exact: true }).click();
  await page.getByRole("button", { name: "Receive stock for Rice" }).click();
  const form = page.getByRole("form", { name: "Receive stock" });
  await form.getByLabel("Quantity received").fill("1");
  await form.getByRole("button", { name: "Receive stock" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Establish opening stock first.",
  );
  await expect(page.getByText("25 Pieces").first()).toBeVisible();
  await expect(form).toBeVisible();
});

test("stock adjustment and history remain accessible", async ({ page }) => {
  const { data } = await setup(page);
  data.items.push({
    id: "rice",
    name: "Rice",
    archived: false,
    unit: "PIECE",
    itemType: "PRODUCT",
  });
  let balance = "5";
  await page.route("**/inventory/stock/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/adjustments")) {
      expect(route.request().postDataJSON()).toMatchObject({
        quantity: "-2",
        reason: "Count correction",
      });
      balance = "3";
      return route.fulfill({ status: 201, json: { currentQuantity: balance } });
    }
    if (url.pathname.endsWith("/movements"))
      return route.fulfill({
        json: {
          movements: [
            {
              id: "1",
              type: "ADJUSTMENT",
              quantity: "-2.000000",
              unit: "PIECE",
              createdAt: "2026-01-01T12:00:00Z",
              createdBy: "operator",
              reason: "Count correction",
              reference: null,
              notes: null,
            },
          ],
          total: 1,
          page: 0,
          size: 25,
        },
      });
    return route.fulfill({ json: [{ itemId: "rice", quantity: balance }] });
  });
  await page.reload();
  await page.getByLabel("Actions for Rice", { exact: true }).click();
  await page.getByRole("button", { name: "Adjust stock for Rice" }).click();
  const form = page.getByRole("form", { name: "Adjust stock" });
  await form.getByLabel("Change in quantity").fill("-2");
  await form.getByLabel("Reason").fill("Count correction");
  await form.getByRole("button", { name: "Save adjustment" }).click();
  await expect(page.getByText("3 Pieces")).toBeVisible();
  await page.getByRole("button", { name: "Rice", exact: true }).click();
  await expect(page.getByText("Count correction")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Adjustment" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "-2 Pieces" })).toBeVisible();
});

test("consume stock updates balance and appears in history", async ({
  page,
}) => {
  const { data } = await setup(page);
  data.items.push({
    id: "rice",
    name: "Rice",
    archived: false,
    unit: "PIECE",
    itemType: "PRODUCT",
  });
  let balance = "5";
  await page.route("**/inventory/stock/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/consumption")) {
      expect(route.request().postDataJSON()).toMatchObject({
        quantity: "2",
        reason: "Sale",
      });
      balance = "3";
      return route.fulfill({ status: 201, json: { currentQuantity: balance } });
    }
    if (url.pathname.endsWith("/movements"))
      return route.fulfill({
        json: {
          movements: [
            {
              id: "1",
              type: "CONSUMPTION",
              quantity: "-2.000000",
              unit: "PIECE",
              createdAt: "2026-01-01T12:00:00Z",
              createdBy: "operator",
              reason: "Sale",
              reference: null,
              notes: null,
            },
          ],
          total: 1,
          page: 0,
          size: 25,
        },
      });
    return route.fulfill({ json: [{ itemId: "rice", quantity: balance }] });
  });
  await page.reload();
  await page.getByLabel("Actions for Rice", { exact: true }).click();
  await page.getByRole("button", { name: "Consume stock for Rice" }).click();
  const form = page.getByRole("form", { name: "Consume stock" });
  await form.getByLabel("Quantity consumed").fill("2");
  await form.getByLabel("Reason").fill("Sale");
  await form.getByRole("button", { name: "Record consumption" }).click();
  await expect(page.getByText("3 Pieces")).toBeVisible();
  await page.getByRole("button", { name: "Rice", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Consumption" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "-2 Pieces" })).toBeVisible();
  await expect(page.getByText("Sale", { exact: true })).toBeVisible();
});

test("consumption errors leave the balance unchanged", async ({ page }) => {
  const { data } = await setup(page);
  data.items.push({
    id: "rice",
    name: "Rice",
    archived: false,
    unit: "PIECE",
    itemType: "PRODUCT",
  });
  await page.route("**/inventory/stock/**", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 409, json: { detail: "Insufficient stock" } })
      : route.fulfill({ json: [{ itemId: "rice", quantity: "5" }] }),
  );
  await page.reload();
  await page.getByLabel("Actions for Rice", { exact: true }).click();
  await page.getByRole("button", { name: "Consume stock for Rice" }).click();
  const form = page.getByRole("form", { name: "Consume stock" });
  await form.getByLabel("Quantity consumed").fill("6");
  await form.getByLabel("Reason").fill("Sale");
  await form.getByRole("button", { name: "Record consumption" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Insufficient stock",
  );
  await expect(form).toBeVisible();
  await expect(page.getByText("5 Pieces").first()).toBeVisible();
});

test("owners can configure and remove stock thresholds", async ({ page }) => {
  const { data } = await setup(page);
  data.items.push({
    id: "rice",
    name: "Rice",
    archived: false,
    unit: "PIECE",
    itemType: "PRODUCT",
  });
  let limit: string | null = null;
  await page.route("**/inventory/stock/**", async (route) => {
    if (route.request().method() === "PUT") {
      limit =
        route.request().postDataJSON().quantity === null ? null : "5.000000";
      return route.fulfill({
        json: {
          quantity: "5",
          threshold: limit,
          stockStatus: limit === null ? "NO_THRESHOLD" : "LOW_STOCK",
        },
      });
    }
    return route.fulfill({
      json: [
        {
          itemId: "rice",
          quantity: "5",
          threshold: limit,
          stockStatus: limit === null ? "NO_THRESHOLD" : "LOW_STOCK",
        },
      ],
    });
  });
  await page.reload();
  await expect(page.getByText("No threshold configured")).toBeVisible();
  await page.getByLabel("Actions for Rice", { exact: true }).click();
  await page.getByRole("button", { name: "Set minimum for Rice" }).click();
  await page.getByLabel("Minimum quantity").fill("5");
  await page.getByRole("button", { name: "Save threshold" }).click();
  await expect(
    page.getByRole("cell").getByText("Low stock", { exact: true }),
  ).toBeVisible();
  const filtered = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith("/inventory/catalog/items") &&
      url.searchParams.get("stockStatus") === "low"
    );
  });
  await page.getByLabel("Stock alert").selectOption("low");
  expect(new URL((await filtered).url()).searchParams.get("locationId")).toBe(
    `location-${A}`,
  );
  await page.getByLabel("Actions for Rice", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Set minimum for Rice" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Set minimum for Rice" }).click();
  await expect(page.getByLabel("Minimum quantity")).toHaveValue("5");
  await page.getByRole("button", { name: "Remove threshold" }).click();
  await expect(page.getByText("No threshold configured")).toBeVisible();
});

test("item details and stock dialog support keyboard dismissal", async ({
  page,
}) => {
  const { data } = await setup(page);
  data.items.push({
    id: "rice",
    name: "Rice",
    archived: false,
    unit: "PIECE",
    itemType: "PRODUCT",
    sku: "R1",
  });
  await page.route("**/inventory/stock/**", (route) => {
    if (new URL(route.request().url()).pathname.endsWith("/movements"))
      return route.fulfill({
        json: {
          movements: [
            {
              id: "1",
              type: "OPENING",
              quantity: "5.000000",
              unit: "PIECE",
              createdAt: "2026-01-01T12:00:00Z",
              createdBy: "00000000-0000-0000-0000-000000000001",
              reason: null,
              reference: null,
              notes: null,
            },
          ],
          total: 1,
          page: 0,
          size: 25,
        },
      });
    return route.fulfill({
      json: [
        {
          itemId: "rice",
          quantity: "5.000000",
          threshold: "3.000000",
          stockStatus: "IN_STOCK",
        },
      ],
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "Rice", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Item details: Rice" });
  await expect(details.getByText("R1", { exact: true })).toBeVisible();
  await expect(
    details.getByRole("columnheader", { name: "Movement" }),
  ).toBeVisible();
  await expect(details.getByText("Alex Storekeeper (you)")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Rice", exact: true }),
  ).toBeFocused();
  await page.getByLabel("Actions for Rice", { exact: true }).click();
  await page.getByRole("button", { name: "Set minimum for Rice" }).click();
  await expect(
    page.getByRole("dialog", { name: "Stock threshold" }),
  ).toBeVisible();
  await expect(page.getByLabel("Minimum quantity")).toHaveValue("3");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Stock threshold" }),
  ).toHaveCount(0);
});

test("stock dialog and table fit across screen sizes", async ({ page }) => {
  const { data } = await setup(page);
  data.items.push({
    id: "rice",
    name: "Rice",
    archived: false,
    unit: "PIECE",
    itemType: "PRODUCT",
  });
  await page.route("**/inventory/stock/batch**", (route) =>
    route.fulfill({
      json: [
        {
          itemId: "rice",
          quantity: "5",
          threshold: null,
          stockStatus: "NO_THRESHOLD",
        },
      ],
    }),
  );
  for (const width of [375, 768, 1366, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await page.getByLabel("Actions for Rice", { exact: true }).click();
    await page.getByRole("button", { name: "Consume stock for Rice" }).click();
    const dialog = page.getByRole("dialog", { name: "Consume stock" });
    await expect(dialog).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const box = await dialog.boundingBox();
    expect(box && box.width <= width).toBeTruthy();
    await page.keyboard.press("Escape");
  }
});

test("product details manages stock and refreshes its balance and history", async ({
  page,
}) => {
  const { data } = await setup(page);
  data.items.push({
    id: "rice",
    name: "Rice",
    archived: false,
    unit: "PIECE",
    itemType: "PRODUCT",
  });
  let balance = "5";
  let received = false;
  await page.route("**/inventory/stock/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/receipts")) {
      expect(route.request().postDataJSON().quantity).toBe("2");
      balance = "7";
      received = true;
      return route.fulfill({ status: 201, json: { currentQuantity: balance } });
    }
    if (url.pathname.endsWith("/movements"))
      return route.fulfill({
        json: {
          movements: received
            ? [
                {
                  id: "receipt",
                  type: "RECEIPT",
                  quantity: "2",
                  unit: "PIECE",
                  createdAt: "2026-01-01T12:00:00Z",
                  createdBy: "operator",
                  reason: null,
                  reference: null,
                  notes: null,
                },
              ]
            : [],
          total: received ? 1 : 0,
          page: 0,
          size: 25,
        },
      });
    return route.fulfill({
      json: [
        {
          itemId: "rice",
          quantity: balance,
          threshold: "3",
          stockStatus: "IN_STOCK",
        },
      ],
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "Rice", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Item details: Rice" });
  for (const name of [
    "Edit Rice",
    "Archive Rice",
    "Set minimum for Rice",
    "Receive stock for Rice",
    "Consume stock for Rice",
    "Adjust stock for Rice",
  ]) {
    await expect(details.getByRole("button", { name })).toBeVisible();
  }
  await details.getByRole("button", { name: "Receive stock for Rice" }).click();
  const form = page.getByRole("form", { name: "Receive stock" });
  await expect(form.getByText(/Receiving increases stock/)).toBeVisible();
  await form.getByLabel("Quantity received").fill("2");
  await form.getByRole("button", { name: "Receive stock" }).click();
  await expect(details.getByText("7 Pieces")).toBeVisible();
  await expect(details.getByRole("cell", { name: "Receipt" })).toBeVisible();
  await expect(
    details.getByRole("status").filter({ hasText: "Current stock: 7" }),
  ).toBeVisible();
});

test("staff product details remain read-only", async ({ page }) => {
  const { data } = await setup(page, "STAFF");
  data.items.push({
    id: "rice",
    name: "Rice",
    archived: false,
    unit: "PIECE",
    itemType: "PRODUCT",
  });
  await page.reload();
  await page.getByRole("button", { name: "Rice", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Item details: Rice" });
  await expect(
    details.getByRole("heading", { name: "Stock history" }),
  ).toBeVisible();
  await expect(details.getByLabel("Manage product")).toHaveCount(0);
});

test("item rows open details by pointer and keyboard without intercepting actions", async ({
  page,
}) => {
  const { data } = await setup(page);
  data.items.push({
    id: "rice",
    name: "Rice",
    archived: false,
    unit: "PIECE",
    itemType: "PRODUCT",
    sku: "R1",
  });
  await page.reload();
  const row = page.getByRole("row", { name: "Open details for Rice" });
  await row.getByRole("cell", { name: "R1", exact: true }).click();
  const details = page.getByRole("dialog", { name: "Item details: Rice" });
  await expect(details).toBeVisible();
  await page.keyboard.press("Escape");
  await row.focus();
  await page.keyboard.press("Space");
  await expect(details).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("Actions for Rice", { exact: true }).click();
  await expect(details).toHaveCount(0);
  await expect(page.getByLabel("Actions menu for Rice")).toBeVisible();
});

test("action menus stay anchored, exclusive and dismissible without changing row height", async ({
  page,
}) => {
  const { data } = await setup(page);
  data.items.push(
    {
      id: "rice",
      name: "Rice",
      archived: false,
      unit: "PIECE",
      itemType: "PRODUCT",
    },
    {
      id: "beans",
      name: "Beans",
      archived: false,
      unit: "PIECE",
      itemType: "PRODUCT",
    },
  );
  await page.reload();
  const first = page.getByLabel("Actions for Rice", { exact: true });
  const second = page.getByLabel("Actions for Beans", { exact: true });
  const row = page.getByRole("row", { name: "Open details for Rice" });
  const height = (await row.boundingBox())!.height;
  await first.click();
  const menu = page.getByLabel("Actions menu for Rice");
  const triggerBox = (await first.boundingBox())!;
  const menuBox = (await menu.boundingBox())!;
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  expect(Math.abs(menuBox.x - triggerBox.x)).toBeLessThan(menuBox.width);
  const below = Math.abs(menuBox.y - (triggerBox.y + triggerBox.height + 8));
  const above = Math.abs(menuBox.y + menuBox.height - (triggerBox.y - 8));
  expect(Math.min(below, above)).toBeLessThan(2);
  expect((await row.boundingBox())!.height).toBe(height);
  await second.click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByLabel("Actions menu for Beans")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(second).toBeFocused();
  await expect(page.getByLabel("Actions menu for Beans")).toHaveCount(0);
  await first.click();
  await page.getByRole("heading", { name: "Items", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await first.click();
  await menu.getByRole("button", { name: "Edit Rice" }).click();
  await expect(menu).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Item details: Rice" }),
  ).toHaveCount(0);
});
