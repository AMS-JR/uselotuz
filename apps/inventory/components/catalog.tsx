"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Card } from "@uselotuz/ui";
import { CatalogError, catalogRequest } from "../lib/catalog-api";

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
  onAccessLost,
  section,
  addInitially = false,
}: {
  businessId: string;
  role: string;
  onAccessLost: (status: number) => void;
  section: Section;
  addInitially?: boolean;
}) {
  const canManage = role === "OWNER" || role === "ADMIN";
  const [items, setItems] = useState<Item[]>([]);
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
    return () => controller.abort();
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
        if (controller.signal.aborted) return;
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
  }, [businessId, section, search, status, type, category, page, revision]);
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
              setEditor(null);
            }}
          >
            Archive
          </button>
        )}
      </div>
    );
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

      {error && (
        <div
          role="alert"
          className="rounded-card border border-border bg-surface p-4"
        >
          <p className="whitespace-pre-wrap text-sm text-foreground">{error}</p>
          <button className={`${secondary} mt-3`} onClick={refresh}>
            Retry loading
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <Card>
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
                  "SKU",
                  "Type",
                  "Unit",
                  "Category",
                  "Status",
                  "Actions",
                ].map((label) => (
                  <th key={label} scope="col" className="px-4 py-3 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-background">
                  <td className="max-w-60 break-words px-4 py-4 font-medium">
                    {item.name}
                  </td>
                  <td className="max-w-40 break-all px-4 py-4">
                    {item.sku || "-"}
                  </td>
                  <td className="px-4 py-4">{item.itemType.toLowerCase()}</td>
                  <td className="px-4 py-4">
                    {units.find(([code]) => code === item.unit)?.[1]}
                  </td>
                  <td className="max-w-40 break-words px-4 py-4">
                    {categories.find((c) => c.id === item.categoryId)?.name ??
                      "Uncategorized"}
                  </td>
                  <td className="px-4 py-4">
                    {item.archived ? "Archived" : "Active"}
                  </td>
                  <td className="px-4 py-4">{rowActions(item)}</td>
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
