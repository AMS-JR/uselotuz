"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ButtonLink, Card } from "@uselotuz/ui";
import { ApiError, mutate, read } from "../lib/api";
import { useWorkspace, type Business } from "./workspace-shell";
import { MembershipManagement } from "./membership-management";
type Member = { userId: string; role: string };
type Product = {
  code: string;
  name: string;
  activated: boolean;
  accessible: boolean;
  url: string | null;
};
type Section = "overview" | "products" | "businesses" | "members" | "settings";
const control =
  "min-h-11 w-full rounded-control border border-border bg-surface px-3";
const button =
  "min-h-11 rounded-control bg-primary px-5 py-3 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50";
export function BusinessPanel({ section }: { section: Section }) {
  const { user, businesses, details, href, onAccessLost, renamed, created } =
    useWorkspace();
  const [products, setProducts] = useState<Product[]>([]),
    [members, setMembers] = useState<Member[]>([]),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(details?.name ?? ""),
    [newName, setNewName] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    pending.current = controller;
    return () => controller.abort();
  }, []);
  const businessId = details?.id;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (!businessId || ["settings", "businesses"].includes(section)) {
          setLoading(false);
          return;
        }
        const base = `/api/businesses/${encodeURIComponent(businessId)}`;
        if (section === "members") {
          const result = await read<Member[]>(
            `${base}/members`,
            controller.signal,
          );
          if (!controller.signal.aborted) setMembers(result);
        } else {
          const result = await read<Product[]>(
            `${base}/products`,
            controller.signal,
          );
          if (!controller.signal.aborted) setProducts(result);
        }
      } catch (reason) {
        if (controller.signal.aborted) return;
        if (reason instanceof ApiError && [401, 403].includes(reason.status))
          onAccessLost(reason.status);
        else setError("Unable to load this business. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [businessId, section, revision, onAccessLost]);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  function failure(reason: unknown, message: string) {
    if (pending.current?.signal.aborted) return;
    if (reason instanceof ApiError && [401, 403].includes(reason.status))
      onAccessLost(reason.status);
    else setError(message);
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await mutate(
        "/api/businesses",
        "POST",
        { name: newName },
        pending.current?.signal,
      );
      const business: Business = await response.json();
      if (!pending.current?.signal.aborted) created(business);
    } catch (reason) {
      failure(
        reason,
        "Unable to create the business. Enter a name of 1-200 characters and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!details) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await mutate(
        `/api/businesses/${encodeURIComponent(details.id)}`,
        "PATCH",
        { name },
        pending.current?.signal,
      );
      if (!pending.current?.signal.aborted) {
        renamed(name.trim());
        setNotice("Business name saved.");
      }
    } catch (reason) {
      failure(
        reason,
        "Unable to save. Check your permissions and business name, then try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const title = {
    overview: "Overview",
    products: "Products",
    businesses: "Businesses",
    members: "Membership",
    settings: "Settings",
  }[section];
  const description = {
    overview: "Your businesses and Lotuz products, connected in one place.",
    products: "Open the Lotuz applications available to your business.",
    businesses: "Create and manage the businesses you belong to.",
    members: "Review the membership information available to you.",
    settings: "Manage the supported settings for your selected business.",
  }[section];
  const productCards = (
    <div className="grid gap-5 md:grid-cols-2">
      {products.map((product) => (
        <Card key={product.code}>
          <p className="mb-3 text-xs font-medium text-primary">
            {product.activated && product.accessible
              ? "Ready to open"
              : product.activated
                ? "Activated"
                : "Available - activation required"}
          </p>
          <h3 className="text-xl font-semibold">{product.name}</h3>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {product.code === "inventory"
              ? "Organize products, ingredients, categories and suppliers in your Inventory catalog."
              : "An independent Lotuz application for your business."}
          </p>
          {product.accessible && product.url ? (
            <ButtonLink className="mt-5" href={product.url}>
              Open {product.code === "inventory" ? "Inventory" : product.name}
            </ButtonLink>
          ) : (
            <p className="mt-5 border-t border-border pt-4 text-sm leading-6 text-muted-foreground">
              {product.activated
                ? "Ask your owner or administrator for Inventory access."
                : "Contact Lotuz to request activation for this business. Creating a business does not activate products."}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
  return (
    <section className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 break-words text-sm text-muted-foreground">
            {details?.name ?? "Lotuz Workspace"}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-muted-foreground">{description}</p>
        </div>
        {section === "overview" && (
          <Link
            href={href("/businesses")}
            className="inline-flex min-h-11 items-center rounded-control border border-border bg-surface px-4 text-sm text-primary"
          >
            Manage businesses
          </Link>
        )}
      </div>
      {error && (
        <Card>
          <p role="alert">{error}</p>
          <button
            className="mt-3 min-h-11 text-primary"
            onClick={() => setRevision((value) => value + 1)}
          >
            Try again
          </button>
        </Card>
      )}
      {notice && <p role="status">{notice}</p>}
      {section === "businesses" ? (
        <>
          {businesses.length === 0 ? (
            <Card>
              <h2 className="text-lg font-semibold">No businesses yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Create your first business below to get started.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {businesses.map((business) => (
                <Card key={business.id}>
                  <h2 className="break-words text-lg font-semibold">
                    {business.name}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {business.role === "OWNER"
                      ? "Your business · Owner"
                      : business.role === "ADMIN"
                        ? "Employee · Admin"
                        : business.role === "STAFF"
                          ? "Employee · Staff"
                          : "Role unavailable"}
                  </p>
                  <Link
                    href={`/settings?${new URLSearchParams({ businessId: business.id })}`}
                    className="mt-3 inline-flex min-h-11 items-center text-sm text-primary"
                  >
                    Manage business
                    <span className="sr-only"> {business.name}</span>
                  </Link>
                </Card>
              ))}
            </div>
          )}
          <Card className="max-w-2xl">
            <h2 className="text-xl font-semibold">Create a business</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              You will be its owner. Products are activated separately with
              Lotuz approval.
            </p>
            <form
              onSubmit={(event) => void create(event)}
              className="mt-5 space-y-4"
              aria-label="Create business"
            >
              <label className="grid gap-2 text-sm font-medium">
                New business name
                <input
                  className={control}
                  value={newName}
                  required
                  maxLength={200}
                  onChange={(event) => setNewName(event.target.value)}
                />
              </label>
              <button className={button} disabled={busy}>
                {busy ? "Creating..." : "Create business"}
              </button>
            </form>
          </Card>
        </>
      ) : !details ? (
        <Card>
          <h2 className="text-xl font-semibold">Welcome to Lotuz Workspace</h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            Create your first business to organize your team and discover Lotuz
            products. Each product works independently.
          </p>
          <ButtonLink className="mt-5" href="/businesses">
            Create a business
          </ButtonLink>
        </Card>
      ) : (
        <>
          {section === "overview" && (
            <dl className="grid gap-4 sm:grid-cols-3">
              <Card>
                <dt className="text-sm text-muted-foreground">
                  Your businesses
                </dt>
                <dd className="mt-3 text-3xl font-semibold">
                  {businesses.length}
                </dd>
              </Card>
              <Card>
                <dt className="text-sm text-muted-foreground">
                  Your business role
                </dt>
                <dd className="mt-3 text-2xl font-semibold capitalize">
                  {details.role.toLowerCase()}
                </dd>
              </Card>
              <Card>
                <dt className="text-sm text-muted-foreground">
                  Products ready to open
                </dt>
                <dd className="mt-3 text-3xl font-semibold">
                  {loading || error
                    ? "-"
                    : products.filter(
                        (product) => product.accessible && product.url,
                      ).length}
                </dd>
              </Card>
            </dl>
          )}
          {["overview", "products"].includes(section) && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">
                  {section === "overview"
                    ? "Your products"
                    : "Product launcher"}
                </h2>
                <button
                  className="min-h-11 text-sm text-primary"
                  onClick={() => setRevision((value) => value + 1)}
                >
                  Refresh products
                </button>
              </div>
              {loading ? (
                <p role="status">Loading products...</p>
              ) : error ? null : products.length > 0 ? (
                productCards
              ) : (
                <Card>
                  <p>No products are available for this business yet.</p>
                </Card>
              )}
            </div>
          )}
          {section === "overview" && (
            <Card>
              <h2 className="text-lg font-semibold">
                Your business, your workspace
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
                Use Workspace for business settings, membership information and
                product access. Each Lotuz product has its own tools and
                dashboard.
              </p>
              <div className="mt-4 flex flex-wrap gap-5">
                <Link
                  className="inline-flex min-h-11 items-center text-sm text-primary"
                  href={href("/members")}
                >
                  View membership
                </Link>
                <Link
                  className="inline-flex min-h-11 items-center text-sm text-primary"
                  href={href("/settings")}
                >
                  Business settings
                </Link>
              </div>
            </Card>
          )}
          {section === "members" && details.role === "OWNER" && (
            <MembershipManagement businessId={details.id} userId={user.id} />
          )}
          {section === "members" && details.role !== "OWNER" && (
            <Card>
              <h2 className="text-xl font-semibold">Membership</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {details.canManage
                  ? "Active members of this business."
                  : "Your active membership."}
              </p>
              {loading ? (
                <p role="status" className="mt-4">
                  Loading membership...
                </p>
              ) : (
                <ul className="mt-5 divide-y divide-border">
                  {members.map((member) => (
                    <li key={member.userId} className="py-4 text-sm">
                      <p className="font-medium">
                        {member.userId === user.id
                          ? user.name
                          : "Business member"}
                      </p>
                      <p className="mt-1 capitalize">
                        {member.role.toLowerCase()}
                        {member.userId === user.id ? " (you)" : ""}
                      </p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {member.userId}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {section === "settings" && (
            <Card className="max-w-2xl">
              <h2 className="text-xl font-semibold">Business settings</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Your business role: {details.role.toLowerCase()}
              </p>
              {details.canManage ? (
                <form
                  onSubmit={(event) => void save(event)}
                  className="mt-5 space-y-4"
                  aria-label="Business settings"
                >
                  <label className="grid gap-2 text-sm font-medium">
                    Business name
                    <input
                      className={control}
                      value={name}
                      maxLength={200}
                      required
                      onChange={(event) => {
                        setName(event.target.value);
                        setNotice("");
                      }}
                    />
                  </label>
                  <button className={button} disabled={busy}>
                    {busy ? "Saving..." : "Save changes"}
                  </button>
                </form>
              ) : (
                <p className="mt-4 break-words">{details.name}</p>
              )}
              <p className="mt-5 break-all text-xs text-muted-foreground">
                Business ID: {details.id}
              </p>
            </Card>
          )}
        </>
      )}
    </section>
  );
}
