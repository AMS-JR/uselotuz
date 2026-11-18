import { test, expect, type Page } from "@playwright/test";
import { mockInventory } from "./fixtures/inventory";
async function setup(page: Page, picture?: string) {
  await mockInventory(page, {
    profile: { name: "Alex Taylor", email: "alex@example.com", picture },
  });
  await page.goto("/");
}

test("avatar renders provider picture and shows only supported account actions", async ({
  page,
}) => {
  await page.route("https://profiles.example/alex.png", (route) =>
    route.fulfill({
      path: "public/brand/app-icons/apple-touch-icon.png",
      contentType: "image/png",
    }),
  );
  await setup(page, "https://profiles.example/alex.png");
  const trigger = page.getByLabel("Account menu for Alex Taylor", {
    exact: true,
  });
  await expect(trigger).toBeVisible();
  const image = trigger.locator("img");
  await expect(image).toHaveJSProperty("complete", true);
  expect(
    await image.evaluate((node: HTMLImageElement) => node.naturalWidth),
  ).toBeGreaterThan(0);
  await expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
  await trigger.press("Enter");
  await expect(
    page.getByText("alex@example.com", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: /Profile settings|Account settings|Billing/,
    }),
  ).toHaveCount(0);
  await trigger.press("Escape");
  await expect(
    page.getByText("alex@example.com", { exact: true }),
  ).toBeHidden();
  await expect(trigger).toBeFocused();
});
test("missing profile pictures show initials and account disclosure closes outside", async ({
  page,
}) => {
  await setup(page);
  const trigger = page.getByLabel("Account menu for Alex Taylor", {
    exact: true,
  });
  await expect(trigger).toContainText("AT");
  await expect(trigger.locator("img")).toHaveCount(0);
  await trigger.click();
  await expect(
    page.getByText("alex@example.com", { exact: true }),
  ).toBeVisible();
  await page.getByRole("main").click({ position: { x: 4, y: 300 } });
  await expect(
    page.getByText("alex@example.com", { exact: true }),
  ).toBeHidden();
});
test("broken profile pictures fall back without a broken image", async ({
  page,
}) => {
  await page.route("https://profiles.example/broken.png", (route) =>
    route.abort(),
  );
  await setup(page, "https://profiles.example/broken.png");
  const trigger = page.getByLabel("Account menu for Alex Taylor", {
    exact: true,
  });
  await expect(trigger).toContainText("AT");
  await expect(trigger.locator("img")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
