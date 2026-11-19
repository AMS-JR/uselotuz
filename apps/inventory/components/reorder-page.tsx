"use client";
import { useEffect, useRef, useState } from "react";
import { Card } from "@uselotuz/ui";
import { Dialog } from "./dialog";
import { formatQuantity } from "../lib/quantity";
import Link from "next/link";
import { useInventory } from "./inventory-shell";
import {
  CatalogError,
  catalogRequest,
  inventoryRequest,
} from "../lib/catalog-api";

type Row = {
  itemId: string;
  name: string;
  sku: string | null;
  unit: string;
  supplier: string | null;
  currentStock: string;
  minimum: string;
  suggested: string;
  planned: string | null;
};
type Result = { items: Row[]; total: number; page: number; size: number };
type Supplier = { id: string; name: string; archived: boolean };
const control =
  "min-h-11 w-full rounded-control border border-border bg-surface px-3 py-2 text-foreground";
const button =
  "min-h-11 rounded-control border border-border bg-surface px-4 py-2 text-sm text-primary disabled:opacity-50";
export function ReorderPage() {
  const inventory = useInventory();
  return (
    <ReorderContent key={`${inventory.businessId}:${inventory.location.id}`} />
  );
}
function ReorderContent() {
  const { businessId, location, role, onAccessLost, href } = useInventory();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [supplier, setSupplier] = useState("");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const lifetime = useRef<AbortController | null>(null);
  const onLost = useRef(onAccessLost);
  useEffect(() => {
    onLost.current = onAccessLost;
  }, [onAccessLost]);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  function failure(reason: unknown) {
    if (lifetime.current?.signal.aborted) return;
    if (reason instanceof CatalogError && [401, 403].includes(reason.status)) {
      onLost.current(reason.status);
      return;
    }
    setError(
      reason instanceof Error ? reason.message : "Unable to load reorder list.",
    );
  }
  function params() {
    const p = new URLSearchParams({ locationId: location.id, q: search });
    if (type) p.set("type", type);
    if (supplier) p.set("supplierId", supplier);
    return p;
  }
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setResult(null);
      setError("");
      try {
        const p = new URLSearchParams({
          locationId: location.id,
          q: search,
          page: String(page),
          size: "25",
        });
        if (type) p.set("type", type);
        if (supplier) p.set("supplierId", supplier);
        const [response, supplierResponse] = await Promise.all([
          inventoryRequest(businessId, `/reorder?${p}`, {
            signal: controller.signal,
          }),
          catalogRequest(businessId, "/suppliers", {
            signal: controller.signal,
          }),
        ]);
        const [data, list] = await Promise.all([
          response.json() as Promise<Result>,
          supplierResponse.json() as Promise<Supplier[]>,
        ]);
        if (!controller.signal.aborted) {
          setResult(data);
          setSuppliers(list);
        }
      } catch (reason) {
        if (!controller.signal.aborted) failure(reason);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [businessId, location.id, search, type, supplier, page, revision]);
  async function savePlan(value: string | null) {
    if (!editing || pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      await inventoryRequest(
        businessId,
        `/reorder/${encodeURIComponent(editing.itemId)}/plan`,
        {
          method: "PUT",
          body: JSON.stringify({ locationId: location.id, quantity: value }),
          signal: lifetime.current?.signal,
        },
      );
      setNotice(`Reorder plan updated for ${editing.name}.`);
      setEditing(null);
      setRevision((n) => n + 1);
    } catch (reason) {
      failure(reason);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  async function exportCsv() {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await inventoryRequest(
        businessId,
        `/reorder/export?${params()}`,
        { signal: lifetime.current?.signal },
      );
      const blob = await response.blob();
      if (lifetime.current?.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lotuz-reorder.csv";
      a.click();
      setNotice("Reorder CSV downloaded.");
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      failure(reason);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <section className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Reorder List
          </h1>
          <p className="mt-2 text-muted-foreground">
            Active items below their minimum stock at {location.name}.
          </p>
        </div>
        <button
          className={`${button} font-medium`}
          disabled={saving}
          onClick={() => void exportCsv()}
        >
          {saving && !editing ? "Preparing CSV..." : "Export CSV"}
        </button>
      </div>
      <p className="text-sm text-muted-foreground">
        Items without an opening balance or minimum are excluded. Suggested
        quantities reflect current stock; saved plans do not change inventory.
        Check{" "}
        <Link className="text-primary" href={href("/items")}>
          Items
        </Link>{" "}
        for uninitialized stock and missing thresholds.
      </p>
      {error && !editing && (
        <p
          role="alert"
          className="rounded-card border border-border bg-surface p-4 text-sm"
        >
          {error}{" "}
          <button
            className="min-h-11 text-primary"
            onClick={() => setRevision((n) => n + 1)}
          >
            Retry
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium">
          Search
          <input
            className={control}
            maxLength={200}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Name or SKU"
          />
        </label>
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
          Supplier
          <select
            className={control}
            value={supplier}
            onChange={(e) => {
              setSupplier(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.archived ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(search || type || supplier) && (
        <button
          className="min-h-11 text-sm font-medium text-primary hover:underline"
          onClick={() => {
            setSearch("");
            setType("");
            setSupplier("");
            setPage(0);
          }}
        >
          Clear filters
        </button>
      )}
      {editing && (
        <Dialog
          label={`Edit reorder plan: ${editing.name}`}
          busy={saving}
          error={error}
          onDismiss={() => setEditing(null)}
        >
          <form
            aria-label="Edit reorder plan"
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void savePlan(quantity);
            }}
          >
            <h2 className="text-lg font-semibold">
              Plan quantity: {editing.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              Suggested: {formatQuantity(editing.suggested)} {editing.unit}
            </p>
            <label className="grid gap-2 text-sm font-medium">
              Planned quantity
              <input
                className={control}
                type="number"
                min="0"
                step={editing.unit === "PIECE" ? "1" : "0.000001"}
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button className={button} disabled={saving} type="submit">
                Save plan
              </button>
              {editing.planned !== null && (
                <button
                  className={button}
                  disabled={saving}
                  type="button"
                  onClick={() => void savePlan(null)}
                >
                  Use suggested
                </button>
              )}
              <button
                className={button}
                disabled={saving}
                type="button"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {!result ? (
        !error && <p role="status">Loading reorder list...</p>
      ) : result.items.length === 0 ? (
        <Card>
          <p>No items need reordering for these filters.</p>
        </Card>
      ) : (
        <div
          className="overflow-x-auto rounded-card border border-border bg-surface"
          role="region"
          aria-label="Reorder table"
          tabIndex={0}
        >
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b border-border bg-background text-muted-foreground">
              <tr>
                {[
                  "Item",
                  "SKU",
                  "Stock",
                  "Minimum",
                  "Suggested",
                  "Planned",
                  "Unit",
                  "Supplier",
                ].map((v) => (
                  <th key={v} scope="col" className="px-4 py-3 font-medium">
                    {v}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.items.map((r) => (
                <tr key={r.itemId}>
                  <td className="break-words px-4 py-4 font-medium">
                    <span>{r.name}</span>
                    {(role === "OWNER" || role === "ADMIN") && (
                      <div>
                        <button
                          className={`${button} mt-2`}
                          onClick={() => {
                            setEditing(r);
                            setQuantity(
                              formatQuantity(r.planned ?? r.suggested),
                            );
                            setNotice("");
                          }}
                        >
                          Edit plan
                          <span className="sr-only"> for {r.name}</span>
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="break-all px-4 py-4">{r.sku ?? "-"}</td>
                  <td className="px-4 py-4">
                    {formatQuantity(r.currentStock)}
                  </td>
                  <td className="px-4 py-4">{formatQuantity(r.minimum)}</td>
                  <td className="px-4 py-4">{formatQuantity(r.suggested)}</td>
                  <td className="px-4 py-4">
                    {r.planned === null ? "—" : formatQuantity(r.planned)}
                  </td>
                  <td className="px-4 py-4">{r.unit}</td>
                  <td className="break-words px-4 py-4">{r.supplier ?? "—"}</td>
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
            Page {page + 1} · {result.total} items
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
