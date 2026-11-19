"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Card } from "@uselotuz/ui";
import { Dialog } from "./dialog";
import { formatQuantity } from "../lib/quantity";
import { ItemActions } from "./item-actions";
import {
  CatalogError,
  catalogRequest,
  inventoryRequest,
} from "../lib/catalog-api";

type Category = { id: string; name: string; archived: boolean };
type Supplier = Category & {
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
};
type Item = Category & {
  description?: string;
  sku?: string;
  barcode?: string;
  itemType: string;
  unit: string;
  categoryId?: string;
  supplierId?: string;
  createdAt?: string;
  updatedAt?: string;
};
type ItemPage = { items: Item[]; total: number };
type Movement = {
  id: string;
  type: string;
  quantity: string;
  unit: string;
  createdAt: string;
  createdBy: string;
  reason: string | null;
  reference: string | null;
  notes: string | null;
};
type History = {
  movements: Movement[];
  total: number;
  page: number;
  size: number;
};
type Section = "items" | "categories" | "suppliers";
type Draft = Record<string, string>;
const units = [
  ["PIECE", "Pieces"],
  ["GRAM", "Grams"],
  ["KILOGRAM", "Kilograms"],
  ["MILLILITER", "Milliliters"],
  ["LITER", "Liters"],
];
const control =
  "min-h-11 w-full rounded-control border border-border bg-surface px-3 py-2 text-foreground disabled:bg-background";
const button =
  "min-h-11 rounded-control bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50";
const secondary =
  "min-h-11 rounded-control border border-border bg-surface px-4 py-2 text-sm text-primary disabled:opacity-50";
function Field({
  name,
  label,
  draft,
  setDraft,
  required = false,
  maxLength = 200,
  type = "text",
  readOnly = false,
}: {
  name: string;
  label: string;
  draft: Draft;
  setDraft: (draft: Draft) => void;
  required?: boolean;
  maxLength?: number;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <input
        className={control}
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        value={draft[name] ?? ""}
        readOnly={readOnly}
        onChange={(e) => setDraft({ ...draft, [name]: e.target.value })}
      />
    </label>
  );
}

export function Catalog({
  businessId,
  role,
  currentUser,
  location,
  onAccessLost,
  section,
  addInitially = false,
  initialStockFilter = "",
}: {
  businessId: string;
  role: string;
  currentUser: { id: string; name: string };
  location: { id: string; name: string };
  onAccessLost: (status: number) => void;
  section: Section;
  addInitially?: boolean;
  initialStockFilter?: string;
}) {
  const canManage = role === "OWNER" || role === "ADMIN";
  const [items, setItems] = useState<Item[]>([]);
  const [stock, setStock] = useState<Record<string, string | null>>({});
  const [stockDetails, setStockDetails] = useState<
    Record<string, { threshold: string | null; stockStatus: string }>
  >({});
  const [stockFilter, setStockFilter] = useState(initialStockFilter);
  const [openActions, setOpenActions] = useState<string | null>(null);
  const [thresholdItem, setThresholdItem] = useState<Item | null>(null);
  const [thresholdValue, setThresholdValue] = useState("");
  const thresholdPending = useRef(false);
  const [opening, setOpening] = useState<Item | null>(null);
  const [receiving, setReceiving] = useState<Item | null>(null);
  const [adjusting, setAdjusting] = useState<Item | null>(null);
  const [consuming, setConsuming] = useState<Item | null>(null);
  const [consumptionReason, setConsumptionReason] = useState("");
  const consumptionKey = useRef("");
  const consumptionPending = useRef(false);
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const adjustmentKey = useRef("");
  const adjustmentPending = useRef(false);
  const [historyItem, setHistoryItem] = useState<Item | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyRequest = useRef<AbortController | null>(null);
  const [receiptSupplier, setReceiptSupplier] = useState("");
  const [receiptReference, setReceiptReference] = useState("");
  const [receiptNotes, setReceiptNotes] = useState("");
  const receiptKey = useRef("");
  const receiptPending = useRef(false);
  const [quantity, setQuantity] = useState("");
  const openingPending = useRef(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<{
    id?: string;
    archived?: boolean;
    createdAt?: string;
    updatedAt?: string;
  } | null>(addInitially && canManage ? {} : null);
  const [draft, setDraft] = useState<Draft>({
    itemType: "PRODUCT",
    unit: "PIECE",
  });
  const [archive, setArchive] = useState<Category | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const onLost = useRef(onAccessLost);
  useEffect(() => {
    onLost.current = onAccessLost;
  }, [onAccessLost]);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => {
      controller.abort();
      historyRequest.current?.abort();
    };
  }, []);
  function failure(reason: unknown) {
    if (lifetime.current?.signal.aborted) return;
    if (reason instanceof CatalogError && [401, 403].includes(reason.status)) {
      onLost.current(reason.status);
      return;
    }
    setError(
      reason instanceof Error
        ? reason.message
        : "Unable to connect. Please try again.",
    );
  }
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({
          q: search,
          status,
          page: String(page),
          size: "25",
        });
        if (type) query.set("type", type);
        if (category) query.set("categoryId", category);
        if (stockFilter) {
          query.set("stockStatus", stockFilter);
          query.set("locationId", location.id);
        }
        const [itemResponse, categoryResponse, supplierResponse] =
          await Promise.all([
            section === "items"
              ? catalogRequest(businessId, `/items?${query}`, {
                  signal: controller.signal,
                })
              : Promise.resolve(null),
            section !== "suppliers"
              ? catalogRequest(businessId, "/categories", {
                  signal: controller.signal,
                })
              : Promise.resolve(null),
            section !== "categories"
              ? catalogRequest(businessId, "/suppliers", {
                  signal: controller.signal,
                })
              : Promise.resolve(null),
          ]);
        const [result, cats, sups] = await Promise.all([
          itemResponse
            ? (itemResponse.json() as Promise<ItemPage>)
            : Promise.resolve({ items: [], total: 0 }),
          categoryResponse
            ? (categoryResponse.json() as Promise<Category[]>)
            : Promise.resolve([]),
          supplierResponse
            ? (supplierResponse.json() as Promise<Supplier[]>)
            : Promise.resolve([]),
        ]);
        let balances: {
          itemId: string;
          quantity: string | null;
          threshold: string | null;
          stockStatus: string;
        }[] = [];
        if (result.items.length) {
          const params = new URLSearchParams({
            locationId: location.id,
            itemIds: result.items.map((i) => i.id).join(","),
          });
          balances = await (
            await inventoryRequest(businessId, `/stock/batch?${params}`, {
              signal: controller.signal,
            })
          ).json();
        }
        if (controller.signal.aborted) return;
        setStock(
          Object.fromEntries(
            balances.map((balance) => [balance.itemId, balance.quantity]),
          ),
        );
        setStockDetails(
          Object.fromEntries(
            balances.map((balance) => [
              balance.itemId,
              {
                threshold: balance.threshold,
                stockStatus: balance.stockStatus,
              },
            ]),
          ),
        );
        setItems(result.items);
        setTotal(result.total);
        setCategories(cats);
        setSuppliers(sups);
      } catch (reason) {
        if (!controller.signal.aborted) {
          setItems([]);
          setCategories([]);
          setSuppliers([]);
          if (
            reason instanceof CatalogError &&
            [401, 403].includes(reason.status)
          )
            onLost.current(reason.status);
          else
            setError(
              reason instanceof Error
                ? reason.message
                : "Unable to load catalog.",
            );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    businessId,
    location.id,
    stockFilter,
    section,
    search,
    status,
    type,
    category,
    page,
    revision,
  ]);
  const refresh = () => setRevision((value) => value + 1);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !editor) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const body =
        section === "items"
          ? {
              ...draft,
              categoryId: draft.categoryId || null,
              supplierId: draft.supplierId || null,
            }
          : draft;
      await catalogRequest(
        businessId,
        `/${section}${editor.id ? `/${editor.id}` : ""}`,
        {
          method: editor.id ? "PUT" : "POST",
          body: JSON.stringify(body),
          signal: lifetime.current?.signal,
        },
      );
      if (lifetime.current?.signal.aborted) return;
      setEditor(null);
      setNotice("Saved successfully.");
      refresh();
    } catch (reason) {
      failure(reason);
    } finally {
      setSaving(false);
    }
  }
  async function confirmArchive() {
    if (!archive) return;
    setSaving(true);
    setError("");
    try {
      await catalogRequest(businessId, `/${section}/${archive.id}/archive`, {
        method: "POST",
        signal: lifetime.current?.signal,
      });
      if (lifetime.current?.signal.aborted) return;
      setArchive(null);
      setNotice("Record archived. Its history is preserved.");
      refresh();
    } catch (reason) {
      failure(reason);
    } finally {
      setSaving(false);
    }
  }
  function edit(record?: Item | Supplier | Category) {
    if (section === "items") setHistoryItem(null);
    setError("");
    setNotice("");
    setEditor(record ? { ...record } : {});
    setDraft(
      record
        ? Object.fromEntries(
            Object.entries(record).filter(
              (entry): entry is [string, string] =>
                typeof entry[1] === "string",
            ),
          )
        : { itemType: "PRODUCT", unit: "PIECE" },
    );
  }
  const records =
    section === "items"
      ? items
      : (section === "categories" ? categories : suppliers).filter(
          (record) =>
            status === "all" || record.archived === (status === "archived"),
        );
  function rowActions(record: Category) {
    return (
      <div className="flex flex-wrap gap-2">
        <button
          className={secondary}
          disabled={saving}
          aria-label={`${canManage && !record.archived ? "Edit" : "View"} ${record.name}`}
          onClick={() => edit(record)}
        >
          {canManage && !record.archived ? "Edit" : "View"}
        </button>
        {canManage && !record.archived && (
          <button
            className={secondary}
            disabled={saving}
            aria-label={`Archive ${record.name}`}
            onClick={() => {
              setArchive(record);
              if (section === "items") setHistoryItem(null);
              setEditor(null);
            }}
          >
            Archive
          </button>
        )}
      </div>
    );
  }
  async function saveOpening(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!opening || openingPending.current) return;
    openingPending.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await inventoryRequest(
        businessId,
        `/stock/${encodeURIComponent(opening.id)}/opening`,
        {
          method: "POST",
          body: JSON.stringify({ locationId: location.id, quantity }),
          signal: lifetime.current?.signal,
        },
      );
      const result: { quantity: string } = await response.json();
      setStock((current) => ({ ...current, [opening.id]: result.quantity }));
      setNotice(`Opening stock established for ${opening.name}.`);
      setOpening(null);
      setQuantity("");
      if (historyItem?.id === opening.id) void loadHistory(opening, 0);
      refresh();
    } catch (reason) {
      failure(reason);
    } finally {
      openingPending.current = false;
      setSaving(false);
    }
  }
  async function saveReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receiving || receiptPending.current) return;
    receiptPending.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await inventoryRequest(
        businessId,
        `/stock/${encodeURIComponent(receiving.id)}/receipts`,
        {
          method: "POST",
          body: JSON.stringify({
            locationId: location.id,
            quantity,
            supplierId: receiptSupplier || null,
            reference: receiptReference,
            notes: receiptNotes,
            idempotencyKey: receiptKey.current,
          }),
          signal: lifetime.current?.signal,
        },
      );
      const result: { currentQuantity: string } = await response.json();
      setStock((current) => ({
        ...current,
        [receiving.id]: result.currentQuantity,
      }));
      setNotice(
        `Stock received for ${receiving.name}. Current stock: ${formatQuantity(result.currentQuantity)}.`,
      );
      setReceiving(null);
      setQuantity("");
      if (historyItem?.id === receiving.id) void loadHistory(receiving, 0);
      refresh();
    } catch (reason) {
      failure(reason);
    } finally {
      receiptPending.current = false;
      setSaving(false);
    }
  }
  async function saveAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adjusting || adjustmentPending.current) return;
    adjustmentPending.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await inventoryRequest(
        businessId,
        `/stock/${encodeURIComponent(adjusting.id)}/adjustments`,
        {
          method: "POST",
          body: JSON.stringify({
            locationId: location.id,
            quantity,
            reason: adjustmentReason,
            idempotencyKey: adjustmentKey.current,
          }),
          signal: lifetime.current?.signal,
        },
      );
      const result: { currentQuantity: string } = await response.json();
      setStock((current) => ({
        ...current,
        [adjusting.id]: result.currentQuantity,
      }));
      setNotice(
        `Stock adjusted for ${adjusting.name}. Current stock: ${formatQuantity(result.currentQuantity)}.`,
      );
      setAdjusting(null);
      setQuantity("");
      if (historyItem?.id === adjusting.id) void loadHistory(adjusting, 0);
      refresh();
    } catch (reason) {
      failure(reason);
    } finally {
      adjustmentPending.current = false;
      setSaving(false);
    }
  }
  async function saveConsumption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!consuming || consumptionPending.current) return;
    consumptionPending.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await inventoryRequest(
        businessId,
        `/stock/${encodeURIComponent(consuming.id)}/consumption`,
        {
          method: "POST",
          body: JSON.stringify({
            locationId: location.id,
            quantity,
            reason: consumptionReason,
            idempotencyKey: consumptionKey.current,
          }),
          signal: lifetime.current?.signal,
        },
      );
      const result: { currentQuantity: string } = await response.json();
      setStock((current) => ({
        ...current,
        [consuming.id]: result.currentQuantity,
      }));
      setNotice(
        `Stock consumption recorded for ${consuming.name}. Current stock: ${formatQuantity(result.currentQuantity)}.`,
      );
      setConsuming(null);
      setQuantity("");
      if (historyItem?.id === consuming.id) void loadHistory(consuming, 0);
      refresh();
    } catch (reason) {
      failure(reason);
    } finally {
      consumptionPending.current = false;
      setSaving(false);
    }
  }
  async function saveThreshold(value: string | null) {
    if (!thresholdItem || thresholdPending.current) return;
    thresholdPending.current = true;
    setSaving(true);
    setError("");
    try {
      await inventoryRequest(
        businessId,
        `/stock/${encodeURIComponent(thresholdItem.id)}/threshold`,
        {
          method: "PUT",
          body: JSON.stringify({ locationId: location.id, quantity: value }),
          signal: lifetime.current?.signal,
        },
      );
      setStockDetails((current) => ({
        ...current,
        [thresholdItem.id]: { ...current[thresholdItem.id], threshold: value },
      }));
      setNotice(
        value === null
          ? `Minimum stock removed for ${thresholdItem.name}.`
          : `Minimum stock updated for ${thresholdItem.name}.`,
      );
      setThresholdItem(null);
      refresh();
    } catch (reason) {
      failure(reason);
    } finally {
      thresholdPending.current = false;
      setSaving(false);
    }
  }
  async function loadHistory(item: Item, page: number) {
    historyRequest.current?.abort();
    const controller = new AbortController();
    historyRequest.current = controller;
    setHistoryItem(item);
    setHistory(null);
    setHistoryLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        locationId: location.id,
        page: String(page),
        size: "25",
      });
      const response = await inventoryRequest(
        businessId,
        `/stock/${encodeURIComponent(item.id)}/movements?${params}`,
        { signal: controller.signal },
      );
      const result: History = await response.json();
      if (!controller.signal.aborted) setHistory(result);
    } catch (reason) {
      if (!controller.signal.aborted) failure(reason);
    } finally {
      if (!controller.signal.aborted) setHistoryLoading(false);
    }
  }
  const readOnly = !canManage || Boolean(editor?.archived);
  return (
    <section className="space-y-6" aria-label="Inventory catalog">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {section === "items"
              ? "Items"
              : section === "categories"
                ? "Categories"
                : "Suppliers"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {section === "items"
              ? "Your products and ingredients, organized in one place."
              : section === "categories"
                ? "Keep your catalog easy to browse with simple categories."
                : "Manage supplier contacts and catalog associations."}
          </p>
        </div>
        {!canManage && (
          <p className="text-sm text-muted-foreground">View-only access</p>
        )}
      </div>

      {error &&
        !(
          thresholdItem ||
          opening ||
          adjusting ||
          consuming ||
          receiving ||
          historyItem
        ) && (
          <div
            role="alert"
            className="rounded-card border border-border bg-surface p-4"
          >
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {error}
            </p>
            <button className={`${secondary} mt-3`} onClick={refresh}>
              Retry loading
            </button>
          </div>
        )}
      {notice && !historyItem && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {thresholdItem && (
        <Dialog
          label="Stock threshold"
          busy={saving}
          error={error}
          onDismiss={() => setThresholdItem(null)}
        >
          <form
            aria-label="Stock threshold"
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveThreshold(thresholdValue);
            }}
          >
            <h2 className="text-lg font-semibold">
              Minimum stock: {thresholdItem.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              Location: {location.name} · Unit:{" "}
              {units.find(([code]) => code === thresholdItem.unit)?.[1]}
            </p>
            <label className="grid gap-2 text-sm font-medium">
              Minimum quantity
              <input
                className={control}
                type="number"
                min="0"
                step={thresholdItem.unit === "PIECE" ? "1" : "0.000001"}
                required
                value={thresholdValue}
                onChange={(event) => setThresholdValue(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button className={button} disabled={saving} type="submit">
                Save threshold
              </button>
              {stockDetails[thresholdItem.id]?.threshold != null && (
                <button
                  className={secondary}
                  disabled={saving}
                  type="button"
                  onClick={() => void saveThreshold(null)}
                >
                  Remove threshold
                </button>
              )}
              <button
                className={secondary}
                disabled={saving}
                type="button"
                onClick={() => setThresholdItem(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {opening && (
        <Dialog
          label="Opening stock"
          busy={saving}
          error={error}
          onDismiss={() => setOpening(null)}
        >
          <form
            onSubmit={(event) => void saveOpening(event)}
            className="space-y-4"
            aria-label="Establish opening stock"
          >
            <h2 className="text-lg font-semibold">
              Opening stock: {opening.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              Location: {location.name} · Unit:{" "}
              {units.find(([code]) => code === opening.unit)?.[1]}
            </p>
            <label className="grid gap-2 text-sm font-medium">
              Opening quantity
              <input
                className={control}
                type="number"
                min="0"
                step={opening.unit === "PIECE" ? "1" : "0.000001"}
                required
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button className={button} disabled={saving} type="submit">
                {saving ? "Saving..." : "Save opening stock"}
              </button>
              <button
                className={secondary}
                disabled={saving}
                type="button"
                onClick={() => {
                  setOpening(null);
                  setQuantity("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {adjusting && (
        <Dialog
          label="Adjust stock"
          busy={saving}
          error={error}
          onDismiss={() => setAdjusting(null)}
        >
          <form
            onSubmit={(event) => void saveAdjustment(event)}
            className="space-y-4"
            aria-label="Adjust stock"
          >
            <h2 className="text-lg font-semibold">
              Adjust stock: {adjusting.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              Location: {location.name} · Current stock:{" "}
              {formatQuantity(stock[adjusting.id] ?? "")}{" "}
              {units.find(([code]) => code === adjusting.unit)?.[1]}
            </p>
            <label className="grid gap-2 text-sm font-medium">
              Change in quantity
              <input
                className={control}
                type="text"
                inputMode="decimal"
                required
                pattern="-?[0-9]+(\.[0-9]+)?"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <p className="text-sm text-muted-foreground">
              Correct a discrepancy: enter a positive quantity to increase stock
              or a minus sign to decrease it. Stock cannot fall below zero.
            </p>
            <label className="grid gap-2 text-sm font-medium">
              Reason
              <textarea
                className={control}
                maxLength={500}
                required
                value={adjustmentReason}
                onChange={(event) => setAdjustmentReason(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button className={button} disabled={saving} type="submit">
                {saving ? "Saving..." : "Save adjustment"}
              </button>
              <button
                className={secondary}
                disabled={saving}
                type="button"
                onClick={() => {
                  setAdjusting(null);
                  setQuantity("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {consuming && (
        <Dialog
          label="Consume stock"
          busy={saving}
          error={error}
          onDismiss={() => setConsuming(null)}
        >
          <form
            onSubmit={(event) => void saveConsumption(event)}
            className="space-y-4"
            aria-label="Consume stock"
          >
            <h2 className="text-lg font-semibold">
              Consume stock: {consuming.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              Location: {location.name} · Current stock:{" "}
              {formatQuantity(stock[consuming.id] ?? "")}{" "}
              {units.find(([code]) => code === consuming.unit)?.[1]}
            </p>
            <p className="text-sm text-muted-foreground">
              Consumption decreases stock for a sale, internal use, waste, or
              another reason. Enter a positive quantity no greater than the
              current stock.
            </p>
            <label className="grid gap-2 text-sm font-medium">
              Quantity consumed
              <input
                className={control}
                type="number"
                min={consuming.unit === "PIECE" ? "1" : "0.000001"}
                step={consuming.unit === "PIECE" ? "1" : "0.000001"}
                required
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Reason
              <textarea
                className={control}
                maxLength={500}
                required
                value={consumptionReason}
                onChange={(event) => setConsumptionReason(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button className={button} disabled={saving} type="submit">
                {saving ? "Saving..." : "Record consumption"}
              </button>
              <button
                className={secondary}
                disabled={saving}
                type="button"
                onClick={() => {
                  setConsuming(null);
                  setQuantity("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {historyItem && (
        <Dialog
          label={`Item details: ${historyItem.name}`}
          wide
          error={
            thresholdItem || opening || adjusting || consuming || receiving
              ? ""
              : error
          }
          onDismiss={() => {
            historyRequest.current?.abort();
            setHistoryItem(null);
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{historyItem.name}</h2>
            <button
              className={secondary}
              onClick={() => {
                historyRequest.current?.abort();
                setHistoryItem(null);
              }}
            >
              Close details
            </button>
          </div>
          <dl className="mt-5 grid gap-4 rounded-card bg-background p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">SKU</dt>
              <dd className="mt-1 break-words font-medium">
                {historyItem.sku || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Current stock</dt>
              <dd className="mt-1 font-medium">
                {stock[historyItem.id] == null
                  ? "Not established"
                  : `${formatQuantity(stock[historyItem.id] ?? "")} ${units.find(([code]) => code === historyItem.unit)?.[1] ?? historyItem.unit}`}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Minimum</dt>
              <dd className="mt-1 font-medium">
                {stockDetails[historyItem.id]?.threshold == null
                  ? "Not configured"
                  : formatQuantity(
                      stockDetails[historyItem.id].threshold ?? "",
                    )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Supplier</dt>
              <dd className="mt-1 break-words font-medium">
                {suppliers.find(
                  (supplier) => supplier.id === historyItem.supplierId,
                )?.name ?? "None"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Type</dt>
              <dd className="mt-1 font-medium capitalize">
                {historyItem.itemType.toLowerCase()}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Category</dt>
              <dd className="mt-1 break-words font-medium">
                {categories.find(
                  (category) => category.id === historyItem.categoryId,
                )?.name ?? "Uncategorized"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Barcode</dt>
              <dd className="mt-1 break-all font-medium">
                {historyItem.barcode || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="mt-1 font-medium">
                {historyItem.archived ? "Archived" : "Active"}
              </dd>
            </div>
          </dl>
          {historyItem.description && (
            <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">
              {historyItem.description}
            </p>
          )}
          {notice && (
            <p role="status" className="mt-4 text-sm">
              {notice}
            </p>
          )}
          {canManage && !historyItem.archived && (
            <section
              className="mt-6 border-t border-border pt-5"
              aria-label="Manage product"
            >
              <h3 className="text-base font-semibold">Manage product</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Receive adds stock, consume removes stock, and adjust corrects
                discrepancies.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {rowActions(historyItem)}

                {canManage && !historyItem.archived && (
                  <button
                    className={`${secondary} mt-2`}
                    onClick={() => {
                      setThresholdItem(historyItem);
                      setError("");
                      setThresholdValue(
                        formatQuantity(
                          stockDetails[historyItem.id]?.threshold ?? "",
                        ),
                      );
                      setOpening(null);
                      setReceiving(null);
                      setAdjusting(null);
                      setConsuming(null);
                    }}
                  >
                    Set minimum
                    <span className="sr-only"> for {historyItem.name}</span>
                  </button>
                )}
                {canManage &&
                  !historyItem.archived &&
                  stock[historyItem.id] === null && (
                    <button
                      className={`${secondary} mt-2`}
                      onClick={() => {
                        setOpening(historyItem);
                        setError("");
                        setThresholdItem(null);
                        setReceiving(null);
                        setAdjusting(null);
                        setConsuming(null);
                        setQuantity("");
                        setNotice("");
                      }}
                    >
                      Set opening stock
                      <span className="sr-only"> for {historyItem.name}</span>
                    </button>
                  )}
                {canManage &&
                  !historyItem.archived &&
                  stock[historyItem.id] != null && (
                    <button
                      className={`${secondary} mt-2`}
                      onClick={() => {
                        setReceiving(historyItem);
                        setError("");
                        setThresholdItem(null);
                        setOpening(null);
                        setAdjusting(null);
                        setConsuming(null);
                        setQuantity("");
                        setReceiptSupplier(
                          suppliers.some(
                            (supplier) =>
                              supplier.id === historyItem.supplierId &&
                              !supplier.archived,
                          )
                            ? (historyItem.supplierId ?? "")
                            : "",
                        );
                        setReceiptReference("");
                        setReceiptNotes("");
                        receiptKey.current = crypto.randomUUID();
                        setNotice("");
                      }}
                    >
                      Receive stock
                      <span className="sr-only"> for {historyItem.name}</span>
                    </button>
                  )}
                {canManage &&
                  !historyItem.archived &&
                  stock[historyItem.id] != null && (
                    <button
                      className={`${secondary} mt-2`}
                      onClick={() => {
                        setAdjusting(historyItem);
                        setError("");
                        setThresholdItem(null);
                        setOpening(null);
                        setReceiving(null);
                        setConsuming(null);
                        setQuantity("");
                        setAdjustmentReason("");
                        adjustmentKey.current = crypto.randomUUID();
                        setNotice("");
                      }}
                    >
                      Adjust stock
                      <span className="sr-only"> for {historyItem.name}</span>
                    </button>
                  )}
                {canManage &&
                  !historyItem.archived &&
                  stock[historyItem.id] != null && (
                    <button
                      className={`${secondary} mt-2`}
                      onClick={() => {
                        setConsuming(historyItem);
                        setError("");
                        setThresholdItem(null);
                        setOpening(null);
                        setReceiving(null);
                        setAdjusting(null);
                        setQuantity("");
                        setConsumptionReason("");
                        consumptionKey.current = crypto.randomUUID();
                        setNotice("");
                      }}
                    >
                      Consume stock
                      <span className="sr-only"> for {historyItem.name}</span>
                    </button>
                  )}
              </div>
            </section>
          )}
          <h3 className="mt-7 text-lg font-semibold">Stock history</h3>
          {historyLoading && (
            <p role="status" className="mt-4">
              Loading stock history...
            </p>
          )}
          {history &&
            (history.movements.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No stock movements yet.
              </p>
            ) : (
              <div
                className="mt-4 overflow-x-auto rounded-control border border-border"
                role="region"
                aria-label="Stock history table"
                tabIndex={0}
              >
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-background text-muted-foreground">
                    <tr>
                      {["Date", "Movement", "Quantity", "Reason", "User"].map(
                        (label) => (
                          <th
                            key={label}
                            scope="col"
                            className="px-4 py-3 font-medium"
                          >
                            {label}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {history.movements.map((movement) => (
                      <tr key={movement.id}>
                        <td className="break-all px-4 py-3">
                          {new Date(movement.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {movement.type === "OPENING"
                            ? "Opening stock"
                            : movement.type === "RECEIPT"
                              ? "Receipt"
                              : movement.type === "CONSUMPTION"
                                ? "Consumption"
                                : "Adjustment"}
                        </td>
                        <td className="px-4 py-3">
                          {formatQuantity(movement.quantity)}{" "}
                          {units.find(
                            ([code]) => code === movement.unit,
                          )?.[1] ?? movement.unit}
                        </td>
                        <td className="break-words px-4 py-3">
                          {movement.reason && <p>{movement.reason}</p>}
                          {movement.reference && (
                            <p className="mt-1">
                              Reference: {movement.reference}
                            </p>
                          )}
                          {movement.notes && (
                            <p className="mt-1 whitespace-pre-wrap">
                              {movement.notes}
                            </p>
                          )}
                          {!movement.reason &&
                            !movement.reference &&
                            !movement.notes &&
                            "—"}
                        </td>
                        <td className="break-all px-4 py-3">
                          {movement.createdBy === currentUser.id
                            ? `${currentUser.name} (you)`
                            : `Team member (${movement.createdBy})`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          {history && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                className={secondary}
                disabled={history.page === 0}
                onClick={() => void loadHistory(historyItem, history.page - 1)}
              >
                Previous movements
              </button>
              <p className="text-sm">
                Page {history.page + 1} · {history.total} movements
              </p>
              <button
                className={secondary}
                disabled={(history.page + 1) * history.size >= history.total}
                onClick={() => void loadHistory(historyItem, history.page + 1)}
              >
                Next movements
              </button>
            </div>
          )}
        </Dialog>
      )}
      {receiving && (
        <Dialog
          label="Receive stock"
          busy={saving}
          error={error}
          onDismiss={() => setReceiving(null)}
        >
          <form
            onSubmit={(event) => void saveReceipt(event)}
            className="space-y-4"
            aria-label="Receive stock"
          >
            <h2 className="text-lg font-semibold">
              Receive stock: {receiving.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              Location: {location.name} · Current stock:{" "}
              {formatQuantity(stock[receiving.id] ?? "")}{" "}
              {units.find(([code]) => code === receiving.unit)?.[1]}
            </p>
            <p className="text-sm text-muted-foreground">
              Receiving increases stock. Enter the positive quantity added to
              this location.
            </p>
            <label className="grid gap-2 text-sm font-medium">
              Quantity received
              <input
                className={control}
                type="number"
                min={receiving.unit === "PIECE" ? "1" : "0.000001"}
                step={receiving.unit === "PIECE" ? "1" : "0.000001"}
                required
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Supplier (optional)
              <select
                className={control}
                value={receiptSupplier}
                onChange={(event) => setReceiptSupplier(event.target.value)}
              >
                <option value="">No supplier</option>
                {suppliers
                  .filter((supplier) => !supplier.archived)
                  .map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Reference (optional)
              <input
                className={control}
                maxLength={200}
                value={receiptReference}
                onChange={(event) => setReceiptReference(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Notes (optional)
              <textarea
                className={control}
                maxLength={2000}
                value={receiptNotes}
                onChange={(event) => setReceiptNotes(event.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button className={button} disabled={saving} type="submit">
                {saving ? "Saving..." : "Receive stock"}
              </button>
              <button
                className={secondary}
                disabled={saving}
                type="button"
                onClick={() => {
                  setReceiving(null);
                  setQuantity("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Dialog>
      )}
      <div className="grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {section === "items" && (
          <>
            <label className="grid gap-2 text-sm font-medium">
              Search items
              <input
                className={control}
                maxLength={200}
                placeholder="Name, SKU or barcode"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
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
              Category filter
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
              Stock alert
              <select
                className={control}
                value={stockFilter}
                onChange={(event) => {
                  setStockFilter(event.target.value);
                  setPage(0);
                }}
              >
                <option value="">All stock</option>
                <option value="low">Low stock</option>
                <option value="out">Out of stock</option>
              </select>
            </label>
          </>
        )}
        <label className="grid gap-2 text-sm font-medium">
          Status
          <select
            className={control}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All statuses</option>
          </select>
        </label>
      </div>
      {canManage && (
        <button className={button} disabled={saving} onClick={() => edit()}>
          Add{" "}
          {section === "items"
            ? "item"
            : section === "categories"
              ? "category"
              : "supplier"}
        </button>
      )}
      {editor && (
        <Card className="max-w-4xl">
          <form
            onSubmit={(event) => void save(event)}
            className="space-y-5"
            aria-label={`${editor.id ? (readOnly ? "View" : "Edit") : "Add"} ${section === "items" ? "item" : section === "categories" ? "category" : "supplier"}`}
          >
            <h3 className="text-lg font-semibold">
              {editor.id ? (readOnly ? "View" : "Edit") : "Add"}{" "}
              {section === "items"
                ? "item"
                : section === "categories"
                  ? "category"
                  : "supplier"}
            </h3>
            {editor.id && section !== "items" && (
              <p className="break-all text-sm text-muted-foreground">
                CSV reference ID: <code>{editor.id}</code>
              </p>
            )}
            {editor.archived && (
              <p className="text-sm text-muted-foreground">
                Archived - read only
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                name="name"
                label="Name"
                required
                draft={draft}
                setDraft={setDraft}
                readOnly={readOnly}
              />
              {section === "items" && (
                <>
                  <Field
                    name="sku"
                    label="SKU"
                    maxLength={100}
                    draft={draft}
                    setDraft={setDraft}
                    readOnly={readOnly}
                  />
                  <Field
                    name="barcode"
                    label="Barcode"
                    maxLength={100}
                    draft={draft}
                    setDraft={setDraft}
                    readOnly={readOnly}
                  />
                  <label className="grid gap-2 text-sm font-medium">
                    Classification
                    <select
                      className={control}
                      disabled={readOnly}
                      value={draft.itemType}
                      onChange={(e) =>
                        setDraft({ ...draft, itemType: e.target.value })
                      }
                    >
                      <option value="PRODUCT">Product</option>
                      <option value="INGREDIENT">Ingredient</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    Base unit
                    <select
                      className={control}
                      disabled={readOnly}
                      value={draft.unit}
                      onChange={(e) =>
                        setDraft({ ...draft, unit: e.target.value })
                      }
                    >
                      {units.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    Category
                    <select
                      className={control}
                      disabled={readOnly}
                      value={draft.categoryId ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, categoryId: e.target.value })
                      }
                    >
                      <option value="">Uncategorized</option>
                      {categories
                        .filter((c) => !c.archived || c.id === draft.categoryId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.archived ? " (archived; choose another)" : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    Primary supplier
                    <select
                      className={control}
                      disabled={readOnly}
                      value={draft.supplierId ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, supplierId: e.target.value })
                      }
                    >
                      <option value="">No supplier</option>
                      {suppliers
                        .filter((s) => !s.archived || s.id === draft.supplierId)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                            {s.archived ? " (archived; choose another)" : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                </>
              )}
              {section === "suppliers" && (
                <>
                  <Field
                    name="contactPerson"
                    label="Contact person"
                    draft={draft}
                    setDraft={setDraft}
                    readOnly={readOnly}
                  />
                  <Field
                    name="email"
                    label="Email"
                    type="email"
                    maxLength={254}
                    draft={draft}
                    setDraft={setDraft}
                    readOnly={readOnly}
                  />
                  <Field
                    name="phone"
                    label="Phone"
                    type="tel"
                    maxLength={50}
                    draft={draft}
                    setDraft={setDraft}
                    readOnly={readOnly}
                  />
                  <Field
                    name="address"
                    label="Address"
                    maxLength={1000}
                    draft={draft}
                    setDraft={setDraft}
                    readOnly={readOnly}
                  />
                </>
              )}
            </div>
            {section !== "categories" && (
              <label className="grid gap-2 text-sm font-medium">
                {section === "items" ? "Description" : "Notes"}
                <textarea
                  className={control}
                  maxLength={2000}
                  rows={3}
                  readOnly={readOnly}
                  value={
                    draft[section === "items" ? "description" : "notes"] ?? ""
                  }
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [section === "items" ? "description" : "notes"]:
                        e.target.value,
                    })
                  }
                />
              </label>
            )}
            {section === "items" && editor.createdAt && (
              <p className="text-sm text-muted-foreground">
                Created {new Date(editor.createdAt).toLocaleString()} - Updated{" "}
                {new Date(
                  editor.updatedAt ?? editor.createdAt,
                ).toLocaleString()}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {!readOnly && (
                <button className={button} disabled={saving} type="submit">
                  {saving ? "Saving..." : "Save"}
                </button>
              )}
              <button
                type="button"
                className={secondary}
                disabled={saving}
                onClick={() => setEditor(null)}
              >
                Close
              </button>
            </div>
          </form>
        </Card>
      )}
      {archive && (
        <Card>
          <div role="group" aria-label="Confirm archive">
            <h3 className="font-semibold">Archive {archive.name}?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              The record will be preserved but cannot be edited or assigned to
              new items. Existing associations remain visible.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className={button}
                disabled={saving}
                onClick={() => void confirmArchive()}
              >
                Confirm archive
              </button>
              <button
                className={secondary}
                disabled={saving}
                onClick={() => setArchive(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}
      {loading ? (
        <p role="status">Loading catalog...</p>
      ) : records.length === 0 ? (
        <Card>
          <h3 className="font-semibold">No {section} found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {section === "items"
              ? "Add an item or adjust your filters to get started."
              : "Add a record or change the status filter."}
          </p>
        </Card>
      ) : section === "items" ? (
        <div
          className="overflow-x-auto rounded-card border border-border bg-surface"
          role="region"
          aria-label="Items table"
          tabIndex={0}
        >
          <table
            className="w-full min-w-[720px] text-left text-sm"
            aria-label="Catalog items"
          >
            <thead className="border-b border-border bg-background text-muted-foreground">
              <tr>
                {[
                  "Item",
                  "Actions",
                  "SKU",
                  "Type",
                  "Unit",
                  "Stock",
                  "Category",
                  "Status",
                ].map((label) => (
                  <th key={label} scope="col" className="px-4 py-3 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr
                  key={item.id}
                  tabIndex={0}
                  aria-label={`Open details for ${item.name}`}
                  className="cursor-pointer hover:bg-background focus-visible:outline-2 focus-visible:outline-primary"
                  onClick={(event) => {
                    if (
                      !(event.target as HTMLElement).closest(
                        "button, a, input, select, textarea, summary, [role=button]",
                      )
                    )
                      void loadHistory(item, 0);
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.target === event.currentTarget &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      void loadHistory(item, 0);
                    }
                  }}
                >
                  <td className="max-w-60 break-words px-4 py-4 font-medium">
                    <button
                      className="text-left text-primary hover:underline"
                      onClick={() => void loadHistory(item, 0)}
                    >
                      {item.name}
                    </button>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <ItemActions
                      name={item.name}
                      open={openActions === item.id}
                      onOpenChange={(open) =>
                        setOpenActions(open ? item.id : null)
                      }
                    >
                      {rowActions(item)}
                      {canManage && !item.archived && (
                        <button
                          className={`${secondary} mt-2`}
                          onClick={() => {
                            setThresholdItem(item);
                            setError("");
                            setThresholdValue(
                              formatQuantity(
                                stockDetails[item.id]?.threshold ?? "",
                              ),
                            );
                            setOpening(null);
                            setReceiving(null);
                            setAdjusting(null);
                            setConsuming(null);
                          }}
                        >
                          Set minimum
                          <span className="sr-only"> for {item.name}</span>
                        </button>
                      )}
                      {canManage &&
                        !item.archived &&
                        stock[item.id] === null && (
                          <button
                            className={`${secondary} mt-2`}
                            onClick={() => {
                              setOpening(item);
                              setError("");
                              setThresholdItem(null);
                              setReceiving(null);
                              setAdjusting(null);
                              setConsuming(null);
                              setQuantity("");
                              setNotice("");
                            }}
                          >
                            Set opening stock
                            <span className="sr-only"> for {item.name}</span>
                          </button>
                        )}
                      {canManage &&
                        !item.archived &&
                        stock[item.id] != null && (
                          <button
                            className={`${secondary} mt-2`}
                            onClick={() => {
                              setReceiving(item);
                              setError("");
                              setThresholdItem(null);
                              setOpening(null);
                              setAdjusting(null);
                              setConsuming(null);
                              setQuantity("");
                              setReceiptSupplier(
                                suppliers.some(
                                  (supplier) =>
                                    supplier.id === item.supplierId &&
                                    !supplier.archived,
                                )
                                  ? (item.supplierId ?? "")
                                  : "",
                              );
                              setReceiptReference("");
                              setReceiptNotes("");
                              receiptKey.current = crypto.randomUUID();
                              setNotice("");
                            }}
                          >
                            Receive stock
                            <span className="sr-only"> for {item.name}</span>
                          </button>
                        )}
                      {canManage &&
                        !item.archived &&
                        stock[item.id] != null && (
                          <button
                            className={`${secondary} mt-2`}
                            onClick={() => {
                              setAdjusting(item);
                              setError("");
                              setThresholdItem(null);
                              setOpening(null);
                              setReceiving(null);
                              setConsuming(null);
                              setQuantity("");
                              setAdjustmentReason("");
                              adjustmentKey.current = crypto.randomUUID();
                              setNotice("");
                            }}
                          >
                            Adjust stock
                            <span className="sr-only"> for {item.name}</span>
                          </button>
                        )}
                      {canManage &&
                        !item.archived &&
                        stock[item.id] != null && (
                          <button
                            className={`${secondary} mt-2`}
                            onClick={() => {
                              setConsuming(item);
                              setError("");
                              setThresholdItem(null);
                              setOpening(null);
                              setReceiving(null);
                              setAdjusting(null);
                              setQuantity("");
                              setConsumptionReason("");
                              consumptionKey.current = crypto.randomUUID();
                              setNotice("");
                            }}
                          >
                            Consume stock
                            <span className="sr-only"> for {item.name}</span>
                          </button>
                        )}
                      <button
                        className={`${secondary} mt-2`}
                        onClick={() => void loadHistory(item, 0)}
                      >
                        Stock history
                        <span className="sr-only"> for {item.name}</span>
                      </button>
                    </ItemActions>
                  </td>
                  <td className="max-w-40 break-all px-4 py-4">
                    {item.sku || "-"}
                  </td>
                  <td className="px-4 py-4">{item.itemType.toLowerCase()}</td>
                  <td className="px-4 py-4">
                    {units.find(([code]) => code === item.unit)?.[1]}
                  </td>
                  <td className="px-4 py-4">
                    {stock[item.id] == null
                      ? "Not established"
                      : `${formatQuantity(stock[item.id] ?? "")} ${units.find(([code]) => code === item.unit)?.[1] ?? item.unit}`}
                    {stockDetails[item.id]?.stockStatus &&
                      stockDetails[item.id].stockStatus !==
                        "NOT_ESTABLISHED" && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {
                            (
                              {
                                OUT_OF_STOCK: "Out of stock",
                                LOW_STOCK: "Low stock",
                                IN_STOCK: "In stock",
                                NO_THRESHOLD: "No threshold configured",
                              } as Record<string, string>
                            )[stockDetails[item.id].stockStatus]
                          }
                        </p>
                      )}
                    {stockDetails[item.id]?.threshold != null && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Minimum:{" "}
                        {formatQuantity(stockDetails[item.id].threshold ?? "")}
                      </p>
                    )}
                  </td>
                  <td className="max-w-40 break-words px-4 py-4">
                    {categories.find((c) => c.id === item.categoryId)?.name ??
                      "Uncategorized"}
                  </td>
                  <td className="px-4 py-4">
                    {item.archived ? "Archived" : "Active"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul
          className="space-y-3"
          aria-label={
            section === "categories" ? "Category list" : "Supplier list"
          }
        >
          {records.map((record) => (
            <li key={record.id}>
              <Card className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0 break-words">
                  <h3 className="font-semibold">{record.name}</h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {record.archived ? "Archived" : "Active"}
                  </p>
                </div>
                {rowActions(record)}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {section === "items" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={secondary}
              disabled={page === 0 || loading}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <p className="text-sm">
              Page {page + 1} - {total} items
            </p>
            <button
              className={secondary}
              disabled={(page + 1) * 25 >= total || loading}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
