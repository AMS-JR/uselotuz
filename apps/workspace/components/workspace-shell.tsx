"use client";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
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
import { ApiError, loginUrl, mutate, read } from "../lib/api";
export type Business = { id: string; name: string; role: string };
export type Details = Business & { role: string; canManage: boolean };
type User = AccountProfile & { id: string };
type WorkspaceContext = {
  user: User;
  businesses: Business[];
  details: Details | null;
  href: (path: string) => string;
  onAccessLost: (status: number) => void;
  renamed: (name: string) => void;
  created: (business: Business) => void;
};
const Workspace = createContext<WorkspaceContext | null>(null);
export function useWorkspace() {
  const context = useContext(Workspace);
  if (!context)
    throw new Error("Workspace page requires the authenticated layout");
  return context;
}
const navigation = [
  ["/", "Overview"],
  ["/products", "Products"],
  ["/businesses", "Businesses"],
  ["/members", "Membership"],
  ["/settings", "Settings"],
] as const;
function preference(user: string, value?: string | null) {
  try {
    const key = `lotuz.workspace.business.${user}`;
    if (value === null) localStorage.removeItem(key);
    else if (value !== undefined) localStorage.setItem(key, value);
    else return localStorage.getItem(key);
  } catch {}
  return null;
}
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/accept-invitation") return <>{children}</>;
  return <AuthenticatedWorkspaceShell>{children}</AuthenticatedWorkspaceShell>;
}
function AuthenticatedWorkspaceShell({ children }: { children: ReactNode }) {
  const router = useRouter(),
    pathname = usePathname(),
    params = useSearchParams();
  const requested = params.get("businessId");
  const [state, setState] = useState<
    "loading" | "disabled" | "signed-out" | "ready" | "error"
  >("loading");
  const [user, setUser] = useState<User | null>(null),
    [businesses, setBusinesses] = useState<Business[]>([]),
    [details, setDetails] = useState<Details | null>(null);
  const [notice, setNotice] = useState(""),
    [menu, setMenu] = useState(false),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const pending = useRef<AbortController | null>(null),
    quiet = useRef(false),
    resolved = useRef<{ id: string; revision: number } | null>(null),
    identity = useRef<string | null>(null),
    denied = useRef(new Set<string>()),
    current = useRef<Details | null>(null);
  const path = navigation.some(([target]) => target === pathname)
    ? pathname
    : "/";
  const returnTo =
    path +
    (requested && /^[0-9a-f-]{36}$/i.test(requested)
      ? `?businessId=${requested}`
      : "");
  const onAccessLost = useCallback(
    (status: number) => {
      pending.current?.abort();
      resolved.current = null;
      if (status === 401) {
        current.current = null;
        setUser(null);
        setBusinesses([]);
        setDetails(null);
        setState("signed-out");
      } else {
        if (current.current) {
          denied.current.add(current.current.id);
          if (identity.current) preference(identity.current, null);
        }
        current.current = null;
        setDetails(null);
        setNotice(
          "You no longer have access to that business. Your available businesses have been refreshed.",
        );
        setRevision((value) => value + 1);
      }
    },
    [setUser, setBusinesses, setDetails, setState, setNotice, setRevision],
  );
  useEffect(() => {
    if (
      requested &&
      resolved.current?.id === requested &&
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
        setDetails(null);
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
        const [profile, list] = await Promise.all([
          read<User>("/api/me", controller.signal),
          read<Business[]>("/api/businesses", controller.signal),
        ]);
        if (identity.current !== profile.id) {
          denied.current.clear();
          if (identity.current) {
            setDetails(null);
            current.current = null;
          }
          identity.current = profile.id;
        }
        let available = list
          .filter((business) => !denied.current.has(business.id))
          .sort((a, b) => a.id.localeCompare(b.id, "en"));
        const saved = preference(profile.id);
        if (saved && !available.some((b) => b.id === saved))
          preference(profile.id, null);
        if (requested && !available.some((b) => b.id === requested))
          setNotice(
            "This business is unavailable for your account. Choose an available business or create a new one.",
          );
        const first =
          available.find((b) => b.id === requested) ??
          available.find((b) => b.id === saved) ??
          available[0];
        const candidates = first
          ? [first, ...available.filter((b) => b.id !== first.id)]
          : [];
        let selected: Details | null = null;
        for (const business of candidates) {
          try {
            selected = await read<Details>(
              `/api/businesses/${encodeURIComponent(business.id)}`,
              controller.signal,
            );
            break;
          } catch (reason) {
            if (
              !(reason instanceof ApiError) ||
              ![403, 404].includes(reason.status)
            )
              throw reason;
            available = available.filter((b) => b.id !== business.id);
            if (saved === business.id) preference(profile.id, null);
            setNotice(
              "You no longer have access to that business. Showing your available businesses.",
            );
          }
        }
        if (controller.signal.aborted) return;
        setUser(profile);
        setBusinesses(available);
        setDetails(selected);
        current.current = selected;
        setState("ready");
        if (selected) {
          preference(profile.id, selected.id);
          resolved.current = { id: selected.id, revision };
          if (requested !== selected.id) {
            const query = new URLSearchParams(window.location.search);
            query.set("businessId", selected.id);
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
        setDetails(null);
        setBusinesses([]);
        setState(
          reason instanceof ApiError && reason.status === 401
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
      if (!identity.current || !current.current) return;
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
    setBusy(true);
    setNotice("");
    setDetails(null);
    setBusinesses([]);
    setUser(null);
    setState("loading");
    try {
      const response = await mutate("/api/auth/logout?app=workspace", "POST");
      setState("signed-out");
      const destination = response.headers.get("Location");
      if (destination) window.location.assign(destination);
    } catch {
      setState("error");
      setNotice("Unable to sign out. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  function switchBusiness(id: string) {
    if (id === current.current?.id) return;
    pending.current?.abort();
    setState("loading");
    setDetails(null);
    current.current = null;
    resolved.current = null;
    setMenu(false);
    setNotice("");
    router.push(`${path}?${new URLSearchParams({ businessId: id })}`);
  }
  const active =
    details && (!requested || details.id === requested) ? details : null;
  const href = (target: string) =>
    active
      ? `${target}?${new URLSearchParams({ businessId: active.id })}`
      : target;
  const retry = () => {
    denied.current.clear();
    resolved.current = null;
    setNotice("");
    setRevision((value) => value + 1);
  };
  const ready = state === "ready" && user;
  const visibleNavigation = navigation.filter(
    ([target]) => active || target === "/" || target === "/businesses",
  );
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1920px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href={href("/")}
            aria-label="Lotuz Workspace overview"
            className="shrink-0 rounded-control"
          >
            <HeaderBrand {...branding.header} showName={!user} />
          </Link>
          {ready && businesses.length > 0 && (
            <div className="order-2 w-full min-w-0 sm:order-none sm:ml-4 sm:max-w-64 sm:flex-1">
              <label htmlFor="business" className="sr-only">
                Business
              </label>
              <select
                id="business"
                className="min-h-11 w-full min-w-0 rounded-control border border-border bg-surface px-3 text-sm"
                value={active?.id ?? ""}
                onChange={(event) => switchBusiness(event.target.value)}
              >
                <option value="" disabled>
                  Loading business...
                </option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="order-1 ml-auto flex items-center gap-2">
            {user && (
              <AccountMenu
                key={user.id}
                user={user}
                onSignOut={() => void logout()}
                busy={busy}
              />
            )}
            {ready && (
              <button
                className="min-h-11 rounded-control border border-border px-3 text-sm lg:hidden"
                aria-expanded={menu}
                aria-controls="workspace-navigation"
                onClick={() => setMenu((value) => !value)}
              >
                Menu
              </button>
            )}
          </div>
        </div>
      </header>
      <div
        className={
          ready
            ? "mx-auto max-w-[1920px] lg:grid lg:grid-cols-[224px_minmax(0,1fr)]"
            : "mx-auto max-w-2xl"
        }
      >
        {ready && (
          <aside
            id="workspace-navigation"
            className={`${menu ? "block" : "hidden"} border-b border-border bg-surface px-4 py-5 lg:sticky lg:top-20 lg:block lg:h-[calc(100dvh-5rem)] lg:overflow-y-auto lg:border-r lg:border-b-0`}
          >
            <p className="mb-4 px-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Your workspace
            </p>
            <nav aria-label="Workspace navigation" className="space-y-1">
              {visibleNavigation.map(([target, label]) => (
                <Link
                  key={target}
                  href={href(target)}
                  aria-current={pathname === target ? "page" : undefined}
                  onClick={() => setMenu(false)}
                  className={`flex min-h-11 items-center rounded-control px-3 py-3 text-sm font-medium ${pathname === target ? "bg-background text-primary" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div className="mt-8 border-t border-border px-3 pt-5 text-xs leading-6 text-muted-foreground">
              <p className="break-words font-medium">
                {active?.name ?? "Lotuz Workspace"}
              </p>
              {active && <p>{active.role.toLowerCase()} access</p>}
              <p className="mt-2">Your businesses. Your Lotuz products.</p>
            </div>
          </aside>
        )}
        <main id="main" className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">
          {notice && (
            <p
              role="alert"
              className="mb-6 rounded-card border border-border bg-surface p-4 text-sm"
            >
              {notice}
            </p>
          )}
          {state === "loading" && (
            <p role="status">Checking Workspace access...</p>
          )}
          {state === "disabled" && (
            <Card>
              <h1 className="text-xl font-semibold">
                Sign-in is not configured
              </h1>
              <p className="mt-3 text-muted-foreground">
                Your administrator needs to connect the Lotuz sign-in provider.
              </p>
            </Card>
          )}
          {state === "signed-out" && (
            <Card>
              <h1 className="text-xl font-semibold">Sign in to Lotuz</h1>
              <p className="my-4 text-muted-foreground">
                One account for your businesses and Lotuz products.
              </p>
              <div className="flex flex-wrap items-center gap-5">
                <ButtonLink href={loginUrl(false, returnTo)}>
                  Sign in
                </ButtonLink>
                <a
                  className="min-h-11 py-3 text-primary"
                  href={loginUrl(true, returnTo)}
                >
                  Create an account
                </a>
              </div>
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
                We could not check your Workspace access. Please try again.
              </p>
              <button onClick={retry} className="mt-4 min-h-11 text-primary">
                Try again
              </button>
            </Card>
          )}
          {ready && (active || !details) && (
            <Workspace.Provider
              value={{
                user,
                businesses,
                details: active,
                href,
                onAccessLost,
                renamed: (name) => {
                  if (!active) return;
                  setBusinesses((list) =>
                    list.map((b) => (b.id === active.id ? { ...b, name } : b)),
                  );
                  setDetails({ ...active, name });
                  current.current = { ...active, name };
                },
                created: (business) => {
                  resolved.current = null;
                  setNotice("");
                  router.push(
                    `/?${new URLSearchParams({ businessId: business.id })}`,
                  );
                },
              }}
            >
              <div
                key={`${user.id}:${active?.id ?? "none"}:${active?.role ?? "none"}`}
              >
                {children}
              </div>
            </Workspace.Provider>
          )}
        </main>
      </div>
    </>
  );
}
