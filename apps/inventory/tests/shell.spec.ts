import { test, expect } from "@playwright/test";
import {
  A,
  B,
  USER,
  mockInventory,
  navigate,
  emptySummary,
} from "./fixtures/inventory";

test("unconfigured authentication exposes no workspace", async ({ page }) => {
  await mockInventory(page, { enabled: false });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Sign-in is not configured" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
});
test("a single accessible business opens automatically", async ({ page }) => {
  await mockInventory(page, { businesses: [{ id: A, name: "Store" }] });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(A);
  await expect(page).toHaveURL(new RegExp(`businessId=${A}`));
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      `lotuz.inventory.business.${USER}`,
    ),
  ).toBe(A);
});
test("business switching and last-used restoration are scoped to the user", async ({
  page,
}) => {
  const mock = await mockInventory(page, {
    businesses: [
      { id: B, name: "Restaurant" },
      { id: A, name: "Store" },
    ],
  });
  await page.goto("/");
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(A);
  await navigate(page, "Items");
  await page.getByLabel("Business", { exact: true }).selectOption(B);
  await expect(page).toHaveURL(new RegExp(`/items\\?businessId=${B}`));
  await expect(
    page.getByRole("heading", { name: "Items", exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(B);
  mock.setUser("00000000-0000-0000-0000-000000000002");
  await page.goto("/");
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(A);
});
test("inaccessible businesses are excluded and stale preferences fall back safely", async ({
  page,
}) => {
  const mock = await mockInventory(page);
  mock.deny(B);
  await page.addInitScript(({ key, id }) => localStorage.setItem(key, id), {
    key: `lotuz.inventory.business.${USER}`,
    id: B,
  });
  await page.goto("/");
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(A);
  await expect(
    page.locator("#business option").filter({ hasText: "Restaurant" }),
  ).toHaveCount(0);
});
test("revoked access clears the business and refreshes remaining choices", async ({
  page,
}) => {
  const mock = await mockInventory(page, {
    summaries: { [A]: { ...emptySummary, activeItems: 123, products: 123 } },
  });
  await page.goto(`/?businessId=${A}`);
  await expect(page.getByText("123", { exact: true }).first()).toBeVisible();
  mock.deny(A);
  await navigate(page, "Items");
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(B);
  await expect(page.getByText("123", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "unavailable",
  );
});
test("no accessible businesses offers Workspace without a selector", async ({
  page,
}) => {
  await mockInventory(page, { businesses: [] });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "No Inventory businesses available" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Lotuz Workspace", exact: true }),
  ).toHaveAttribute("href", "http://localhost:3002");
  await expect(page.getByLabel("Business", { exact: true })).toHaveCount(0);
});
test("expired sessions return to sign-in with a safe route and business", async ({
  page,
}) => {
  const mock = await mockInventory(page);
  mock.expire();
  await page.goto(`/items?businessId=${A}`);
  const link = page.getByRole("link", { name: "Sign in", exact: true });
  await expect(link).toBeVisible();
  const href = new URL((await link.getAttribute("href"))!);
  expect(href.searchParams.get("app")).toBe("inventory");
  expect(href.searchParams.get("returnTo")).toBe(`/items?businessId=${A}`);
  await expect(
    page.getByRole("link", { name: "Create an account" }),
  ).toBeVisible();
});
test("Workspace deep links take precedence over the saved business", async ({
  page,
}) => {
  await mockInventory(page);
  await page.addInitScript(({ key, id }) => localStorage.setItem(key, id), {
    key: `lotuz.inventory.business.${USER}`,
    id: B,
  });
  await page.goto(`/?businessId=${A}`);
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(A);
  await navigate(page, "Settings");
  await expect(page.getByLabel("Location name", { exact: true })).toHaveValue(
    "Store room",
  );
});
test("desktop and mobile navigation preserve business context and exclude CSV from Items", async ({
  page,
}) => {
  await mockInventory(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  for (const label of [
    "Items",
    "Categories",
    "Suppliers",
    "Import / Export",
    "Settings",
    "Overview",
  ]) {
    await navigate(page, label);
    await expect(
      page.getByRole("heading", { name: label, exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get("businessId")).toBe(A);
  }
  await navigate(page, "Items");
  await expect(
    page.getByRole("button", { name: "Import CSV", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
test("blocked storage does not prevent automatic selection", async ({
  page,
}) => {
  await mockInventory(page);
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(A);
});
test("account logout clears protected content and retains only a user-scoped preference", async ({
  page,
}) => {
  await mockInventory(page);
  await page.goto("/");
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(A);
  await page.locator("summary").click();
  const request = page.waitForRequest(
    (r) => r.url().includes("/api/auth/logout") && r.method() === "POST",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  expect((await request).headers()["x-csrf-token"]).toBe("session-token");
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      `lotuz.inventory.business.${USER}`,
    ),
  ).toBe(A);
});
test("app-owned header logo and metadata load on desktop and mobile", async ({
  page,
  request,
}) => {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.goto("/");
  const brand = page
    .getByRole("banner")
    .getByRole("img", { name: "Lotuz Inventory", exact: true });
  await expect(brand).toBeVisible();
  await expect(brand).toHaveText("Inventory");
  await expect(
    page.getByRole("link", { name: "Lotuz Inventory overview", exact: true }),
  ).toHaveAttribute("href", "/");
  const logo = brand.locator("img");
  await expect(logo).toHaveAttribute("src", "/brand/logo/lotus.svg");
  await expect(logo).toHaveJSProperty("complete", true);
  expect(
    await logo.evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0);
  await expect(page).toHaveTitle("Lotuz Inventory");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  await expect(page.locator('meta[name="application-name"]')).toHaveAttribute(
    "content",
    "Lotuz Inventory",
  );
  await expect(
    page.locator('link[rel="icon"][type="image/svg+xml"]'),
  ).toHaveAttribute("href", "/brand/logo/lotus.svg");
  await expect(page.locator('link[rel="shortcut icon"]')).toHaveAttribute(
    "href",
    "/brand/favicons/favicon.ico",
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/brand/app-icons/apple-touch-icon.png",
  );
  for (const asset of [
    "/brand/logo/lotus.svg",
    "/brand/favicons/favicon.ico",
    "/brand/app-icons/apple-touch-icon.png",
  ]) {
    const response = await request.get(asset);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("image/");
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("late responses from a previous business cannot replace the new overview", async ({
  page,
}) => {
  await mockInventory(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    `**/businesses/${A}/inventory/catalog/summary`,
    async (route) => {
      await held;
      await route
        .fulfill({
          json: {
            ...emptySummary,
            activeItems: 999,
            recentItems: [
              {
                id: "old",
                name: "Previous business secret",
                itemType: "PRODUCT",
                updatedAt: "2026-11-11T12:00:00Z",
              },
            ],
          },
        })
        .catch(() => {});
    },
  );
  const oldRequest = page.waitForRequest((request) =>
    request.url().includes(`/businesses/${A}/inventory/catalog/summary`),
  );
  await page.goto("/");
  await oldRequest;
  await page.getByLabel("Business", { exact: true }).selectOption(B);
  await expect(
    page.getByText("Your catalog starts here", { exact: true }),
  ).toBeVisible();
  release();
  await expect(
    page.getByText("Previous business secret", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(B);
});

test("sign-in shows the approved lotus and Inventory wordmark", async ({
  page,
}) => {
  const mock = await mockInventory(page);
  mock.expire();
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  const brand = page
    .getByRole("banner")
    .getByRole("img", { name: "Lotuz Inventory", exact: true });
  await expect(brand).toHaveText("Inventory");
  await expect(brand.locator("img")).toHaveAttribute(
    "src",
    "/brand/logo/lotus.svg",
  );
});

test("the authenticated dashboard keeps icon-only branding and lists all eligible businesses", async ({
  page,
}) => {
  await mockInventory(page);
  await page.goto(`/?businessId=${B}`);
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  const brand = page
    .getByRole("banner")
    .getByRole("img", { name: "Lotuz Inventory", exact: true });
  await expect(brand).toHaveText("");
  await expect(brand.locator("img")).toHaveAttribute(
    "src",
    "/brand/logo/lotus.svg",
  );
  await expect(
    page.getByRole("link", { name: "Lotuz Inventory overview", exact: true }),
  ).toHaveAttribute("href", `/?businessId=${B}`);
  const switcher = page.getByLabel("Business", { exact: true });
  await expect(switcher).toHaveValue(B);
  await expect(switcher.locator("option")).toHaveText(["Store", "Restaurant"]);
  await expect(page.getByRole("status")).toHaveCount(0);
  // Reselecting the current option must preserve the already-authorized context.
  await switcher.selectOption(B);
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(switcher).toHaveValue(B);
});

for (const product of [
  { activated: false, accessible: false },
  { activated: true, accessible: false },
]) {
  test(`Inventory excludes a membership with activated=${product.activated} and accessible=false`, async ({
    page,
  }) => {
    await mockInventory(page);
    await page.route(`**/api/businesses/${B}/products`, (route) =>
      route.fulfill({ json: [{ code: "inventory", ...product }] }),
    );
    const forbiddenRequests: string[] = [];
    page.on("request", (request) => {
      if (
        new URL(request.url()).pathname.startsWith(
          `/api/businesses/${B}/inventory`,
        )
      )
        forbiddenRequests.push(request.url());
    });
    await page.addInitScript(({ key, id }) => localStorage.setItem(key, id), {
      key: `lotuz.inventory.business.${USER}`,
      id: B,
    });
    await page.goto(`/?businessId=${B}`);
    const switcher = page.getByLabel("Business", { exact: true });
    await expect(switcher).toHaveValue(A);
    await expect(switcher.locator("option")).toHaveText(["Store"]);
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "unavailable",
    );
    await expect(page).toHaveURL(new RegExp(`businessId=${A}`));
    expect(forbiddenRequests).toEqual([]);
  });
}

test("pending business access shows loading only until authorized selection resolves", async ({
  page,
}) => {
  await mockInventory(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/businesses/${B}/inventory`, async (route) => {
    await held;
    await route.fulfill({
      json: {
        businessId: B,
        role: "ADMIN",
        location: { id: `location-${B}`, name: "Kitchen" },
      },
    });
  });
  await page.goto("/");
  const switcher = page.getByLabel("Business", { exact: true });
  await expect(switcher).toHaveValue(A);
  const request = page.waitForRequest(
    (r) => new URL(r.url()).pathname === `/api/businesses/${B}/inventory`,
  );
  await switcher.selectOption(B);
  await request;
  await expect(page.getByRole("status")).toHaveText(
    "Checking Inventory access...",
  );
  await expect(switcher).toHaveCount(0);
  release();
  await expect(switcher).toHaveValue(B);
  await expect(switcher.locator("option")).toHaveText(["Store", "Restaurant"]);
  await expect(page.getByRole("status")).toHaveCount(0);
});
