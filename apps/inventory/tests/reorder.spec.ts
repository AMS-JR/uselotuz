import { test, expect } from "@playwright/test";
import { mockInventory } from "./fixtures/inventory";

for (const role of ["OWNER", "STAFF"]) {
  test(`${role} can view and export the reorder list`, async ({ page }) => {
    await mockInventory(page, { role });
    let planned: string | null = null;
    await page.route("**/inventory/reorder**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/export"))
        return route.fulfill({
          contentType: "text/csv",
          body: "item,sku\nRice,R1\n",
        });
      if (route.request().method() === "PUT") {
        expect(route.request().headers()["x-csrf-token"]).toBe("session-token");
        planned = route.request().postDataJSON().quantity;
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({
        json: {
          items: [
            {
              itemId: "rice",
              name: "Rice",
              sku: "R1",
              unit: "PIECE",
              supplier: "Supplier",
              currentStock: "2.000000",
              minimum: "5.000000",
              suggested: "3.000000",
              planned,
            },
          ],
          total: 1,
          page: 0,
          size: 25,
        },
      });
    });
    await page.goto("/reorder");
    await expect(
      page.getByRole("heading", { name: "Reorder List" }),
    ).toBeVisible();
    await expect(page.getByText("Rice", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Items without an opening balance or minimum are excluded.",
        { exact: false },
      ),
    ).toBeVisible();
    if (role === "OWNER") {
      await page.getByRole("button", { name: "Edit plan for Rice" }).click();
      await page.getByLabel("Planned quantity").fill("7");
      await page.getByRole("button", { name: "Save plan" }).click();
      await expect(
        page.getByRole("cell", { name: "7", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText("Reorder plan updated for Rice."),
      ).toBeVisible();
    } else
      await expect(page.getByRole("button", { name: /Edit plan/ })).toHaveCount(
        0,
      );
    const request = page.waitForRequest(
      (r) => new URL(r.url()).searchParams.get("q") === "rice",
    );
    await page.getByLabel("Search", { exact: true }).fill("rice");
    await request;
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    expect((await download).suggestedFilename()).toBe("lotuz-reorder.csv");
    await expect(page.getByText("Reorder CSV downloaded.")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByLabel("Search", { exact: true })).toHaveValue("");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  });
}

test("reorder quantities display cleanly and plan inputs preserve unit precision", async ({
  page,
}) => {
  await mockInventory(page, { role: "OWNER" });
  let writes = 0;
  await page.route("**/inventory/reorder**", async (route) => {
    if (route.request().method() === "PUT") {
      writes++;
      expect(route.request().postDataJSON().quantity).toBe("2.5");
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({
      json: {
        items: [
          {
            itemId: "rice",
            name: "Rice",
            sku: "R1",
            unit: "PIECE",
            supplier: null,
            currentStock: "0.000000",
            minimum: "5.000000",
            suggested: "5.000000",
            planned: "5.000000",
          },
          {
            itemId: "flour",
            name: "Flour",
            sku: "F1",
            unit: "KILOGRAM",
            supplier: null,
            currentStock: "2.500000",
            minimum: "10.250000",
            suggested: "7.750000",
            planned: null,
          },
        ],
        total: 2,
        page: 0,
        size: 25,
      },
    });
  });
  await page.goto("/reorder");
  const rice = page.getByRole("row").filter({ hasText: "Rice" });
  await expect(
    rice.getByRole("cell", { name: "0", exact: true }),
  ).toBeVisible();
  await expect(rice.getByRole("cell", { name: "5", exact: true })).toHaveCount(
    3,
  );
  const flour = page.getByRole("row").filter({ hasText: "Flour" });
  await expect(
    flour.getByRole("cell", { name: "2.5", exact: true }),
  ).toBeVisible();
  await expect(
    flour.getByRole("cell", { name: "10.25", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit plan for Rice" }).click();
  const input = page.getByLabel("Planned quantity");
  await expect(input).toHaveValue("5");
  await expect(input).toHaveAttribute("step", "1");
  await input.fill("1.5");
  await page.getByRole("button", { name: "Save plan" }).click();
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Edit plan for Flour" }).click();
  await expect(input).toHaveValue("7.75");
  await expect(input).toHaveAttribute("step", "0.000001");
  await input.fill("2.5");
  await page.getByRole("button", { name: "Save plan" }).click();
  await expect.poll(() => writes).toBe(1);
});
