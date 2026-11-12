"use client";

import { useEffect, useState } from "react";
import { ButtonLink, Card } from "@uselotuz/ui";
import { ApiError, mutate, read } from "../lib/api";

type Details = { id: string; name: string; role: string; canManage: boolean };
type Member = { userId: string; role: string };
type Product = {
  code: string;
  name: string;
  activated: boolean;
  accessible: boolean;
  url: string | null;
};
type Context = { details: Details; members: Member[]; products: Product[] };
const inputClass =
  "min-h-11 w-full rounded-control border border-border bg-surface px-3";
const buttonClass =
  "min-h-11 rounded-control bg-primary px-5 py-3 text-sm font-medium text-white disabled:opacity-60";

export function BusinessPanel({
  businessId,
  userId,
  onExpired,
  onRenamed,
}: {
  businessId: string;
  userId: string;
  onExpired: () => void;
  onRenamed: (id: string, name: string) => void;
}) {
  const [context, setContext] = useState<Context | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const base = `/api/businesses/${encodeURIComponent(businessId)}`;
    void Promise.all([
      read<Details>(base, controller.signal),
      read<Member[]>(`${base}/members`, controller.signal),
      read<Product[]>(`${base}/products`, controller.signal),
    ])
      .then(([details, members, products]) => {
        if (controller.signal.aborted) return;
        setContext({ details, members, products });
        setName(details.name);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (reason instanceof ApiError && reason.status === 401) onExpired();
        else
          setError(
            reason instanceof ApiError && reason.status === 403
              ? "You no longer have access to this business."
              : "Unable to load this business. Refresh to try again.",
          );
      });
    return () => controller.abort();
  }, [businessId, onExpired]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await mutate(
        `/api/businesses/${encodeURIComponent(businessId)}`,
        "PATCH",
        { name },
      );
      onRenamed(businessId, name.trim());
      setSaved(true);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) onExpired();
      else
        setError(
          "Unable to save. Check your permissions and business name, then try again.",
        );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      {error && (
        <p
          role="alert"
          className="rounded-card border border-border bg-surface p-5"
        >
          {error}
        </p>
      )}
      {!context && !error && <p role="status">Loading business…</p>}
      {context && (
        <>
          <Card>
            <h2 className="text-xl font-semibold">Products</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {context.products.map((product) => (
                <div
                  key={product.code}
                  className="rounded-control border border-border p-5"
                >
                  <h3 className="font-semibold">{product.name}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {product.activated
                      ? "Activated"
                      : "Available · activation required"}
                  </p>
                  {product.accessible && product.url ? (
                    <ButtonLink className="mt-5" href={product.url}>
                      Open Inventory
                    </ButtonLink>
                  ) : (
                    <p className="mt-4 text-sm leading-6 text-muted-foreground">
                      {product.activated
                        ? "Ask your owner or administrator for Inventory access."
                        : "Contact Lotuz to request activation for this business. Creating a business does not activate products."}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="text-xl font-semibold">Business settings</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your business role: {context.details.role.toLowerCase()}
            </p>
            {context.details.canManage ? (
              <form
                onSubmit={(event) => void save(event)}
                className="mt-5 max-w-lg space-y-3"
              >
                <label htmlFor="business-name" className="block font-medium">
                  Business name
                </label>
                <input
                  id="business-name"
                  className={inputClass}
                  value={name}
                  maxLength={200}
                  required
                  onChange={(event) => {
                    setName(event.target.value);
                    setSaved(false);
                  }}
                />
                <button className={buttonClass} type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </button>
                {saved && (
                  <p role="status" className="text-sm">
                    Business name saved.
                  </p>
                )}
              </form>
            ) : (
              <p className="mt-4">{context.details.name}</p>
            )}
            <p className="mt-5 break-all text-xs text-muted-foreground">
              Business ID: {businessId}
            </p>
          </Card>
          <Card>
            <h2 className="text-xl font-semibold">Membership</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {context.details.canManage
                ? "Active members of this business."
                : "Your active membership."}
            </p>
            <ul className="mt-4 space-y-4">
              {context.members.map((member) => (
                <li key={member.userId} className="text-sm">
                  <span className="capitalize">
                    {member.role.toLowerCase()}
                  </span>
                  {member.userId === userId ? " (you)" : ""}
                  <span className="mt-1 block break-all text-xs text-muted-foreground">
                    {member.userId}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
