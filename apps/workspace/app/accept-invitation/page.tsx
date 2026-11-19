"use client";
import { useEffect, useState } from "react";
import { loginUrl, mutate, read, ApiError } from "../../lib/api";

export default function AcceptInvitation() {
  const [token, setToken] = useState("");
  const [state, setState] = useState("loading");
  const [business, setBusiness] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState("");
  useEffect(() => {
    const hadFragment = window.location.hash.length > 0;
    const fragment = new URLSearchParams(window.location.hash.slice(1)).get(
      "token",
    );
    if (hadFragment) {
      history.replaceState(null, "", window.location.pathname);
      if (fragment && /^[A-Za-z0-9_-]{43}$/.test(fragment)) {
        sessionStorage.setItem("lotuz.invitation", fragment);
      } else {
        sessionStorage.removeItem("lotuz.invitation");
      }
    }
    const saved = sessionStorage.getItem("lotuz.invitation") ?? "";
    void Promise.resolve().then(() => {
      setToken(saved);
      if (!saved || !/^[A-Za-z0-9_-]{43}$/.test(saved)) {
        sessionStorage.removeItem("lotuz.invitation");
        setState(hadFragment || saved ? "invalid" : "missing");
        return;
      }
      void read<{ email: string | null; emailVerified: boolean }>("/api/me")
        .then((profile) => {
          setEmail(profile.email);
          setState(
            profile.email && profile.emailVerified ? "ready" : "unverified",
          );
        })
        .catch((error) =>
          setState(
            error instanceof ApiError && error.status === 401
              ? "signed-out"
              : "error",
          ),
        );
    });
  }, []);
  async function accept() {
    setState("working");
    try {
      const response = await mutate("/api/invitations/accept", "POST", {
        token,
      });
      const result: { businessId: string } = await response.json();
      sessionStorage.removeItem("lotuz.invitation");
      setToken("");
      setBusiness(result.businessId);
      setState("done");
    } catch {
      setState("error");
    }
  }
  async function switchAccount() {
    setLogoutError("");
    try {
      const response = await mutate("/api/auth/logout?app=workspace", "POST");
      setEmail(null);
      setState("signed-out");
      const destination = response.headers.get("Location");
      if (destination) window.location.assign(destination);
    } catch {
      setLogoutError("Unable to sign out. Please try again.");
    }
  }
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Business invitation</h1>
      {state === "loading" && <p>Checking your account...</p>}
      {state === "signed-out" && (
        <>
          <p>
            Sign in with the verified email address that received this
            invitation.
          </p>
          <a
            className="text-primary"
            href={loginUrl(false, "/accept-invitation")}
          >
            Sign in
          </a>
        </>
      )}
      {state === "ready" && (
        <>
          <p>
            Accept this invitation using your signed-in account. Your verified
            email must match the invitation.
          </p>
          <p className="break-all text-sm">Signed in as {email}</p>
          <button
            className="rounded-control bg-primary px-4 py-3 text-white"
            onClick={() => void accept()}
          >
            Accept invitation
          </button>
        </>
      )}
      {state === "unverified" && (
        <p role="alert">
          Your current sign-in does not include a verified email address. Verify
          your email with Auth0, then sign out and sign in again before
          reopening the invitation link.
        </p>
      )}
      {(state === "ready" ||
        state === "unverified" ||
        (state === "error" && email)) && (
        <div className="space-y-2">
          <button
            className="min-h-11 text-sm text-primary"
            onClick={() => void switchAccount()}
          >
            Sign out to use another account
          </button>
          <p className="text-sm text-muted-foreground">
            After signing out, reopen your invitation link and sign in with the
            invited email.
          </p>
          {logoutError && <p role="alert">{logoutError}</p>}
        </div>
      )}
      {state === "working" && <p role="status">Accepting invitation...</p>}
      {state === "done" && (
        <>
          <p role="status">Invitation accepted.</p>
          <a
            className="text-primary"
            href={`/members?businessId=${encodeURIComponent(business)}`}
          >
            Open Workspace
          </a>
        </>
      )}
      {state === "missing" && (
        <p role="alert">
          Invitation link is missing. Ask the owner for a new link.
        </p>
      )}
      {state === "invalid" && (
        <p role="alert">
          This invitation link is invalid. Ask the owner to revoke it and send a
          new link copied directly from Workspace.
        </p>
      )}
      {state === "error" && (
        <div role="alert" className="space-y-2">
          <p>Unable to accept this invitation.</p>
          {email && <p className="break-all text-sm">Signed in as {email}</p>}
          <p>
            Ask the business owner to check that the invitation was sent to this
            exact email address and has not expired or been revoked. Email
            aliases are treated as different addresses.
          </p>
        </div>
      )}
    </main>
  );
}
