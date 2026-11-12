"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ButtonLink, Card } from "@uselotuz/ui";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
type Business = { id: string; name: string };
type Context = {
  businessId: string;
  role: string;
  location: { id: string; name: string };
};
type State = "loading" | "disabled" | "signed-out" | "ready" | "error";

export function InventoryShell() {
  const [state, setState] = useState<State>("loading");
  const [returnTo, setReturnTo] = useState("/");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selected, setSelected] = useState("");
  const [context, setContext] = useState<Context | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);

  const selectBusiness = useCallback(
    async (id: string, signal?: AbortSignal) => {
      const current = ++request.current;
      setSelected(id);
      setContext(null);
      setNotice("");
      setBusy(Boolean(id));
      if (!id) return;
      try {
        const response = await fetch(
          `${api}/api/businesses/${encodeURIComponent(id)}/inventory`,
          { credentials: "include", cache: "no-store", signal },
        );
        if (current !== request.current || signal?.aborted) return;
        if (response.status === 401) {
          setState("signed-out");
          setBusinesses([]);
          return;
        }
        if (response.status === 403) {
          setNotice(
            "Inventory access is unavailable for this business. Ask your owner or administrator to check your Inventory access.",
          );
          return;
        }
        if (response.status === 404) {
          setNotice(
            "This business’s Inventory location has not been set up yet.",
          );
          return;
        }
        if (!response.ok) throw new Error();
        const data: Context = await response.json();
        if (current === request.current && !signal?.aborted) setContext(data);
      } catch {
        if (current === request.current && !signal?.aborted)
          setNotice("Unable to load this business. Please try again.");
      } finally {
        if (current === request.current && !signal?.aborted) setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const query = new URLSearchParams(window.location.search);
        const requested = query.get("businessId");
        if (requested && /^[0-9a-f-]{36}$/i.test(requested))
          setReturnTo(`/?businessId=${requested}`);
        if (query.has("authError"))
          setNotice("Sign-in did not complete. Please try again.");
        const config = await fetch(`${api}/api/auth/config`, {
          credentials: "include",
          signal: controller.signal,
          cache: "no-store",
        });
        if (!config.ok) throw new Error();
        if (!(await config.json()).enabled) {
          setState("disabled");
          return;
        }
        const response = await fetch(`${api}/api/businesses`, {
          credentials: "include",
          signal: controller.signal,
          cache: "no-store",
        });
        if (response.status === 401) {
          setState("signed-out");
          return;
        }
        if (!response.ok) throw new Error();
        const list: Business[] = await response.json();
        if (controller.signal.aborted) return;
        setBusinesses(list);
        setState("ready");
        if (requested) {
          if (list.some((business) => business.id === requested))
            await selectBusiness(requested, controller.signal);
          else setNotice("This business is unavailable for your account.");
        }
      } catch {
        if (!controller.signal.aborted) setState("error");
      }
    }
    void load();
    return () => controller.abort();
  }, [selectBusiness]);

  async function logout() {
    ++request.current;
    setContext(null);
    setBusinesses([]);
    setSelected("");
    setState("loading");
    try {
      const response = await fetch(`${api}/api/auth/csrf`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) throw new Error();
      const csrf: { headerName: string; token: string } = await response.json();
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

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <span className="text-xl font-semibold">
            Lotuz{" "}
            <span className="font-normal text-muted-foreground">Inventory</span>
          </span>
          {state === "ready" && (
            <button
              onClick={() => void logout()}
              className="min-h-11 px-3 text-sm text-primary"
            >
              Sign out
            </button>
          )}
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          Your Inventory workspace
        </h1>
        <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
          Select a business to access its Inventory workspace.
        </p>
        <div className="mt-8 max-w-2xl" aria-live="polite">
          {notice && state !== "ready" && (
            <p className="mb-6" role="alert">
              {notice}
            </p>
          )}
          {state === "loading" && <p role="status">Checking access…</p>}
          {state === "disabled" && (
            <Card>
              <h2 className="text-lg font-semibold">
                Sign-in is not configured
              </h2>
              <p className="mt-3 leading-7 text-muted-foreground">
                Your administrator needs to connect the Lotuz sign-in provider
                before this workspace can be used.
              </p>
            </Card>
          )}
          {state === "signed-out" && (
            <Card>
              <h2 className="text-lg font-semibold">Sign in to Lotuz</h2>
              <p className="my-4 leading-7 text-muted-foreground">
                Use your Lotuz account. Access depends on your business
                membership and Inventory permissions.
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
            </Card>
          )}
          {state === "error" && (
            <Card>
              <h2 className="text-lg font-semibold">Unable to connect</h2>
              <p className="mt-3 leading-7 text-muted-foreground">
                Please refresh to try again. If the problem continues, contact
                your administrator.
              </p>
            </Card>
          )}
          {state === "ready" && (
            <>
              {businesses.length === 0 ? (
                <Card>
                  <h2 className="text-lg font-semibold">
                    No businesses available
                  </h2>
                  <p className="mt-3 text-muted-foreground">
                    Ask your administrator to add you to a business.
                  </p>
                </Card>
              ) : (
                <div>
                  <label htmlFor="business" className="mb-2 block font-medium">
                    Business
                  </label>
                  <select
                    id="business"
                    value={selected}
                    onChange={(e) => void selectBusiness(e.target.value)}
                    className="min-h-11 w-full rounded-control border border-border bg-surface px-3"
                  >
                    <option value="">Choose a business</option>
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {busy && (
                <p className="mt-6" role="status">
                  Checking business access…
                </p>
              )}
              {notice && (
                <p
                  className="mt-6 rounded-card border border-border bg-surface p-5"
                  role="alert"
                >
                  {notice}
                </p>
              )}
              {context && (
                <Card className="mt-6">
                  <h2 className="text-xl font-semibold">Workspace ready</h2>
                  <dl className="mt-5 grid grid-cols-2 gap-3">
                    <dt className="text-muted-foreground">Your role</dt>
                    <dd>{context.role.toLowerCase()}</dd>
                    <dt className="text-muted-foreground">Stock location</dt>
                    <dd>{context.location.name}</dd>
                  </dl>
                  <p className="mt-6 text-sm leading-6 text-muted-foreground">
                    Your business access is confirmed.
                  </p>
                </Card>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
