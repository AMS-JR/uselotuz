"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Card } from "@uselotuz/ui";
import { CatalogError, catalogRequest } from "../lib/catalog-api";
import { useInventory } from "./inventory-shell";
const control =
  "min-h-11 w-full rounded-control border border-border bg-surface px-3 py-2";
const button =
  "min-h-11 rounded-control bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
const secondary =
  "min-h-11 rounded-control border border-border px-4 py-2 text-sm text-primary disabled:opacity-50";
export function CatalogTransfer() {
  const { businessId, role, onAccessLost } = useInventory();
  const canManage = role === "OWNER" || role === "ADMIN";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  function failure(reason: unknown) {
    if (lifetime.current?.signal.aborted) return;
    if (reason instanceof CatalogError && [401, 403].includes(reason.status))
      onAccessLost(reason.status);
    else
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to complete this request.",
      );
  }
  function refresh() {
    setFile(null);
    if (input.current) input.current.value = "";
  }
  async function download(path: string, filename: string) {
    setSaving(true);
    setError("");
    try {
      const response = await catalogRequest(businessId, path, {
        signal: lifetime.current?.signal,
      });
      const blob = await response.blob();
      if (lifetime.current?.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      failure(reason);
    } finally {
      setSaving(false);
    }
  }
  async function importCsv(event: FormEvent) {
    event.preventDefault();
    if (!file || !canManage) return;
    if (file.size > 1048576) {
      setError("CSV must not exceed 1 MiB.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await catalogRequest(businessId, "/import", {
        method: "POST",
        body: data,
        signal: lifetime.current?.signal,
      });
      const result: { imported: number } = await response.json();
      if (lifetime.current?.signal.aborted) return;
      setNotice(`Imported ${result.imported} items.`);
      refresh();
    } catch (reason) {
      failure(reason);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Import / Export
        </h1>
        <p className="mt-2 text-muted-foreground">
          Bring your catalog in, or take a copy with you.
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="whitespace-pre-wrap rounded-card border border-border bg-surface p-4 text-sm"
        >
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <Card className="max-w-4xl">
        <h3 className="text-lg font-semibold">Catalog files</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Create-only import, up to 1,000 items and 1 MiB. Existing
          SKUs/barcodes are rejected. Every row must pass before any item is
          saved. References use IDs from this business; no opening stock
          quantities.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className={secondary}
            disabled={saving}
            onClick={() =>
              void download("/template", "lotuz-catalog-template.csv")
            }
          >
            Download template
          </button>
          <button
            className={secondary}
            disabled={saving}
            onClick={() => void download("/export", "lotuz-catalog.csv")}
          >
            Export catalog
          </button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Export includes archived items. Apostrophe prefixes protect
          spreadsheet cells and leading zeros. Use text columns when opening CSV
          in a spreadsheet.
        </p>
        {canManage && (
          <form
            className="mt-5 space-y-3"
            onSubmit={(event) => void importCsv(event)}
            aria-label="Import catalog"
          >
            <label className="grid gap-2 text-sm font-medium">
              CSV file
              <input
                className={`${control} max-w-full`}
                ref={input}
                type="file"
                accept=".csv,text/csv"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button className={button} disabled={saving || !file} type="submit">
              {saving ? "Working..." : "Import CSV"}
            </button>
          </form>
        )}
      </Card>
    </section>
  );
}
