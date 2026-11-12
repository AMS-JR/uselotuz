import { test, expect, type Page } from "@playwright/test";

const user = { id: "user-a", name: "Alex" };
const business = {
  id: "10000000-0000-0000-0000-000000000001",
  name: "Corner store",
};
const inventoryUrl = `http://localhost:3001/?businessId=${business.id}`;

async function configured(page: Page) {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { headerName: "X-CSRF-TOKEN", token: "test-csrf" } }),
  );
}

async function member(page: Page, activated = true, canManage = true) {
  await configured(page);
  await page.route("**/api/me", (route) => route.fulfill({ json: user }));
  await page.route("**/api/businesses", (route) =>
    route.fulfill({ json: [business] }),
  );
  await page.route(`**/api/businesses/${business.id}`, (route) =>
    route.fulfill({
      json: { ...business, role: canManage ? "OWNER" : "STAFF", canManage },
    }),
  );
  await page.route("**/members", (route) =>
    route.fulfill({
      json: [{ userId: user.id, role: canManage ? "OWNER" : "STAFF" }],
    }),
  );
  await page.route("**/products", (route) =>
    route.fulfill({
      json: [
        {
          code: "inventory",
          name: "Lotuz Inventory",
          activated,
          accessible: activated,
          url: activated ? inventoryUrl : null,
        },
      ],
    }),
  );
}

test("missing authentication configuration exposes no business data", async ({
  page,
}) => {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ json: { enabled: false } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Sign-in is not configured" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create business", exact: true }),
  ).toHaveCount(0);
});

test("sign-in and signup preserve the Workspace application destination", async ({
  page,
}) => {
  await configured(page);
  await page.route("**/api/me", (route) => route.fulfill({ status: 401 }));
  await page.route("**/api/businesses", (route) =>
    route.fulfill({ status: 401 }),
  );
  await page.goto("/?authError=login_failed");
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Sign-in did not complete",
  );
  const signIn = new URL(
    (await page
      .getByRole("link", { name: "Sign in", exact: true })
      .getAttribute("href"))!,
  );
  expect(signIn.searchParams.get("app")).toBe("workspace");
  expect(signIn.searchParams.get("returnTo")).toBe("/");
  const signup = new URL(
    (await page
      .getByRole("link", { name: "Create an account" })
      .getAttribute("href"))!,
  );
  expect(signup.searchParams.get("screen_hint")).toBe("signup");
});

test("an activated accessible product opens Inventory with the selected business", async ({
  page,
}) => {
  await member(page);
  await page.goto("/");
  await expect(page.getByText("Alex", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open Inventory" }),
  ).toHaveAttribute("href", inventoryUrl);
  await expect(page.getByLabel("Business name", { exact: true })).toHaveValue(
    business.name,
  );
  await expect(
    page.getByRole("listitem").filter({ hasText: /owner \(you\)/i }),
  ).toBeVisible();
});

test("inactive products require operator approval and cannot be self-activated", async ({
  page,
}) => {
  await member(page, false);
  await page.goto("/");
  await expect(page.getByText("Available · activation required")).toBeVisible();
  await expect(
    page.getByText(/Contact Lotuz to request activation/),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Inventory" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: /activate/i })).toHaveCount(0);
});

test("business creation uses CSRF and shows the new business without auto-activation", async ({
  page,
}) => {
  await configured(page);
  await page.route("**/api/me", (route) => route.fulfill({ json: user }));
  await page.route("**/api/businesses", (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().headers()["x-csrf-token"]).toBe("test-csrf");
      expect(route.request().postDataJSON()).toEqual({ name: "Corner store" });
      return route.fulfill({ status: 201, json: business });
    }
    return route.fulfill({ json: [] });
  });
  await page.route(`**/api/businesses/${business.id}`, (route) =>
    route.fulfill({ json: { ...business, role: "OWNER", canManage: true } }),
  );
  await page.route("**/members", (route) =>
    route.fulfill({ json: [{ userId: user.id, role: "OWNER" }] }),
  );
  await page.route("**/products", (route) =>
    route.fulfill({
      json: [
        {
          code: "inventory",
          name: "Lotuz Inventory",
          activated: false,
          accessible: false,
          url: null,
        },
      ],
    }),
  );
  await page.goto("/");
  await page.getByLabel("New business name").fill("Corner store");
  await page
    .getByRole("button", { name: "Create business", exact: true })
    .click();
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(
    business.id,
  );
  await expect(page.getByText("Available · activation required")).toBeVisible();
});

test("business settings save with CSRF while staff has no editing controls", async ({
  page,
}) => {
  await member(page);
  await page.route(`**/api/businesses/${business.id}`, (route) => {
    if (route.request().method() === "PATCH") {
      expect(route.request().headers()["x-csrf-token"]).toBe("test-csrf");
      expect(route.request().postDataJSON()).toEqual({
        name: "New store name",
      });
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({
      json: { ...business, role: "OWNER", canManage: true },
    });
  });
  await page.goto("/");
  await page
    .getByLabel("Business name", { exact: true })
    .fill("New store name");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Business name saved.")).toBeVisible();
  await member(page, true, false);
  await page.reload();
  await expect(page.getByText("Your business role: staff")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
});

test("business switching clears old product links when the backend denies access", async ({
  page,
}) => {
  await member(page);
  const other = {
    id: "10000000-0000-0000-0000-000000000002",
    name: "Restaurant",
  };
  await page.route("**/api/businesses", (route) =>
    route.fulfill({ json: [business, other] }),
  );
  await page.route(`**/api/businesses/${other.id}`, (route) =>
    route.fulfill({ status: 403 }),
  );
  await page.goto("/");
  await page.getByLabel("Business", { exact: true }).selectOption(business.id);
  await expect(
    page.getByRole("link", { name: "Open Inventory" }),
  ).toBeVisible();
  await page.getByLabel("Business", { exact: true }).selectOption(other.id);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "no longer have access",
  );
  await expect(page.getByRole("link", { name: "Open Inventory" })).toHaveCount(
    0,
  );
});

test("sign-out uses the CSRF-protected backend workflow and clears the account", async ({
  page,
}) => {
  await member(page);
  await page.route("**/api/auth/logout?app=workspace", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["x-csrf-token"]).toBe("test-csrf");
    await page.route("**/api/me", (request) =>
      request.fulfill({ status: 401 }),
    );
    await page.route("**/api/businesses", (request) =>
      request.fulfill({ status: 401 }),
    );
    await route.fulfill({
      status: 204,
      headers: {
        Location: "http://localhost:3102/",
        "Access-Control-Expose-Headers": "Location",
      },
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Open Inventory" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Alex", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open Inventory" })).toHaveCount(
    0,
  );
});
