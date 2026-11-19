import { test, expect } from "@playwright/test";
import { A, B, mockInventory, navigate } from "./fixtures/inventory";

test("reports support filters, movements, CSV and business switching", async ({
  page,
}) => {
  await mockInventory(page, { role: "STAFF" });
  await page.route("**/inventory/reports/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/export"))
      return route.fulfill({
        contentType: "text/csv",
        body: "item,sku\nRice,001\n",
      });
    if (url.pathname.endsWith("/summary"))
      return route.fulfill({
        json: {
          totalActiveItems: 1,
          lowStockItems: 0,
          outOfStockItems: 0,
          movementsInPeriod: 1,
        },
      });
    const isB = url.pathname.includes(B);
    if (url.pathname.endsWith("/stock"))
      return route.fulfill({
        json: {
          items:
            url.searchParams.get("status") === "OUT_OF_STOCK"
              ? []
              : [
                  {
                    itemId: "1",
                    name: isB ? "Flour" : "Rice",
                    sku: "001",
                    category: "Food",
                    itemType: "PRODUCT",
                    unit: "PIECE",
                    currentStock: "5.000000",
                    minimum: null,
                    stockStatus: "NO_THRESHOLD",
                  },
                ],
          total: 1,
          page: 0,
          size: 25,
        },
      });
    return route.fulfill({
      json: {
        items: [
          {
            id: "1",
            date: "2026-01-01T00:00:00Z",
            item: isB ? "Flour" : "Rice",
            sku: "001",
            movementType: "CONSUMPTION",
            quantity: "-2.000000",
            unit: "PIECE",
            reason: "Sale",
          },
        ],
        total: 1,
        page: 0,
        size: 25,
      },
    });
  });
  await page.goto(`/?businessId=${A}`);
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await navigate(page, "Reports");
  await expect(page).toHaveURL(new RegExp(`businessId=${A}`));
  await expect(page.getByRole("cell", { name: "Rice" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "No threshold" })).toBeVisible();
  await page.getByLabel("Stock status").selectOption("OUT_OF_STOCK");
  await expect(page.getByText("No results for these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Stock Movements" }).click();
  await expect(page.getByRole("cell", { name: "-2" })).toBeVisible();
  const filtered = page.waitForRequest(
    (r) => new URL(r.url()).searchParams.get("movementType") === "CONSUMPTION",
  );
  await page.getByLabel("Movement type").selectOption("CONSUMPTION");
  await filtered;
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Stock Movements" }).click();
  expect((await download).suggestedFilename()).toBe(
    "lotuz-movements-report.csv",
  );
  await page.getByLabel("Business").selectOption(B);
  await expect(page).toHaveURL(new RegExp(`businessId=${B}`));
  await expect(page.getByRole("cell", { name: "Flour" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Rice" })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
