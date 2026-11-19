"use client";
import { useEffect, useRef, useState } from "react";
import { Card } from "@uselotuz/ui";
import { useInventory } from "./inventory-shell";
import { formatQuantity } from "../lib/quantity";
import {
  CatalogError,
  catalogRequest,
  inventoryRequest,
} from "../lib/catalog-api";

type Summary = {
  totalActiveItems: number;
  lowStockItems: number;
  outOfStockItems: number;
  movementsInPeriod: number;
};
type Category = { id: string; name: string; archived: boolean };
type Stock = {
  itemId: string;
  name: string;
  sku: string | null;
  category: string | null;
  itemType: string;
  unit: string;
  currentStock: string | null;
  minimum: string | null;
  stockStatus: string;
};
type Movement = {
  id: string;
  date: string;
  item: string;
  sku: string | null;
  movementType: string;
  quantity: string;
  unit: string;
  reason: string | null;
};
type Result = {
  items: (Stock | Movement)[];
  total: number;
  page: number;
  size: number;
};
const control =
  "min-h-11 w-full rounded-control border border-border bg-surface px-3 py-2 text-foreground";
const button =
  "min-h-11 rounded-control border border-border bg-surface px-4 py-2 text-sm font-medium text-primary disabled:opacity-50";
const statuses: Record<string, string> = {
  IN_STOCK: "In stock",
  LOW_STOCK: "Low stock",
  OUT_OF_STOCK: "Out of stock",
  NOT_ESTABLISHED: "Not established",
  NO_THRESHOLD: "No threshold",
};
const movements: Record<string, string> = {
  OPENING: "Opening",
  RECEIPT: "Receipt",
  ADJUSTMENT: "Adjustment",
  CONSUMPTION: "Consumption",
};
function date(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function ReportsPage() {
  const inventory = useInventory();
  return (
    <ReportsContent key={`${inventory.businessId}:${inventory.location.id}`} />
  );
}
function ReportsContent() {
  const { businessId, location, onAccessLost } = useInventory();
  const [tab, setTab] = useState<"stock" | "movements">("stock");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [movementType, setMovementType] = useState("");
  const [from, setFrom] = useState(() => date(-29));
  const [to, setTo] = useState(() => date(0));
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const onLost = useRef(onAccessLost);
  useEffect(() => {
    onLost.current = onAccessLost;
  }, [onAccessLost]);
  const life = useRef<AbortController | null>(null);
  useEffect(() => {
    const c = new AbortController();
    life.current = c;
    return () => c.abort();
  }, []);
  useEffect(() => {
    const c = new AbortController();
    const timer = setTimeout(async () => {
      setResult(null);
      setSummary(null);
      setError("");
      if (!from || !to || from > to) {
        setError(
          "Choose a valid date range with the start on or before the end.",
        );
        return;
      }
      const params = new URLSearchParams({
        locationId: location.id,
        from,
        to,
        q: search,
        page: String(page),
        size: "25",
      });
      if (tab === "stock") {
        if (type) params.set("type", type);
        if (category) params.set("categoryId", category);
        if (status) params.set("status", status);
      } else if (movementType) params.set("movementType", movementType);
      try {
        const [report, totals, cats] = await Promise.all([
          inventoryRequest(businessId, `/reports/${tab}?${params}`, {
            signal: c.signal,
          }),
          inventoryRequest(
            businessId,
            `/reports/summary?${new URLSearchParams({ locationId: location.id, from, to })}`,
            { signal: c.signal },
          ),
          catalogRequest(businessId, "/categories", { signal: c.signal }),
        ]);
        const [reportData, totalData, categoryData] = await Promise.all([
          report.json() as Promise<Result>,
          totals.json() as Promise<Summary>,
          cats.json() as Promise<Category[]>,
        ]);
        if (!c.signal.aborted) {
          setResult(reportData);
          setSummary(totalData);
          setCategories(categoryData);
        }
      } catch (e) {
        if (!c.signal.aborted) {
          if (e instanceof CatalogError && [401, 403].includes(e.status))
            onLost.current(e.status);
          else
            setError(
              e instanceof Error ? e.message : "Unable to load reports.",
            );
        }
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [
    businessId,
    location.id,
    tab,
    search,
    type,
    category,
    status,
    movementType,
    from,
    to,
    page,
    retry,
  ]);
  async function download() {
    setExporting(true);
    setError("");
    setNotice("");
    const params = new URLSearchParams({
      locationId: location.id,
      from,
      to,
      q: search,
    });
    if (tab === "stock") {
      if (type) params.set("type", type);
      if (category) params.set("categoryId", category);
      if (status) params.set("status", status);
    } else if (movementType) params.set("movementType", movementType);
    try {
      const response = await inventoryRequest(
        businessId,
        `/reports/${tab}/export?${params}`,
        { signal: life.current?.signal },
      );
      const blob = await response.blob();
      if (life.current?.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lotuz-${tab}-report.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Report CSV downloaded.");
    } catch (e) {
      if (!life.current?.signal.aborted) {
        if (e instanceof CatalogError && [401, 403].includes(e.status))
          onLost.current(e.status);
        else
          setError(e instanceof Error ? e.message : "Unable to export report.");
      }
    } finally {
      setExporting(false);
    }
  }
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="mt-2 text-muted-foreground">
          Understand your inventory levels and stock activity.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            ["Total Active Items", summary?.totalActiveItems],
            ["Low Stock Items", summary?.lowStockItems],
            ["Out of Stock Items", summary?.outOfStockItems],
            ["Movements in Period", summary?.movementsInPeriod],
          ] as const
        ).map(([label, value]) => (
          <Card key={label}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value ?? "—"}</p>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Report views">
        {(
          [
            ["stock", "Current Stock"],
            ["movements", "Stock Movements"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={button}
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key);
              setSearch("");
              setPage(0);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-2 text-sm font-medium">
          Search
          <input
            className={control}
            value={search}
            maxLength={200}
            placeholder="Name or SKU"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </label>
        {tab === "stock" ? (
          <>
            <label className="grid gap-2 text-sm font-medium">
              Item type
              <select
                className={control}
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">All types</option>
                <option value="PRODUCT">Product</option>
                <option value="INGREDIENT">Ingredient</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Category
              <select
                className={control}
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.archived ? " (archived)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Stock status
              <select
                className={control}
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">All statuses</option>
                {Object.entries(statuses).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="grid gap-2 text-sm font-medium">
              Movement type
              <select
                className={control}
                value={movementType}
                onChange={(e) => {
                  setMovementType(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">All movements</option>
                {Object.entries(movements).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="grid gap-2 text-sm font-medium">
          From date (UTC)
          <input
            className={control}
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          To date (UTC)
          <input
            className={control}
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(0);
            }}
          />
        </label>
      </div>
      <button
        className={button}
        disabled={exporting || !from || !to || from > to}
        onClick={() => void download()}
      >
        {exporting
          ? "Preparing CSV..."
          : tab === "stock"
            ? "Export Current Stock"
            : "Export Stock Movements"}
      </button>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            className="text-primary"
            onClick={() => setRetry((n) => n + 1)}
          >
            Retry
          </button>
        </p>
      )}
      {!result ? (
        !error && <p role="status">Loading report...</p>
      ) : result.items.length === 0 ? (
        <Card>
          <p>No results for these filters.</p>
        </Card>
      ) : (
        <div
          role="region"
          aria-label="Report table"
          tabIndex={0}
          className="overflow-x-auto rounded-card border border-border bg-surface"
        >
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-border bg-background text-muted-foreground">
              <tr>
                {(tab === "stock"
                  ? [
                      "Item",
                      "SKU",
                      "Category",
                      "Item type",
                      "Unit",
                      "Current stock",
                      "Minimum stock",
                      "Stock status",
                    ]
                  : [
                      "Date and time",
                      "Item",
                      "SKU",
                      "Movement type",
                      "Quantity change",
                      "Unit",
                      "Reason or note",
                    ]
                ).map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tab === "stock"
                ? (result.items as Stock[]).map((r) => (
                    <tr key={r.itemId}>
                      {[
                        r.name,
                        r.sku ?? "—",
                        r.category ?? "—",
                        r.itemType,
                        r.unit,
                        r.currentStock === null
                          ? "—"
                          : formatQuantity(r.currentStock),
                        r.minimum === null ? "—" : formatQuantity(r.minimum),
                        statuses[r.stockStatus] ?? r.stockStatus,
                      ].map((v, i) => (
                        <td key={i} className="px-4 py-3">
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))
                : (result.items as Movement[]).map((r) => (
                    <tr key={r.id}>
                      {[
                        new Date(r.date).toLocaleString(),
                        r.item,
                        r.sku ?? "—",
                        movements[r.movementType] ?? r.movementType,
                        `${r.quantity.startsWith("-") ? "" : "+"}${formatQuantity(r.quantity)}`,
                        r.unit,
                        r.reason ?? "—",
                      ].map((v, i) => (
                        <td key={i} className="px-4 py-3">
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}
      {result && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            className={button}
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <p className="text-sm">
            Page {page + 1} · {result.total} results
          </p>
          <button
            className={button}
            disabled={(page + 1) * result.size >= result.total}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
