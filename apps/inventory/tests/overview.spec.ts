import { test, expect } from "@playwright/test";
import {
  A,
  B,
  mockInventory,
  navigate,
  emptySummary,
} from "./fixtures/inventory";
for (const role of ["OWNER", "ADMIN", "STAFF"]) {
  test(`${role} sees real catalog summary and appropriate quick actions`, async ({
    page,
  }) => {
    await mockInventory(page, {
      role,
      summaries: {
        [A]: {
          activeItems: 42,
          categories: 6,
          suppliers: 3,
          products: 30,
          ingredients: 12,
          recentItems: [
            {
              id: "recent",
              name: "Brown rice",
              itemType: "INGREDIENT",
              updatedAt: "2026-11-11T12:00:00Z",
            },
          ],
        },
        [B]: emptySummary,
      },
    });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
    const cards = page.locator("dl").first();
    await expect(cards).toContainText("42");
    await expect(
      page.getByRole("heading", { name: "Catalog breakdown" }),
    ).toBeVisible();
    await expect(page.getByText("Brown rice", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Add item", exact: true }),
    ).toHaveCount(role === "STAFF" ? 0 : 1);
    await page.screenshot({
      path: test.info().outputPath(`overview-${role.toLowerCase()}.png`),
      fullPage: true,
    });
    if (role !== "STAFF") {
      await page.getByRole("link", { name: "Add item", exact: true }).click();
      await expect(
        page.getByRole("form", { name: "Add item", exact: true }),
      ).toBeVisible();
    }
    await navigate(page, "Overview");
    await page.getByLabel("Business", { exact: true }).selectOption(B);
    await expect(
      page.getByText("Your catalog starts here", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Brown rice", { exact: true })).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  });
}
test("summary loading failures are recoverable without fake statistics", async ({
  page,
}) => {
  await mockInventory(page);
  let failed = true;
  await page.route("**/inventory/catalog/summary", (route) =>
    failed
      ? route.fulfill({ status: 500 })
      : route.fulfill({ json: emptySummary }),
  );
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Unable to load",
  );
  failed = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByText("Your catalog starts here", { exact: true }),
  ).toBeVisible();
});
test("location settings preserve CSRF and Staff sees a read-only location", async ({
  page,
}) => {
  await mockInventory(page, { role: "STAFF" });
  await page.goto("/settings");
  await expect(page.getByText("Store room", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save location", exact: true }),
  ).toHaveCount(0);
});
test("an admin can update the supported location setting", async ({ page }) => {
  await mockInventory(page);
  await page.route(
    `**/api/businesses/${A}/inventory/location`,
    async (route) => {
      expect(route.request().method()).toBe("PATCH");
      expect(route.request().headers()["x-csrf-token"]).toBe("session-token");
      expect(route.request().postDataJSON()).toEqual({ name: "New room" });
      return route.fulfill({ status: 204 });
    },
  );
  await page.goto("/settings");
  await page.getByLabel("Location name", { exact: true }).fill("New room");
  await page
    .getByRole("button", { name: "Save location", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Location updated.");
});

test("an empty catalog loads zero counts and useful next actions", async ({
  page,
}) => {
  await mockInventory(page, { summaries: { [A]: emptySummary } });
  await page.goto("/");
  await expect(page.locator("dl").first().locator("dd")).toHaveText([
    "0",
    "0",
    "0",
    "0",
    "0",
  ]);
  await expect(
    page.getByText("Your catalog starts here", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add item", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Import CSV", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});
test("a missing summary endpoint stays a genuine service error instead of fake zero counts", async ({
  page,
}) => {
  await mockInventory(page);
  await page.route("**/inventory/catalog/summary", (route) =>
    route.fulfill({ status: 404, json: { status: 404, error: "Not Found" } }),
  );
  await page.goto("/");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "overview service is unavailable",
  );
  await expect(
    page.getByText("Your catalog starts here", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Active items", { exact: true })).toHaveCount(0);
});

test("stock alert counts are shown to staff", async ({ page }) => {
  await mockInventory(page, { role: "STAFF" });
  await page.route("**/inventory/stock/alerts**", (route) =>
    route.fulfill({ json: { lowStock: 3, outOfStock: 2 } }),
  );
  await page.goto("/");
  const cards = page.locator("dl").first();
  await expect(cards).toContainText("Low stock");
  await expect(cards).toContainText("Out of stock");
  await expect(cards.locator("dd")).toHaveText(["0", "0", "0", "3", "2"]);
});

test("stock alert links open the matching Items filter", async ({ page }) => {
  await mockInventory(page, { role: "STAFF" });
  await page.goto("/");
  await page.getByRole("link", { name: /View items: Low stock/ }).click();
  await expect(
    page.getByRole("heading", { name: "Items", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Stock alert")).toHaveValue("low");
});
