import { expect, test } from "@playwright/test";
import { A, USER, mockInventory, navigate } from "./fixtures/inventory";

test("owner creates, saves and reconciles a stock count", async ({ page }) => {
  await mockInventory(page, { role: "OWNER" });
  let count: {
    id: string;
    locationId: string;
    status: string;
    version: number;
    createdBy: string;
    createdAt: string;
    completedBy: string | null;
    completedAt: string | null;
    items: {
      itemId: string;
      name: string;
      sku: string;
      unit: string;
      recorded: string;
      counted: string | null;
      variance: string | null;
    }[];
  } | null = null;
  await page.route("**/inventory/catalog/items**", (route) =>
    route.fulfill({
      json: {
        items: [
          { id: "rice", name: "Rice", sku: "R1", unit: "PIECE" },
          { id: "flour", name: "Flour", sku: "F1", unit: "KILOGRAM" },
        ],
        total: 2,
      },
    }),
  );
  await page.route("**/inventory/counts**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method === "GET")
      return route.fulfill({
        json: url.pathname.endsWith("/counts")
          ? {
              items: count ? [count] : [],
              total: count ? 1 : 0,
              page: 0,
              size: 25,
            }
          : count,
      });
    expect(route.request().headers()["x-csrf-token"]).toBe("session-token");
    if (method === "POST" && url.pathname.endsWith("/counts")) {
      expect(route.request().postDataJSON().itemIds).toHaveLength(2);
      count = {
        id: "count-1",
        locationId: `location-${A}`,
        status: "DRAFT",
        version: 0,
        createdBy: USER,
        createdAt: "2026-01-01T00:00:00Z",
        completedBy: null,
        completedAt: null,
        items: [
          {
            itemId: "rice",
            name: "Rice",
            sku: "R1",
            unit: "PIECE",
            recorded: "5.000000",
            counted: null,
            variance: null,
          },
          {
            itemId: "flour",
            name: "Flour",
            sku: "F1",
            unit: "KILOGRAM",
            recorded: "2.500000",
            counted: null,
            variance: null,
          },
        ],
      };
      return route.fulfill({ status: 201, json: count });
    }
    if (method === "PUT" && count) {
      const payload = route.request().postDataJSON();
      expect(payload.items).toEqual([
        { itemId: "rice", quantity: "4" },
        { itemId: "flour", quantity: "3.5" },
      ]);
      count = {
        ...count,
        status: "IN_PROGRESS",
        version: 1,
        items: count.items.map((i, index) => ({
          ...i,
          counted: index ? "3.500000" : "4.000000",
          variance: index ? "1.000000" : "-1.000000",
        })),
      };
      return route.fulfill({ json: count });
    }
    if (url.pathname.endsWith("/confirm") && count) {
      count = {
        ...count,
        status: "COMPLETED",
        version: 2,
        completedBy: USER,
        completedAt: "2026-01-02T00:00:00Z",
      };
      return route.fulfill({ json: count });
    }
    return route.fulfill({ status: 400 });
  });
  await page.goto(`/?businessId=${A}`);
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await navigate(page, "Stock Counts");
  await expect(page.getByText("No stock counts yet.")).toBeVisible();
  await page.getByRole("button", { name: "New stock count" }).click();
  await page.getByLabel("Select Rice").check();
  await page.getByLabel("Select Flour").check();
  await page.getByRole("button", { name: "Create draft count" }).click();
  await expect(
    page.getByRole("heading", { name: "Count details · Draft" }),
  ).toBeVisible();
  await page.getByLabel("Physical count for Rice").fill("4");
  await page.getByLabel("Physical count for Flour").fill("3.5");
  await page.getByRole("button", { name: "Save progress" }).click();
  await expect(
    page.getByText("Count progress saved. Stock has not changed."),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "-1", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to counts" }).click();
  await page.getByRole("button", { name: "View count" }).click();
  await expect(page.getByLabel("Physical count for Rice")).toHaveValue("4");
  await page.getByRole("button", { name: "Review and reconcile" }).click();
  await page.getByRole("button", { name: "Confirm reconciliation" }).click();
  await expect(
    page.getByText("Count completed and stock reconciled."),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Count details · Completed" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to counts" }).click();
  await page.getByRole("button", { name: "View count" }).click();
  await expect(
    page.getByRole("heading", { name: "Count details · Completed" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("staff can view counts but cannot create or reconcile", async ({
  page,
}) => {
  await mockInventory(page, { role: "STAFF" });
  await page.route("**/inventory/counts**", (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 0, size: 25 } }),
  );
  await page.goto("/counts");
  await expect(
    page.getByRole("heading", { name: "Stock Counts" }),
  ).toBeVisible();
  await expect(page.getByText("No stock counts yet.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New stock count" }),
  ).toHaveCount(0);
});

test("conflicting stock requires refresh and recount", async ({ page }) => {
  await mockInventory(page, { role: "ADMIN" });
  let status = "IN_PROGRESS";
  const session = () => ({
    id: "c1",
    locationId: `location-${A}`,
    status,
    version: status === "DRAFT" ? 2 : 1,
    createdBy: USER,
    createdAt: "2026-01-01T00:00:00Z",
    completedBy: null,
    completedAt: null,
    items: [
      {
        itemId: "rice",
        name: "Rice",
        sku: "R1",
        unit: "PIECE",
        recorded: "5.000000",
        counted: status === "DRAFT" ? null : "4.000000",
        variance: status === "DRAFT" ? null : "-1.000000",
      },
    ],
  });
  await page.route("**/inventory/counts**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/confirm"))
      return route.fulfill({
        status: 409,
        json: {
          detail:
            "Stock changed during this count. Refresh and recount before confirming",
        },
      });
    if (url.pathname.endsWith("/refresh")) {
      status = "DRAFT";
      return route.fulfill({ json: session() });
    }
    return route.fulfill({
      json: url.pathname.endsWith("/counts")
        ? { items: [session()], total: 1, page: 0, size: 25 }
        : session(),
    });
  });
  await page.goto("/counts");
  await page.getByRole("button", { name: "View count" }).click();
  await page.getByRole("button", { name: "Review and reconcile" }).click();
  await page.getByRole("button", { name: "Confirm reconciliation" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Stock changed during this count",
  );
  await page.getByRole("button", { name: "Refresh and recount" }).click();
  await page.getByRole("button", { name: "Refresh balances" }).click();
  await expect(page.getByLabel("Physical count for Rice")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Review and reconcile" }),
  ).toBeDisabled();
});
