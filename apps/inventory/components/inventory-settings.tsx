"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Card } from "@uselotuz/ui";
import { CatalogError, inventoryRequest } from "../lib/catalog-api";
import { useInventory, workspaceUrl } from "./inventory-shell";
export function InventorySettings() {
  const {
    businessId,
    businessName,
    role,
    location,
    onAccessLost,
    refreshAccess,
  } = useInventory();
  const [notice, setNotice] = useState("");
  const [name, setName] = useState(location.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const request = new AbortController();
    controller.current = request;
    return () => request.abort();
  }, []);
  const manage = role === "OWNER" || role === "ADMIN";
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await inventoryRequest(businessId, "/location", {
        method: "PATCH",
        body: JSON.stringify({ name }),
        signal: controller.current?.signal,
      });
      if (!controller.current?.signal.aborted) {
        setNotice("Location updated.");
        refreshAccess();
      }
    } catch (reason) {
      if (controller.current?.signal.aborted) return;
      if (reason instanceof CatalogError && [401, 403].includes(reason.status))
        onAccessLost(reason.status);
      else
        setError(
          reason instanceof Error ? reason.message : "Unable to save location.",
        );
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Manage the Inventory settings available for your business.
        </p>
      </div>
      <Card>
        <h2 className="text-lg font-semibold">Business</h2>
        <p className="mt-3 break-words">{businessName}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Your Inventory role: {role.toLowerCase()}
        </p>
        <a
          href={workspaceUrl}
          className="mt-3 inline-flex min-h-11 items-center text-sm text-primary"
        >
          Manage business in Lotuz Workspace
        </a>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Stock location</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your business currently uses one stock location.
        </p>
        {manage ? (
          <form
            onSubmit={(event) => void save(event)}
            className="mt-5 space-y-4"
            aria-label="Location settings"
          >
            <label className="grid gap-2 text-sm font-medium">
              Location name
              <input
                className="min-h-11 w-full rounded-control border border-border px-3"
                required
                maxLength={200}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            {notice && <p role="status">{notice}</p>}
            <button
              className="min-h-11 rounded-control bg-primary px-4 text-sm font-medium text-white disabled:opacity-50"
              disabled={saving || name.trim() === location.name}
            >
              {saving ? "Saving..." : "Save location"}
            </button>
          </form>
        ) : (
          <>
            <p className="mt-4">{location.name}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              An owner or admin can update the location name.
            </p>
          </>
        )}
      </Card>
    </section>
  );
}
