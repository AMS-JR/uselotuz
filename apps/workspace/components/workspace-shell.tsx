"use client";

import { useCallback, useEffect, useState } from "react";
import { ButtonLink, Card } from "@uselotuz/ui";
import { ApiError, loginUrl, mutate, read } from "../lib/api";
import { BusinessPanel } from "./business-panel";

type Business = { id: string; name: string };
type User = { id: string; name: string };
type State = "loading" | "disabled" | "signed-out" | "ready" | "error";

export function WorkspaceShell() {
  const [state, setState] = useState<State>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selected, setSelected] = useState("");
  const [newName, setNewName] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const expired = useCallback(() => {
    setUser(null);
    setBusinesses([]);
    setSelected("");
    setState("signed-out");
  }, []);

  const renamed = useCallback((id: string, name: string) => {
    setBusinesses((current) =>
      current.map((business) =>
        business.id === id ? { ...business, name } : business,
      ),
    );
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const query = new URLSearchParams(window.location.search);
        if (query.has("authError"))
          setNotice("Sign-in did not complete. Please try again.");
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
        if (controller.signal.aborted) return;
        setUser(profile);
        setBusinesses(list);
        const requested = query.get("businessId");
        if (requested && list.some((business) => business.id === requested))
          setSelected(requested);
        else if (list.length === 1) setSelected(list[0].id);
        setState("ready");
      } catch (reason) {
        if (controller.signal.aborted) return;
        if (reason instanceof ApiError && reason.status === 401) expired();
        else setState("error");
      }
    }
    void load();
    return () => controller.abort();
  }, [expired]);

  async function createBusiness(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const response = await mutate("/api/businesses", "POST", {
        name: newName,
      });
      const business: Business = await response.json();
      setBusinesses((current) => [...current, business]);
      setSelected(business.id);
      setNewName("");
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) expired();
      else
        setNotice(
          "Unable to create the business. Enter a name of 1–200 characters and try again.",
        );
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setNotice("");
    try {
      const response = await mutate("/api/auth/logout?app=workspace", "POST");
      expired();
      const destination = response.headers.get("Location");
      if (destination) window.location.assign(destination);
    } catch {
      setNotice("Unable to sign out. Please try again.");
    } finally {
      setBusy(false);
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
            <span className="font-normal text-muted-foreground">Workspace</span>
          </span>
          {state === "ready" && (
            <button
              onClick={() => void logout()}
              disabled={busy}
              className="min-h-11 px-3 text-sm text-primary disabled:opacity-60"
            >
              Sign out
            </button>
          )}
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          Your Lotuz workspace
        </h1>
        <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
          Manage your businesses and open the Lotuz products you use.
        </p>
        <div className="mt-8" aria-live="polite">
          {notice && (
            <p
              role="alert"
              className="mb-6 rounded-card border border-border bg-surface p-5"
            >
              {notice}
            </p>
          )}
          {state === "loading" && <p role="status">Checking access…</p>}
          {state === "disabled" && (
            <Card>
              <h2 className="text-lg font-semibold">
                Sign-in is not configured
              </h2>
              <p className="mt-3 text-muted-foreground">
                Your administrator needs to connect the Lotuz sign-in provider.
              </p>
            </Card>
          )}
          {state === "signed-out" && (
            <Card>
              <h2 className="text-lg font-semibold">Sign in to Lotuz</h2>
              <p className="my-4 text-muted-foreground">
                One account for your businesses and Lotuz products.
              </p>
              <div className="flex flex-wrap items-center gap-5">
                <ButtonLink href={loginUrl()}>Sign in</ButtonLink>
                <a className="min-h-11 py-3 text-primary" href={loginUrl(true)}>
                  Create an account
                </a>
              </div>
            </Card>
          )}
          {state === "error" && (
            <Card>
              <h2 className="text-lg font-semibold">Unable to connect</h2>
              <p className="mt-3 text-muted-foreground">
                Please refresh to try again. If the problem continues, contact
                your administrator.
              </p>
            </Card>
          )}
          {state === "ready" && user && (
            <>
              <p className="mb-6 text-sm text-muted-foreground">
                Signed in as{" "}
                <span className="font-medium text-foreground">{user.name}</span>
              </p>
              {businesses.length > 0 ? (
                <div className="max-w-2xl">
                  <label htmlFor="business" className="mb-2 block font-medium">
                    Business
                  </label>
                  <select
                    id="business"
                    value={selected}
                    onChange={(event) => setSelected(event.target.value)}
                    className="min-h-11 w-full rounded-control border border-border bg-surface px-3"
                  >
                    <option value="">Choose a business</option>
                    {businesses.map((business) => (
                      <option key={business.id} value={business.id}>
                        {business.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="mb-6">
                  No businesses yet. Create your first business below.
                </p>
              )}
              {selected && (
                <BusinessPanel
                  key={selected}
                  businessId={selected}
                  userId={user.id}
                  onExpired={expired}
                  onRenamed={renamed}
                />
              )}
              <Card className="mt-8">
                <h2 className="text-xl font-semibold">Create a business</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  You will be its owner. Products are activated separately with
                  Lotuz approval.
                </p>
                <form
                  onSubmit={(event) => void createBusiness(event)}
                  className="mt-5 max-w-lg space-y-3"
                >
                  <label
                    htmlFor="new-business-name"
                    className="block font-medium"
                  >
                    New business name
                  </label>
                  <input
                    id="new-business-name"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    maxLength={200}
                    required
                    className="min-h-11 w-full rounded-control border border-border bg-surface px-3"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="min-h-11 rounded-control bg-primary px-5 py-3 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {busy ? "Please wait…" : "Create business"}
                  </button>
                </form>
              </Card>
            </>
          )}
        </div>
      </main>
    </>
  );
}
