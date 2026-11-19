import { expect, type Page } from "@playwright/test";
export const A = "10000000-0000-0000-0000-000000000001";
export const B = "10000000-0000-0000-0000-000000000002";
export const USER = "00000000-0000-0000-0000-000000000001";
export const emptySummary = {
  activeItems: 0,
  categories: 0,
  suppliers: 0,
  products: 0,
  ingredients: 0,
  recentItems: [],
};
export async function mockInventory(
  page: Page,
  options: {
    role?: string;
    rolesByBusiness?: Record<string, string>;
    profile?: { name?: string; email?: string | null; picture?: string | null };
    businesses?: { id: string; name: string }[];
    enabled?: boolean;
    summaries?: Record<string, unknown>;
  } = {},
) {
  const businesses = options.businesses ?? [
    { id: A, name: "Store" },
    { id: B, name: "Restaurant" },
  ];
  const denied = new Set<string>();
  let expired = false;
  let user = USER;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/config")
      return route.fulfill({ json: { enabled: options.enabled ?? true } });
    if (path === "/api/auth/csrf")
      return route.fulfill({
        json: { headerName: "X-CSRF-TOKEN", token: "session-token" },
      });
    if (expired) return route.fulfill({ status: 401 });
    if (path === "/api/me")
      return route.fulfill({
        json: { id: user, name: "Alex Storekeeper", ...options.profile },
      });
    if (path === "/api/businesses") return route.fulfill({ json: businesses });
    if (path.startsWith("/api/auth/logout"))
      return route.fulfill({ status: 204 });
    const match = path.match(/^\/api\/businesses\/([^/]+)\/(.*)$/);
    if (!match) return route.fulfill({ status: 404 });
    const [, id, tail] = match;
    if (tail === "products")
      return route.fulfill({
        json: [{ code: "inventory", accessible: !denied.has(id) }],
      });
    if (denied.has(id)) return route.fulfill({ status: 403 });
    if (tail === "inventory")
      return route.fulfill({
        json: {
          businessId: id,
          role: options.rolesByBusiness?.[id] ?? options.role ?? "ADMIN",
          location: {
            id: `location-${id}`,
            name: id === A ? "Store room" : "Kitchen",
          },
        },
      });
    if (tail === "inventory/catalog/summary")
      return route.fulfill({ json: options.summaries?.[id] ?? emptySummary });
    if (tail === "inventory/stock/alerts")
      return route.fulfill({ json: { lowStock: 0, outOfStock: 0 } });
    if (tail === "inventory/catalog/items")
      return route.fulfill({ json: { items: [], total: 0 } });
    if (tail === "inventory/stock/batch")
      return route.fulfill({
        json: (new URL(route.request().url()).searchParams.get("itemIds") ?? "")
          .split(",")
          .map((itemId) => ({ itemId, quantity: null })),
      });
    if (
      ["inventory/catalog/categories", "inventory/catalog/suppliers"].includes(
        tail,
      )
    )
      return route.fulfill({ json: [] });
    return route.fulfill({ status: 404 });
  });
  return {
    deny: (id: string) => denied.add(id),
    expire: () => {
      expired = true;
    },
    setUser: (id: string) => {
      user = id;
    },
  };
}
export async function navigate(page: Page, name: string) {
  const nav = page.getByRole("navigation", { name: "Inventory navigation" });
  const link = nav.getByRole("link", { name, exact: true });
  if (!(await link.isVisible()))
    await page.getByRole("button", { name: "Menu", exact: true }).click();
  const destination = new URL((await link.getAttribute("href"))!, page.url())
    .pathname;
  await link.click();
  await expect(page).toHaveURL((url) => url.pathname === destination);
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
