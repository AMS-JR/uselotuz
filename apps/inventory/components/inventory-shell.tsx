"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AccountMenu,
  type AccountProfile,
  ButtonLink,
  Card,
  HeaderBrand,
} from "@uselotuz/ui";
import { branding } from "../lib/branding";

export const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
export const workspaceUrl =
  process.env.NEXT_PUBLIC_WORKSPACE_URL ?? "http://localhost:3002";
type Business = { id: string; name: string };
type User = AccountProfile & { id: string };
type Access = {
  businessId: string;
  role: string;
  location: { id: string; name: string };
};
type State = "loading" | "disabled" | "signed-out" | "ready" | "error";
type InventoryContext = Access & {
  businessName: string;
  user: User;
  href: (path: string) => string;
  onAccessLost: (status: number) => void;
  refreshAccess: () => void;
};
const Inventory = createContext<InventoryContext | null>(null);
export function useInventory() {
  const context = useContext(Inventory);
  if (!context)
    throw new Error(
      "Inventory pages require the authenticated application layout",
    );
  return context;
}
const navigation = [
  ["/", "Overview"],
  ["/items", "Items"],
  ["/reorder", "Reorder List"],
  ["/counts", "Stock Counts"],
  ["/reports", "Reports"],
  ["/categories", "Categories"],
  ["/suppliers", "Suppliers"],
  ["/import-export", "Import / Export"],
  ["/settings", "Settings"],
] as const;
const preferenceKey = (userId: string) => `lotuz.inventory.business.${userId}`;
function preference(userId: string, value?: string | null) {
  try {
    const key = preferenceKey(userId);
    if (value === null) localStorage.removeItem(key);
    else if (value !== undefined) localStorage.setItem(key, value);
    else return localStorage.getItem(key);
  } catch {
    /* A blocked/full browser store must not prevent access. */
  }
  return null;
}
class AccessError extends Error {
  constructor(public status: number) {
    super("Unable to check Inventory access");
  }
}
async function read<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new AccessError(response.status);
  return response.json() as Promise<T>;
}

export function InventoryShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("businessId");
  const [state, setState] = useState<State>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [context, setContext] = useState<Access | null>(null);
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const lastIdentity = useRef<string | null>(null);
  const quiet = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const denied = useRef(new Set<string>());
  const current = useRef<{ user: User; businessId: string } | null>(null);
  const resolved = useRef<{ businessId: string; revision: number } | null>(
    null,
  );
  const path = navigation.some(([href]) => href === pathname) ? pathname : "/";
  const returnTo =
    path +
    (requested && /^[0-9a-f-]{36}$/i.test(requested)
      ? `?businessId=${requested}`
      : "");

  const onAccessLost = useCallback(
    (status: number) => {
      const selection = current.current;
      if (selection && status !== 401) preference(selection.user.id, null);
      current.current = null;
      resolved.current = null;
      pending.current?.abort();
      setContext(null);
      if (status === 401) {
        setState("signed-out");
        setUser(null);
        setBusinesses([]);
      } else {
        if (selection) denied.current.add(selection.businessId);
        setNotice(
          "Inventory access is unavailable for that business. Your available businesses have been refreshed.",
        );
        setRevision((value) => value + 1);
      }
    },
    [setContext, setState, setUser, setBusinesses, setNotice, setRevision],
  );
  useEffect(() => {
    if (
      requested &&
      resolved.current?.businessId === requested &&
      resolved.current.revision === revision
    )
      return;
    const controller = new AbortController();
    pending.current = controller;
    const silently = quiet.current;
    quiet.current = false;
    async function load() {
      if (!silently) {
        setState("loading");
        setContext(null);
        current.current = null;
      }
      try {
        const config = await read<{ enabled: boolean }>(
          "/api/auth/config",
          controller.signal,
        );
        if (!config.enabled) {
          setState("disabled");
          return;
        }
        const [identity, list] = await Promise.all([
          read<User>("/api/me", controller.signal),
          read<Business[]>("/api/businesses", controller.signal),
        ]);
        if (lastIdentity.current !== identity.id) {
          denied.current.clear();
          if (lastIdentity.current) {
            setContext(null);
            current.current = null;
          }
          lastIdentity.current = identity.id;
        }
        const grants = await Promise.all(
          list.map(async (business) => {
            try {
              const products = await read<
                { code: string; accessible: boolean }[]
              >(
                `/api/businesses/${encodeURIComponent(business.id)}/products`,
                controller.signal,
              );
              return products.some(
                (product) => product.code === "inventory" && product.accessible,
              ) && !denied.current.has(business.id)
                ? business
                : null;
            } catch (reason) {
              if (
                reason instanceof AccessError &&
                [403, 404].includes(reason.status)
              )
                return null;
              throw reason;
            }
          }),
        );
        let available = grants
          .filter((b): b is Business => b !== null)
          .sort((a, b) => a.id.localeCompare(b.id, "en"));
        const saved = preference(identity.id);
        const candidate =
          available.find((b) => b.id === requested) ??
          available.find((b) => b.id === saved) ??
          available[0];
        if (requested && !available.some((b) => b.id === requested))
          setNotice(
            "This business is unavailable for your account. Showing your available Inventory businesses.",
          );
        if (saved && !available.some((b) => b.id === saved))
          preference(identity.id, null);
        const candidates = candidate
          ? [candidate, ...available.filter((b) => b.id !== candidate.id)]
          : [];
        let chosen: Access | null = null;
        for (const business of candidates) {
          try {
            chosen = await read<Access>(
              `/api/businesses/${encodeURIComponent(business.id)}/inventory`,
              controller.signal,
            );
            break;
          } catch (reason) {
            if (
              !(reason instanceof AccessError) ||
              ![403, 404].includes(reason.status)
            )
              throw reason;
            available = available.filter((b) => b.id !== business.id);
            if (saved === business.id) preference(identity.id, null);
            setNotice(
              "Inventory access is unavailable for that business. Showing your available Inventory businesses.",
            );
          }
        }
        if (controller.signal.aborted) return;
        setUser(identity);
        setBusinesses(available);
        setContext(chosen);
        setState("ready");
        if (chosen) {
          current.current = { user: identity, businessId: chosen.businessId };
          resolved.current = { businessId: chosen.businessId, revision };
          preference(identity.id, chosen.businessId);
          if (requested !== chosen.businessId) {
            const query = new URLSearchParams(window.location.search);
            query.set("businessId", chosen.businessId);
            query.delete("authError");
            router.replace(`${window.location.pathname}?${query}`, {
              scroll: false,
            });
          }
        }
      } catch (reason) {
        if (controller.signal.aborted) return;
        current.current = null;
        resolved.current = null;
        setUser(null);
        setBusinesses([]);
        setContext(null);
        setState(
          reason instanceof AccessError && reason.status === 401
            ? "signed-out"
            : "error",
        );
      }
    }
    void load();
    return () => controller.abort();
  }, [requested, revision, router]);
  useEffect(() => {
    const recheck = () => {
      if (!current.current) return;
      quiet.current = true;
      resolved.current = null;
      setRevision((value) => value + 1);
    };
    window.addEventListener("focus", recheck);
    return () => window.removeEventListener("focus", recheck);
  }, []);
  async function logout() {
    pending.current?.abort();
    current.current = null;
    resolved.current = null;
    denied.current.clear();
    setState("loading");
    setContext(null);
    setUser(null);
    setBusinesses([]);
    try {
      const csrf = await read<{ headerName: string; token: string }>(
        "/api/auth/csrf",
        new AbortController().signal,
      );
      const result = await fetch(`${api}/api/auth/logout?app=inventory`, {
        method: "POST",
        credentials: "include",
        headers: { [csrf.headerName]: csrf.token },
      });
      if (!result.ok) throw new Error();
      setState("signed-out");
      const destination = result.headers.get("Location");
      if (destination) window.location.assign(destination);
    } catch {
      setState("error");
    }
  }
  function switchBusiness(id: string) {
    if (id === current.current?.businessId) return;
    pending.current?.abort();
    setState("loading");
    setContext(null);
    current.current = null;
    resolved.current = null;
    setMenuOpen(false);
    setNotice("");
    // Forms/filters belong to the old business; only retain the destination route.
    router.push(`${path}?${new URLSearchParams({ businessId: id })}`);
  }
  const visible =
    context &&
    state === "ready" &&
    (!requested || requested === context.businessId)
      ? context
      : null;
  const href = (destination: string) =>
    `${destination}${destination.includes("?") ? "&" : "?"}businessId=${encodeURIComponent(visible?.businessId ?? "")}`;
  const retry = () => {
    denied.current.clear();
    resolved.current = null;
    setNotice("");
    setRevision((value) => value + 1);
  };
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1920px] items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
          <Link
            href={visible ? href("/") : "/"}
            aria-label="Lotuz Inventory overview"
            className="inline-flex shrink-0 rounded-control"
          >
            <HeaderBrand {...branding.header} showName={!user} />
          </Link>
          {visible && businesses.length > 0 && (
            <div className="min-w-0 flex-1 sm:ml-4 sm:max-w-64">
              <label className="sr-only" htmlFor="business">
                Business
              </label>
              <select
                id="business"
                value={visible?.businessId ?? ""}
                onChange={(event) => switchBusiness(event.target.value)}
                className="min-h-11 min-w-0 w-full rounded-control border border-border bg-surface px-3 text-sm"
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            {user && (
              <AccountMenu
                key={user.id}
                user={user}
                onSignOut={() => void logout()}
                links={[{ href: workspaceUrl, label: "Lotuz Workspace" }]}
              />
            )}

            {visible && (
              <button
                className="min-h-11 rounded-control border border-border px-3 text-sm lg:hidden"
                aria-expanded={menuOpen}
                aria-controls="inventory-navigation"
                onClick={() => setMenuOpen((value) => !value)}
              >
                Menu
              </button>
            )}
          </div>
        </div>
      </header>
      <div
        className={
          visible
            ? "mx-auto max-w-[1920px] lg:grid lg:grid-cols-[224px_minmax(0,1fr)]"
            : "mx-auto max-w-2xl"
        }
      >
        {visible && (
          <aside
            id="inventory-navigation"
            className={`${menuOpen ? "block" : "hidden"} border-b border-border bg-surface px-4 py-5 lg:sticky lg:top-20 lg:block lg:h-[calc(100dvh-5rem)] lg:overflow-y-auto lg:border-r lg:border-b-0`}
          >
            <p className="mb-4 px-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Your business
            </p>
            <nav aria-label="Inventory navigation" className="space-y-1">
              {navigation.map(([destination, label]) => (
                <Link
                  key={destination}
                  href={href(destination)}
                  onClick={() => setMenuOpen(false)}
                  aria-current={pathname === destination ? "page" : undefined}
                  className={`flex min-h-11 items-center rounded-control px-3 py-3 text-sm font-medium ${pathname === destination ? "bg-background text-primary" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div className="mt-8 border-t border-border px-3 pt-5 text-xs leading-6 text-muted-foreground">
              <p className="break-words font-medium">
                {businesses.find((b) => b.id === visible.businessId)?.name}
              </p>
              <p>{visible.role.toLowerCase()} access</p>
              <a
                className="mt-2 inline-block py-2 text-primary"
                href={workspaceUrl}
              >
                Open Lotuz Workspace
              </a>
            </div>
          </aside>
        )}
        <main id="main" className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">
          {notice && (
            <p
              role="alert"
              className="mb-6 rounded-control border border-border bg-surface p-4 text-sm"
            >
              {notice}
            </p>
          )}
          {state === "loading" && (
            <p role="status">Checking Inventory access...</p>
          )}
          {state === "disabled" && (
            <Card>
              <h1 className="text-xl font-semibold">
                Sign-in is not configured
              </h1>
              <p className="mt-3 leading-7 text-muted-foreground">
                Your administrator needs to connect the Lotuz sign-in provider
                before Inventory can be used.
              </p>
            </Card>
          )}
          {state === "signed-out" && (
            <Card>
              <h1 className="text-xl font-semibold">Sign in to Lotuz</h1>
              <p className="my-4 leading-7 text-muted-foreground">
                Use your Lotuz account to access your business inventory.
              </p>
              <ButtonLink
                href={`${api}/oauth2/authorization/lotuz?${new URLSearchParams({ app: "inventory", returnTo })}`}
              >
                Sign in
              </ButtonLink>
              <a
                className="ml-5 inline-block py-3 text-primary"
                href={`${api}/oauth2/authorization/lotuz?${new URLSearchParams({ app: "inventory", returnTo, screen_hint: "signup" })}`}
              >
                Create an account
              </a>
              {params.has("authError") && (
                <p role="alert" className="mt-4">
                  Sign-in did not complete. Please try again.
                </p>
              )}
            </Card>
          )}
          {state === "error" && (
            <Card>
              <h1 className="text-xl font-semibold">Unable to connect</h1>
              <p className="mt-3 text-muted-foreground">
                We could not check your Inventory access. Please try again.
              </p>
              <button
                onClick={retry}
                className="mt-4 min-h-11 px-3 text-primary"
              >
                Try again
              </button>
            </Card>
          )}
          {state === "ready" && !context && (
            <Card>
              <h1 className="text-xl font-semibold">
                No Inventory businesses available
              </h1>
              <p className="mt-3 leading-7 text-muted-foreground">
                Create or manage your business in Lotuz Workspace. Inventory
                activation requires Lotuz approval and permission from your
                business administrator.
              </p>
              <ButtonLink className="mt-5" href={workspaceUrl}>
                Open Lotuz Workspace
              </ButtonLink>
              <button
                className="ml-3 min-h-11 px-3 text-primary"
                onClick={retry}
              >
                Refresh access
              </button>
            </Card>
          )}
          {visible && user && (
            <Inventory.Provider
              value={{
                ...visible,
                user,
                businessName:
                  businesses.find((b) => b.id === visible.businessId)?.name ??
                  "Your business",
                href,
                onAccessLost,
                refreshAccess: () => {
                  quiet.current = true;
                  resolved.current = null;
                  setRevision((value) => value + 1);
                },
              }}
            >
              <div key={`${user.id}:${visible.businessId}`}>{children}</div>
            </Inventory.Provider>
          )}
        </main>
      </div>
    </>
  );
}
