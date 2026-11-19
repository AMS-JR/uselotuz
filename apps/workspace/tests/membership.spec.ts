import { test, expect } from "@playwright/test";

const business = "10000000-0000-0000-0000-000000000001";
test("owner creates and shares an invitation", async ({ page }) => {
  const token = "C".repeat(43);
  await page.route("**/api/auth/config", (r) =>
    r.fulfill({ json: { enabled: true } }),
  );
  await page.route("**/api/auth/csrf", (r) =>
    r.fulfill({ json: { headerName: "X-CSRF-TOKEN", token: "test" } }),
  );
  await page.route("**/api/me", (r) =>
    r.fulfill({
      json: {
        id: "owner",
        name: "Owner",
        email: "owner@example.com",
        emailVerified: true,
      },
    }),
  );
  await page.route("**/api/businesses", (r) =>
    r.fulfill({ json: [{ id: business, name: "Test Store" }] }),
  );
  await page.route(`**/api/businesses/${business}`, (r) =>
    r.fulfill({
      json: {
        id: business,
        name: "Test Store",
        role: "OWNER",
        canManage: true,
      },
    }),
  );
  await page.route("**/membership/members", (r) =>
    r.fulfill({
      json: [
        {
          userId: "owner",
          name: "Owner",
          role: "OWNER",
          active: true,
          inventoryRole: "OWNER",
        },
      ],
    }),
  );
  await page.route("**/membership/invitations", (r) =>
    r.request().method() === "POST"
      ? r.fulfill({
          status: 201,
          json: { token, id: "invitation" },
        })
      : r.fulfill({ json: [] }),
  );
  await page.route(`**/api/businesses/${business}/members`, (r) =>
    r.fulfill({ json: [{ userId: "owner", role: "OWNER" }] }),
  );
  await page.goto(`/members?businessId=${business}`);
  await page.getByLabel("Email", { exact: true }).fill("staff@example.com");
  await page.getByLabel("Grant Inventory access").check();
  await page.getByRole("button", { name: "Create invitation" }).click();
  const link = await page.getByLabel("Secure invitation link").inputValue();
  expect(new URL(link).hash).toBe(`#token=${token}`);
  await page.route("**/api/invitations/accept", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ token });
    await route.fulfill({ json: { businessId: business } });
  });
  await page.goto(link);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByRole("status")).toHaveText("Invitation accepted.");
});

test("invitation token stays out of the address bar and is submitted on acceptance", async ({
  page,
}) => {
  const token = "A".repeat(43);
  await page.route("**/api/me", (r) =>
    r.fulfill({
      json: {
        id: "employee",
        name: "Employee",
        email: "person@example.com",
        emailVerified: true,
      },
    }),
  );
  await page.route("**/api/auth/csrf", (r) =>
    r.fulfill({ json: { headerName: "X-CSRF-TOKEN", token: "test" } }),
  );
  await page.route("**/api/invitations/accept", async (r) => {
    expect(r.request().headers()["x-csrf-token"]).toBe("test");
    expect(r.request().postDataJSON()).toEqual({ token });
    await r.fulfill({ json: { businessId: business } });
  });
  await page.goto(`/accept-invitation#token=${token}`);
  await expect(
    page.getByRole("button", { name: "Accept invitation" }),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByRole("status")).toHaveText("Invitation accepted.");
});

test("rejected invitation keeps the signed-in address visible", async ({
  page,
}) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        id: "employee",
        email: "person@example.com",
        emailVerified: true,
      },
    }),
  );
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { headerName: "X-CSRF-TOKEN", token: "test" } }),
  );
  await page.route("**/api/invitations/accept", (route) =>
    route.fulfill({ status: 403 }),
  );
  await page.goto(`/accept-invitation#token=${"A".repeat(43)}`);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText("person@example.com");
  await expect(alert).toContainText("exact email address");
});

test("recipient can sign out to use the invited account", async ({ page }) => {
  let signedIn = true;
  await page.route("**/api/me", (route) =>
    signedIn
      ? route.fulfill({
          json: {
            id: "employee",
            email: "other@example.com",
            emailVerified: true,
          },
        })
      : route.fulfill({ status: 401 }),
  );
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { headerName: "X-CSRF-TOKEN", token: "test" } }),
  );
  await page.route("**/api/auth/logout?app=workspace", (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers()["x-csrf-token"]).toBe("test");
    signedIn = false;
    return route.fulfill({
      status: 204,
      headers: { Location: "/accept-invitation" },
    });
  });
  const token = "D".repeat(43);
  await page.goto(`/accept-invitation#token=${token}`);
  await page
    .getByRole("button", { name: "Sign out to use another account" })
    .click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  expect(
    await page.evaluate(
      () => sessionStorage.getItem("lotuz.invitation")?.length,
    ),
  ).toBe(43);
});

test("unverified session explains why acceptance is unavailable", async ({
  page,
}) => {
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        id: "employee",
        email: "person@example.com",
        emailVerified: false,
      },
    }),
  );
  await page.goto(`/accept-invitation#token=${"A".repeat(43)}`);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "does not include a verified email",
  );
  await expect(
    page.getByRole("button", { name: "Accept invitation" }),
  ).toHaveCount(0);
});

test("malformed links do not reuse a previous invitation or submit a request", async ({
  page,
}) => {
  let accepted = false;
  await page.addInitScript(() =>
    sessionStorage.setItem("lotuz.invitation", "A".repeat(43)),
  );
  await page.route("**/api/invitations/accept", (route) => {
    accepted = true;
    return route.fulfill({ status: 500 });
  });
  await page.goto(`/accept-invitation#token=${"B".repeat(96)}`);
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "invitation link is invalid",
  );
  expect(new URL(page.url()).hash).toBe("");
  expect(accepted).toBe(false);
  expect(
    await page.evaluate(() => sessionStorage.getItem("lotuz.invitation")),
  ).toBeNull();
});

test("invitation secret survives the sign-in return in the same tab", async ({
  page,
}) => {
  const token = "B".repeat(43);
  let signedIn = false;
  await page.route("**/api/me", (route) =>
    signedIn
      ? route.fulfill({
          json: {
            id: "employee",
            name: "Employee",
            email: "person@example.com",
            emailVerified: true,
          },
        })
      : route.fulfill({ status: 401 }),
  );
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { headerName: "X-CSRF-TOKEN", token: "test" } }),
  );
  await page.route("**/api/invitations/accept", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ token });
    await route.fulfill({ json: { businessId: business } });
  });
  await page.goto(`/accept-invitation#token=${token}`);
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  signedIn = true;
  await page.goto("/accept-invitation");
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page.getByRole("status")).toHaveText("Invitation accepted.");
});

test("owner changes employee access and revokes an invitation", async ({
  page,
}) => {
  let employee = {
    userId: "employee",
    name: "Employee",
    role: "STAFF",
    active: true,
    inventoryRole: "STAFF" as string | null,
  };
  let pending = true;
  await page.route("**/api/auth/config", (r) =>
    r.fulfill({ json: { enabled: true } }),
  );
  await page.route("**/api/auth/csrf", (r) =>
    r.fulfill({ json: { headerName: "X-CSRF-TOKEN", token: "test" } }),
  );
  await page.route("**/api/me", (r) =>
    r.fulfill({
      json: {
        id: "owner",
        name: "Owner",
        email: "owner@example.com",
        emailVerified: true,
      },
    }),
  );
  await page.route("**/api/businesses", (r) =>
    r.fulfill({ json: [{ id: business, name: "Test Store" }] }),
  );
  await page.route(`**/api/businesses/${business}`, (r) =>
    r.fulfill({
      json: {
        id: business,
        name: "Test Store",
        role: "OWNER",
        canManage: true,
      },
    }),
  );
  await page.route(`**/api/businesses/${business}/members`, (r) =>
    r.fulfill({ json: [] }),
  );
  await page.route("**/membership/members", (r) =>
    r.fulfill({ json: [employee] }),
  );
  await page.route("**/membership/members/employee", async (r) => {
    const body = r.request().postDataJSON();
    employee = {
      ...employee,
      role: body.role,
      active: body.active,
      inventoryRole: body.inventoryAccess ? body.role : null,
    };
    await r.fulfill({ status: 204 });
  });
  await page.route("**/membership/invitations", (r) =>
    r.fulfill({
      json: pending
        ? [
            {
              id: "invite",
              email: "new@example.com",
              role: "STAFF",
              inventoryAccess: false,
              expiresAt: "2030-01-01T00:00:00Z",
            },
          ]
        : [],
    }),
  );
  await page.route("**/membership/invitations/invite/revoke", async (r) => {
    pending = false;
    await r.fulfill({ status: 204 });
  });
  await page.goto(`/members?businessId=${business}`);
  await page
    .getByRole("combobox", { name: "Role", exact: true })
    .selectOption("ADMIN");
  await expect(page.getByText("Membership updated.")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Role", exact: true }),
  ).toHaveValue("ADMIN");
  await page.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("No pending invitations.")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByText(/Inactive/)).toBeVisible();
});
