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
  await page
    .getByRole("button", { name: "Archive Brown rice", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Brown rice", exact: true }),
  ).toBeVisible();
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
