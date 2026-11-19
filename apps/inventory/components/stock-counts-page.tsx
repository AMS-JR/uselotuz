"use client";
import { useEffect, useRef, useState } from "react";
import { Card } from "@uselotuz/ui";
import { useInventory } from "./inventory-shell";
import { Dialog } from "./dialog";
import {
  CatalogError,
  catalogRequest,
  inventoryRequest,
} from "../lib/catalog-api";
import { formatQuantity } from "../lib/quantity";

type CountItem = {
  itemId: string;
  name: string;
  sku: string | null;
  unit: string;
  recorded: string;
  counted: string | null;
  variance: string | null;
};
type Count = {
  id: string;
  locationId: string;
  status: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  version: number;
  createdBy: string;
  createdAt: string;
  completedBy: string | null;
  completedAt: string | null;
  items: CountItem[];
};
type Page = { items: Count[]; total: number; page: number; size: number };
type Item = { id: string; name: string; sku: string | null; unit: string };
type ItemPage = { items: Item[]; total: number };
const control =
  "min-h-11 w-full rounded-control border border-border bg-surface px-3 py-2 text-foreground";
const button =
  "min-h-11 rounded-control border border-border bg-surface px-4 py-2 text-sm font-medium text-primary disabled:opacity-50";
const primary =
  "min-h-11 rounded-control bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
const labels: Record<Count["status"], string> = {
  DRAFT: "Draft",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};
export function StockCountsPage() {
  const { businessId, location } = useInventory();
  return <CountContent key={`${businessId}:${location.id}`} />;
}
function CountContent() {
  const {
    businessId,
    location,
    role,
    onAccessLost,
    user: currentUser,
  } = useInventory();
  const canManage = role === "OWNER" || role === "ADMIN";
  const [list, setList] = useState<Page | null>(null);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [active, setActive] = useState<Count | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [itemPage, setItemPage] = useState(0);
  const [available, setAvailable] = useState<ItemPage | null>(null);
  const [selected, setSelected] = useState<Record<string, Item>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<
    "confirm" | "refresh" | "cancel" | null
  >(null);
  const life = useRef<AbortController | null>(null);
  const onLost = useRef(onAccessLost);
  useEffect(() => {
    onLost.current = onAccessLost;
  }, [onAccessLost]);
  useEffect(() => {
    const c = new AbortController();
    life.current = c;
    return () => c.abort();
  }, []);
  function failure(reason: unknown) {
    if (life.current?.signal.aborted) return;
    if (reason instanceof CatalogError && [401, 403].includes(reason.status)) {
      onLost.current(reason.status);
      return;
    }
    setError(
      reason instanceof Error
        ? reason.message
        : "Unable to complete the request.",
    );
  }
  function adopt(c: Count) {
    setActive(c);
    setDraft(
      Object.fromEntries(
        c.items.map((i) => [
          i.itemId,
          i.counted === null ? "" : formatQuantity(i.counted),
        ]),
      ),
    );
  }
  useEffect(() => {
    const c = new AbortController();
    const timer = setTimeout(() => {
      setList(null);
      inventoryRequest(
        businessId,
        `/counts?${new URLSearchParams({ locationId: location.id, page: String(page), size: "25" })}`,
        { signal: c.signal },
      )
        .then((r) => r.json())
        .then((v: Page) => {
          if (!c.signal.aborted) setList(v);
        })
        .catch((e) => {
          if (!c.signal.aborted) failure(e);
        });
    }, 0);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [businessId, location.id, page, revision]);
  useEffect(() => {
    if (!creating) return;
    const c = new AbortController();
    const timer = setTimeout(() => {
      setAvailable(null);
      catalogRequest(
        businessId,
        `/items?${new URLSearchParams({ q: search, status: "active", page: String(itemPage), size: "25" })}`,
        { signal: c.signal },
      )
        .then((r) => r.json())
        .then((v: ItemPage) => {
          if (!c.signal.aborted) setAvailable(v);
        })
        .catch((e) => {
          if (!c.signal.aborted) failure(e);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      c.abort();
    };
  }, [businessId, creating, search, itemPage]);
  async function request(path: string, method = "GET", body?: unknown) {
    const response = await inventoryRequest(businessId, `/counts${path}`, {
      method,
      signal: life.current?.signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return response.json() as Promise<Count>;
  }
  async function open(id: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      adopt(await request(`/${id}`));
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    setBusy(true);
    setError("");
    try {
      adopt(
        await request("", "POST", {
          locationId: location.id,
          itemIds: Object.keys(selected),
        }),
      );
      setCreating(false);
      setSelected({});
      setNotice(
        "Count created. Enter physical quantities and save your progress.",
      );
      setRevision((n) => n + 1);
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!active) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      adopt(
        await request(`/${active.id}`, "PUT", {
          version: active.version,
          items: active.items.map((i) => ({
            itemId: i.itemId,
            quantity: draft[i.itemId] || null,
          })),
        }),
      );
      setNotice("Count progress saved. Stock has not changed.");
      setRevision((n) => n + 1);
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  async function act(action: "confirm" | "refresh" | "cancel") {
    if (!active) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      adopt(
        await request(`/${active.id}/${action}`, "POST", {
          version: active.version,
        }),
      );
      setConfirmation(null);
      setNotice(
        action === "confirm"
          ? "Count completed and stock reconciled."
          : action === "refresh"
            ? "Balances refreshed. Count each item again before saving."
            : "Count cancelled. Stock has not changed.",
      );
      setRevision((n) => n + 1);
    } catch (e) {
      setConfirmation(null);
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  const changed =
    !!active &&
    active.items.some(
      (i) =>
        (draft[i.itemId] ?? "") !==
        (i.counted === null ? "" : formatQuantity(i.counted)),
    );
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Stock Counts</h1>
          <p className="mt-2 text-muted-foreground">
            Count physical stock and reconcile discrepancies at {location.name}.
          </p>
        </div>
        {canManage && !active && !creating && (
          <button
            className={primary}
            onClick={() => {
              setCreating(true);
              setError("");
              setNotice("");
            }}
          >
            New stock count
          </button>
        )}
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-card border border-border bg-surface p-4"
        >
          {error}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {creating ? (
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between gap-3">
            <h2 className="text-lg font-semibold">Select items</h2>
            <button
              className={button}
              onClick={() => {
                setCreating(false);
                setSelected({});
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            Select up to 100 active items with established opening stock.
            Selected: {Object.keys(selected).length}.
          </p>
          <label className="grid max-w-md gap-2 text-sm font-medium">
            Search items
            <input
              className={control}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setItemPage(0);
              }}
              placeholder="Name or SKU"
            />
          </label>
          {!available ? (
            <p role="status">Loading items...</p>
          ) : available.items.length === 0 ? (
            <Card>No items match this search.</Card>
          ) : (
            <div className="overflow-x-auto rounded-card border border-border bg-surface">
              <table className="w-full min-w-[550px] text-left text-sm">
                <thead>
                  <tr>
                    {["Select", "Item", "SKU", "Unit"].map((x) => (
                      <th key={x} className="px-4 py-3" scope="col">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {available.items.map((i) => (
                    <tr key={i.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <input
                          aria-label={`Select ${i.name}`}
                          type="checkbox"
                          checked={!!selected[i.id]}
                          disabled={
                            !selected[i.id] &&
                            Object.keys(selected).length >= 100
                          }
                          onChange={(e) =>
                            setSelected((old) => {
                              const next = { ...old };
                              if (e.target.checked) next[i.id] = i;
                              else delete next[i.id];
                              return next;
                            })
                          }
                        />
                      </td>
                      <td className="px-4 py-3">{i.name}</td>
                      <td className="px-4 py-3">{i.sku ?? "—"}</td>
                      <td className="px-4 py-3">{i.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {available && (
            <div className="flex items-center gap-3">
              <button
                className={button}
                disabled={itemPage === 0}
                onClick={() => setItemPage((n) => n - 1)}
              >
                Previous items
              </button>
              <span>Page {itemPage + 1}</span>
              <button
                className={button}
                disabled={(itemPage + 1) * 25 >= available.total}
                onClick={() => setItemPage((n) => n + 1)}
              >
                Next items
              </button>
            </div>
          )}
          <button
            className={primary}
            disabled={busy || Object.keys(selected).length === 0}
            onClick={() => void create()}
          >
            Create draft count
          </button>
        </div>
      ) : active ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                Count details · {labels[active.status]}
              </h2>
              <p className="text-sm text-muted-foreground">
                Created {new Date(active.createdAt).toLocaleString()} by{" "}
                {active.createdBy === currentUser?.id
                  ? currentUser.name
                  : active.createdBy}
                {active.completedAt &&
                  ` · Completed ${new Date(active.completedAt).toLocaleString()} by ${active.completedBy}`}
              </p>
            </div>
            <button
              className={button}
              onClick={() => {
                setActive(null);
                setError("");
                setNotice("");
              }}
            >
              Back to counts
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            Recorded quantities are a snapshot. Save counts before reviewing
            variance. Stock changes only after confirmation.
          </p>
          <div
            role="region"
            aria-label="Count items"
            tabIndex={0}
            className="overflow-x-auto rounded-card border border-border bg-surface"
          >
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Item",
                    "SKU",
                    "Unit",
                    "Recorded",
                    "Physical count",
                    "Saved variance",
                  ].map((x) => (
                    <th key={x} className="px-4 py-3" scope="col">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {active.items.map((i) => (
                  <tr key={i.itemId} className="border-t border-border">
                    <td className="px-4 py-3">{i.name}</td>
                    <td className="px-4 py-3">{i.sku ?? "—"}</td>
                    <td className="px-4 py-3">{i.unit}</td>
                    <td className="px-4 py-3">{formatQuantity(i.recorded)}</td>
                    <td className="px-4 py-3">
                      {canManage &&
                      ["DRAFT", "IN_PROGRESS"].includes(active.status) ? (
                        <input
                          aria-label={`Physical count for ${i.name}`}
                          className={control}
                          type="number"
                          min="0"
                          step={i.unit === "PIECE" ? "1" : "0.000001"}
                          value={draft[i.itemId] ?? ""}
                          onChange={(e) =>
                            setDraft((old) => ({
                              ...old,
                              [i.itemId]: e.target.value,
                            }))
                          }
                        />
                      ) : i.counted === null ? (
                        "—"
                      ) : (
                        formatQuantity(i.counted)
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {i.variance === null ? "—" : formatQuantity(i.variance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canManage && ["DRAFT", "IN_PROGRESS"].includes(active.status) && (
            <div className="flex flex-wrap gap-3">
              <button
                className={primary}
                disabled={busy}
                onClick={() => void save()}
              >
                Save progress
              </button>
              <button
                className={button}
                disabled={
                  busy ||
                  changed ||
                  active.items.some((i) => i.counted === null)
                }
                onClick={() => setConfirmation("confirm")}
              >
                Review and reconcile
              </button>
              <button
                className={button}
                disabled={busy}
                onClick={() => setConfirmation("refresh")}
              >
                Refresh and recount
              </button>
              <button
                className={button}
                disabled={busy}
                onClick={() => setConfirmation("cancel")}
              >
                Cancel count
              </button>
              {changed && (
                <p className="self-center text-sm text-muted-foreground">
                  Save changes before reconciliation.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          {!list ? (
            !error && <p role="status">Loading stock counts...</p>
          ) : list.items.length === 0 ? (
            <Card>
              <p>No stock counts yet.</p>
            </Card>
          ) : (
            <div
              role="region"
              aria-label="Stock count sessions"
              tabIndex={0}
              className="overflow-x-auto rounded-card border border-border bg-surface"
            >
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead>
                  <tr>
                    {[
                      "Created",
                      "Status",
                      "Created by",
                      "Completed",
                      "Action",
                    ].map((x) => (
                      <th key={x} scope="col" className="px-4 py-3">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        {new Date(c.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">{labels[c.status]}</td>
                      <td className="px-4 py-3">
                        {c.createdBy === currentUser?.id
                          ? currentUser.name
                          : c.createdBy}
                      </td>
                      <td className="px-4 py-3">
                        {c.completedAt
                          ? new Date(c.completedAt).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className={button}
                          disabled={busy}
                          onClick={() => void open(c.id)}
                        >
                          View count
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {list && (
            <div className="flex items-center gap-3">
              <button
                className={button}
                disabled={page === 0}
                onClick={() => setPage((n) => n - 1)}
              >
                Previous
              </button>
              <span>
                Page {page + 1} · {list.total} counts
              </span>
              <button
                className={button}
                disabled={(page + 1) * list.size >= list.total}
                onClick={() => setPage((n) => n + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
      {confirmation && (
        <Dialog
          label="Confirm stock count action"
          busy={busy}
          onDismiss={() => setConfirmation(null)}
        >
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">
              {confirmation === "confirm"
                ? "Reconcile this count?"
                : confirmation === "refresh"
                  ? "Refresh and recount?"
                  : "Cancel this count?"}
            </h2>
            <p>
              {confirmation === "confirm"
                ? "Saved variances will create stock adjustments. Confirmation cannot be repeated."
                : confirmation === "refresh"
                  ? "Current balances will replace the recorded quantities and all physical counts will be cleared."
                  : "This closes the count without changing stock."}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                className={primary}
                disabled={busy}
                onClick={() => void act(confirmation)}
              >
                {confirmation === "confirm"
                  ? "Confirm reconciliation"
                  : confirmation === "refresh"
                    ? "Refresh balances"
                    : "Confirm cancellation"}
              </button>
              <button
                className={button}
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Go back
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
