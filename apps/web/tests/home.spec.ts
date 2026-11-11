import { expect, test } from "@playwright/test";

test("visitors can discover the planned product on the static website", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/^Lotuz —/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "https://uselotuz.io/",
  );
  await expect(page.locator("body")).not.toContainText("UseLotuz");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "More clarity.More room to grow.",
  );
  await page
    .getByRole("link", { name: "Explore our products", exact: true })
    .click();
  await expect(page).toHaveURL(/#products$/);
  await expect(
    page.getByRole("heading", { name: "Lotuz Inventory", level: 3 }),
  ).toBeVisible();
  await expect(
    page.getByText("Under consideration · Not yet available"),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Our approach" })
    .click();
  await expect(page).toHaveURL(/#approach$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("keyboard users can skip navigation without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  await expect(
    page.getByRole("heading", { name: "Lotuz Inventory", level: 3 }),
  ).toBeVisible();
  await context.close();
});

test("unknown pages have a usable return route", async ({ page }) => {
  const response = await page.goto("/missing/");
  expect(response?.status()).toBe(404);
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL("/");
});

test("approved branding and sharing assets work on the static export", async ({
  page,
}) => {
  await page.goto("/");
  for (const landmark of [
    page.getByRole("banner"),
    page.getByRole("contentinfo"),
  ]) {
    const home = landmark.getByRole("link", { name: "Lotuz home" });
    await expect(home).toBeVisible();
    await home.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        home
          .locator("img")
          .evaluate(
            (image: HTMLImageElement) =>
              image.complete && image.naturalWidth > 0,
          ),
      )
      .toBe(true);
  }
  await expect(
    page.locator('link[rel="icon"][type="image/svg+xml"]'),
  ).toHaveAttribute("href", "/brand/logo/lotus.svg");
  await expect(
    page.locator('link[rel="icon"][type="image/x-icon"]'),
  ).toHaveAttribute("href", "/brand/favicons/favicon.ico");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "sizes",
    "180x180",
  );
  const sharingUrl = "https://uselotuz.io/brand/social/og-image.png";
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
    "content",
    "Lotuz",
  );
  for (const selector of [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
  ]) {
    await expect(page.locator(selector)).toHaveAttribute(
      "content",
      "Lotuz — Focused tools for independent businesses",
    );
  }
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    sharingUrl,
  );
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
    "content",
    sharingUrl,
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );

  const manifestPath = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  const manifestResponse = await page.request.get(manifestPath!);
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()["content-type"]).toContain(
    "application/manifest+json",
  );
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe("Lotuz");
  expect(manifest.short_name).toBe("Lotuz");
  for (const icon of manifest.icons) {
    const response = await page.request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
    const body = await response.body();
    expect(`${body.readUInt32BE(16)}x${body.readUInt32BE(20)}`).toBe(
      icon.sizes,
    );
  }
  for (const selector of ['link[rel="icon"]', 'link[rel="apple-touch-icon"]']) {
    for (const href of await page
      .locator(selector)
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")!),
      )) {
      expect((await page.request.get(href)).ok()).toBe(true);
    }
  }
  const social = await page.request.get("/brand/social/og-image.png");
  expect(social.ok()).toBe(true);
  const socialBody = await social.body();
  expect([socialBody.readUInt32BE(16), socialBody.readUInt32BE(20)]).toEqual([
    1200, 630,
  ]);
});
