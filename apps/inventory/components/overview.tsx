"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@uselotuz/ui";
import { CatalogError, catalogRequest } from "../lib/catalog-api";
import { useInventory } from "./inventory-shell";
type Summary = {
  activeItems: number;
  categories: number;
  suppliers: number;
  products: number;
  ingredients: number;
  recentItems: {
    id: string;
    name: string;
    itemType: string;
    updatedAt: string;
  }[];
};
export function Overview() {
  const { businessId, businessName, role, href, onAccessLost } = useInventory();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setError("");
      setSummary(null);
      try {
        const response = await catalogRequest(businessId, "/summary", {
          signal: controller.signal,
        });
        const result: Summary = await response.json();
        if (!controller.signal.aborted) setSummary(result);
      } catch (reason) {
        if (controller.signal.aborted) return;
        if (
          reason instanceof CatalogError &&
          [401, 403].includes(reason.status)
        )
          onAccessLost(reason.status);
        else
          setError(
            reason instanceof CatalogError && reason.status === 404
              ? "Unable to load your catalog overview. The overview service is unavailable. Please contact your administrator."
              : "Unable to load your catalog overview. Please try again.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [businessId, onAccessLost, revision]);
  const manage = role === "OWNER" || role === "ADMIN";
  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 break-words text-sm text-muted-foreground">
            {businessName}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Overview
          </h1>
          <p className="mt-2 text-muted-foreground">
            A clear view of your business catalog.
          </p>
        </div>
        {manage && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={href("/items?action=add")}
              className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Add item
            </Link>
            <Link
              href={href("/import-export")}
              className="inline-flex min-h-11 items-center rounded-control border border-border bg-surface px-4 text-sm text-primary"
            >
              Import CSV
            </Link>
          </div>
        )}
      </div>
      {error ? (
        <Card>
          <p role="alert">{error}</p>
          <button
            className="mt-3 min-h-11 text-primary"
            onClick={() => setRevision((value) => value + 1)}
          >
            Try again
          </button>
        </Card>
      ) : !summary ? (
        <p role="status">Loading overview...</p>
      ) : (
        <>
          <dl className="grid gap-4 sm:grid-cols-3">
            {[
              ["Active items", summary.activeItems],
              ["Active categories", summary.categories],
              ["Active suppliers", summary.suppliers],
            ].map(([label, count]) => (
              <Card key={label}>
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-3 text-3xl font-semibold tracking-tight">
                  {count.toLocaleString()}
                </dd>
              </Card>
            ))}
          </dl>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
            <Card className="min-w-0">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">
                  Recently updated items
                </h2>
                <Link
                  href={href("/items")}
                  className="inline-flex min-h-11 items-center text-sm text-primary"
                >
                  View all items
                </Link>
              </div>
              {summary.recentItems.length === 0 ? (
                <div className="py-8">
                  <h3 className="font-medium">Your catalog starts here</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {manage
                      ? "Add your first product or ingredient, or import a catalog CSV."
                      : "Your administrator can add products and ingredients to this business."}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {summary.recentItems.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-4"
                    >
                      <div className="min-w-0">
                        <p className="break-words font-medium">{item.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.itemType === "PRODUCT"
                            ? "Product"
                            : "Ingredient"}
                        </p>
                      </div>
                      <time
                        dateTime={item.updatedAt}
                        className="text-xs text-muted-foreground"
                      >
                        {new Date(item.updatedAt).toLocaleDateString(
                          undefined,
                          { year: "numeric", month: "short", day: "numeric" },
                        )}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <h2 className="text-lg font-semibold">Catalog breakdown</h2>
              <dl className="mt-5 space-y-4">
                <div className="flex justify-between gap-4">
                  <dt className="text-sm text-muted-foreground">Products</dt>
                  <dd className="font-semibold">
                    {summary.products.toLocaleString()}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-sm text-muted-foreground">Ingredients</dt>
                  <dd className="font-semibold">
                    {summary.ingredients.toLocaleString()}
                  </dd>
                </div>
              </dl>
              <p className="mt-6 border-t border-border pt-4 text-xs leading-6 text-muted-foreground">
                Counts include active catalog records. Archived records remain
                available from each page&apos;s status filter.
              </p>
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
