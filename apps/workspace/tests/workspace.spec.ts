import { test, expect, type Page } from "@playwright/test";

const user = { id: "user-a", name: "Alex" };
const business = {
  id: "10000000-0000-0000-0000-000000000001",
  name: "Corner store",
};
const inventoryUrl = `http://localhost:3001/?businessId=${business.id}`;

async function navigate(page: Page, name: string) {
  const link = page
    .getByRole("navigation", { name: "Workspace navigation" })
    .getByRole("link", { name, exact: true });
  if (!(await link.isVisible()))
    await page.getByRole("button", { name: "Menu", exact: true }).click();
  const destination = new URL((await link.getAttribute("href"))!, page.url())
    .pathname;
  await link.click();
  await expect(page).toHaveURL((url) => url.pathname === destination);
  await expect(
    page.getByRole("heading", { name, exact: true, level: 1 }),
  ).toBeVisible();
}

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
  await page.route("**/membership/members", (route) =>
    route.fulfill({
      json: [
        {
          userId: user.id,
          name: user.name,
          role: "OWNER",
          active: true,
          inventoryRole: "OWNER",
        },
      ],
    }),
  );
  await page.route("**/membership/invitations", (route) =>
    route.fulfill({ json: [] }),
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
  const brand = page
    .getByRole("banner")
    .getByRole("img", { name: "Lotuz Workspace", exact: true });
  await expect(brand).toBeVisible();
  await expect(brand).toHaveText("Workspace");
  await expect(brand.locator("img")).toHaveAttribute(
    "src",
    "/brand/logo/lotus.svg",
  );
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
  await page.getByLabel("Account menu for Alex", { exact: true }).click();
  await expect(page.getByText("Alex", { exact: true })).toBeVisible();
  const brand = page
    .getByRole("banner")
    .getByRole("img", { name: "Lotuz Workspace", exact: true });
  await expect(brand).toBeVisible();
  await expect(brand).toHaveText("");
  await expect(brand.locator("img")).toHaveAttribute(
    "src",
    "/brand/logo/lotus.svg",
  );
  await expect(
    page.getByRole("link", { name: "Lotuz Workspace overview", exact: true }),
  ).toHaveAttribute("href", `/?businessId=${business.id}`);
  await expect(page).toHaveTitle("Lotuz Workspace");
  await expect(page.locator('meta[name="application-name"]')).toHaveAttribute(
    "content",
    "Lotuz Workspace",
  );
  await expect(
    page.getByRole("link", { name: "Open Inventory" }),
  ).toHaveAttribute("href", inventoryUrl);
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(
    business.id,
  );
  await navigate(page, "Settings");
  await expect(page.getByLabel("Business name", { exact: true })).toHaveValue(
    business.name,
  );
  await navigate(page, "Membership");
  await expect(
    page.getByRole("listitem").filter({ hasText: /owner \(you\)/i }),
  ).toBeVisible();
});

test("inactive products require operator approval and cannot be self-activated", async ({
  page,
}) => {
  await member(page, false);
  await page.goto("/");
  await expect(page.getByText("Available - activation required")).toBeVisible();
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
  let created = false;
  await page.route("**/api/businesses", (route) => {
    if (route.request().method() === "POST") {
      expect(route.request().headers()["x-csrf-token"]).toBe("test-csrf");
      expect(route.request().postDataJSON()).toEqual({ name: "Corner store" });
      created = true;
      return route.fulfill({ status: 201, json: business });
    }
    return route.fulfill({ json: created ? [business] : [] });
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
  await page.goto("/businesses");
  await page.getByLabel("New business name").fill("Corner store");
  await page
    .getByRole("button", { name: "Create business", exact: true })
    .click();
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(
    business.id,
  );
  await expect(page.getByText("Available - activation required")).toBeVisible();
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
  await page.goto("/settings");
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
    /no longer have access|unavailable/,
  );
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(
    business.id,
  );
  await expect(
    page.getByRole("link", { name: "Open Inventory" }),
  ).toHaveAttribute("href", inventoryUrl);
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
  await page.getByLabel("Account menu for Alex", { exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Alex", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open Inventory" })).toHaveCount(
    0,
  );
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
    .getByRole("img", { name: "Lotuz Workspace", exact: true });
  await expect(brand).toBeVisible();
  await expect(brand).toContainText("Workspace");
  const logo = brand.locator("img");
  await expect(logo).toHaveAttribute("src", "/brand/logo/lotus.svg");
  await expect(logo).toHaveJSProperty("complete", true);
  expect(
    await logo.evaluate((image: HTMLImageElement) => image.naturalWidth),
  ).toBeGreaterThan(0);
  await expect(page).toHaveTitle("Lotuz Workspace");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
  await expect(page.locator('meta[name="application-name"]')).toHaveAttribute(
    "content",
    "Lotuz Workspace",
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

test("Workspace restores user-scoped business choices and honors explicit deep links", async ({
  page,
}) => {
  await member(page);
  const other = {
    id: "10000000-0000-0000-0000-000000000002",
    name: "Restaurant",
  };
  await page.route("**/api/businesses", (route) =>
    route.fulfill({ json: [other, business] }),
  );
  await page.route(`**/api/businesses/${other.id}`, (route) =>
    route.fulfill({ json: { ...other, role: "OWNER", canManage: true } }),
  );
  await page.goto("/");
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(
    business.id,
  );
  await page.getByLabel("Business", { exact: true }).selectOption(other.id);
  await expect(page).toHaveURL(new RegExp(other.id));
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(
    other.id,
  );
  await page.goto(`/settings?businessId=${business.id}`);
  await expect(page.getByLabel("Business name", { exact: true })).toHaveValue(
    business.name,
  );
  await page.screenshot({
    path: test.info().outputPath("workspace-settings.png"),
    fullPage: true,
  });
});
test("Workspace navigation works on desktop and mobile without exposing unimplemented features", async ({
  page,
}) => {
  await member(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("workspace-overview.png"),
    fullPage: true,
  });
  for (const name of [
    "Products",
    "Businesses",
    "Membership",
    "Settings",
    "Overview",
  ]) {
    await navigate(page, name);
    expect(new URL(page.url()).searchParams.get("businessId")).toBe(
      business.id,
    );
  }
  await expect(
    page.getByRole("link", { name: /Billing|Invitations|Profile settings/ }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
test("a stored business preference from another user is ignored", async ({
  page,
}) => {
  await member(page);
  const other = {
    id: "10000000-0000-0000-0000-000000000002",
    name: "Restaurant",
  };
  await page.route("**/api/businesses", (route) =>
    route.fulfill({ json: [other, business] }),
  );
  await page.route(`**/api/businesses/${other.id}`, (route) =>
    route.fulfill({ json: { ...other, role: "OWNER", canManage: true } }),
  );
  await page.addInitScript(
    (id) => localStorage.setItem("lotuz.workspace.business.someone-else", id),
    other.id,
  );
  await page.goto("/");
  await expect(page.getByLabel("Business", { exact: true })).toHaveValue(
    business.id,
  );
});

test("business cards and switching use each business membership role", async ({
  page,
}) => {
  await member(page);
  const owned = {
    id: "10000000-0000-0000-0000-000000000002",
    name: "My store",
    role: "OWNER",
  };
  const employed = { ...business, role: "STAFF" };
  await page.route("**/api/businesses", (route) =>
    route.fulfill({ json: [employed, owned] }),
  );
  await page.route(`**/api/businesses/${business.id}`, (route) =>
    route.fulfill({ json: { ...employed, canManage: false } }),
  );
  await page.route(`**/api/businesses/${owned.id}`, (route) =>
    route.fulfill({ json: { ...owned, canManage: true } }),
  );
  await page.goto(`/businesses?businessId=${business.id}`);
  await expect(page.getByText("Employee · Staff")).toBeVisible();
  await expect(page.getByText("Your business · Owner")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create business" }),
  ).toBeVisible();
  await page.goto(`/settings?businessId=${business.id}`);
  await expect(page.getByText("Your business role: staff")).toBeVisible();
  await expect(page.getByLabel("Business name", { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("Business", { exact: true }).selectOption(owned.id);
  await expect(page.getByText("Your business role: owner")).toBeVisible();
  await expect(page.getByLabel("Business name", { exact: true })).toHaveValue(
    owned.name,
  );
  await page.getByLabel("Business", { exact: true }).selectOption(business.id);
  await expect(page.getByText("Your business role: staff")).toBeVisible();
  await expect(page.getByLabel("Business name", { exact: true })).toHaveCount(
    0,
  );
});
