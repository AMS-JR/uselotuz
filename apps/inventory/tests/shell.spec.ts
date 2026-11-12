import { test, expect } from "@playwright/test";

test("unconfigured authentication exposes no workspace", async ({ page }) => {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Sign-in is not configured" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
});

test("business selection clears stale context and respects backend denial", async ({
  page,
}) => {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  await page.route("**/api/businesses", (route) =>
    route.fulfill({
      json: [
        { id: "a", name: "Store" },
        { id: "b", name: "Restaurant" },
      ],
    }),
  );
  await page.route("**/api/businesses/a/inventory", (route) =>
    route.fulfill({
      json: {
        businessId: "a",
        role: "STAFF",
        location: { id: "location-a", name: "Store room" },
      },
    }),
  );
  await page.route("**/api/businesses/b/inventory", (route) =>
    route.fulfill({ status: 403 }),
  );
  await page.goto("/");
  await page.getByLabel("Business", { exact: true }).selectOption("a");
  await expect(page.getByText("Store room", { exact: true })).toBeVisible();
  await page.getByLabel("Business", { exact: true }).selectOption("b");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Inventory access is unavailable",
  );
  await expect(page.getByText("Store room", { exact: true })).toHaveCount(0);
});

test("expired session returns to sign-in", async ({ page }) => {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  await page.route("**/api/businesses", (route) =>
    route.fulfill({ status: 401 }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
});

test("direct Inventory links preserve the selected business through sign-in", async ({
  page,
}) => {
  const id = "10000000-0000-0000-0000-000000000001";
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  await page.route("**/api/businesses", (route) =>
    route.fulfill({ status: 401 }),
  );
  await page.goto(`/?businessId=${id}`);
  const href = new URL(
    (await page
      .getByRole("link", { name: "Sign in", exact: true })
      .getAttribute("href"))!,
  );
  expect(href.searchParams.get("app")).toBe("inventory");
  expect(href.searchParams.get("returnTo")).toBe(`/?businessId=${id}`);
  await expect(
    page.getByRole("link", { name: "Create an account" }),
  ).toBeVisible();
});

test("authorized business from Workspace opens directly without a Workspace session", async ({
  page,
}) => {
  const id = "10000000-0000-0000-0000-000000000001";
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  await page.route("**/api/businesses", (route) =>
    route.fulfill({ json: [{ id, name: "Store" }] }),
  );
  await page.route(`**/api/businesses/${id}/inventory`, (route) =>
    route.fulfill({
      json: {
        businessId: id,
        role: "STAFF",
        location: { id: "location", name: "Direct access location" },
      },
    }),
  );
  await page.goto(`/?businessId=${id}`);
  await expect(page.getByText("Direct access location")).toBeVisible();
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(id);
});
