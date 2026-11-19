"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Card } from "@uselotuz/ui";
import { mutate, read } from "../lib/api";

type Member = {
  userId: string;
  name: string;
  role: string;
  active: boolean;
  inventoryRole: string | null;
};
type Invitation = {
  id: string;
  email: string;
  role: string;
  inventoryAccess: boolean;
  expiresAt: string;
};
const control = "min-h-11 rounded-control border border-border bg-surface px-3";
const button =
  "min-h-11 rounded-control bg-primary px-4 py-2 text-sm text-white disabled:opacity-50";
export function MembershipManagement({
  businessId,
  userId,
}: {
  businessId: string;
  userId: string;
}) {
  const [members, setMembers] = useState<Member[]>([]),
    [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [link, setLink] = useState("");
  const [email, setEmail] = useState(""),
    [role, setRole] = useState("STAFF"),
    [inventory, setInventory] = useState(false);
  const base = `/api/businesses/${encodeURIComponent(businessId)}/membership`;
  const load = useCallback(async () => {
    try {
      const [m, i] = await Promise.all([
        read<Member[]>(`${base}/members`),
        read<Invitation[]>(`${base}/invitations`),
      ]);
      setMembers(m);
      setInvitations(i);
    } catch {
      setError("Unable to load membership. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [base]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  async function action(
    path: string,
    method: "POST" | "PATCH",
    body: unknown,
    success: string,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await mutate(path, method, body);
      await load();
      setNotice(success);
      return response;
    } catch {
      setError(
        "Unable to save. Check permissions, Inventory activation, and whether the invitation is still pending.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function invite(event: FormEvent) {
    event.preventDefault();
    setLink("");
    const response = await action(
      `${base}/invitations`,
      "POST",
      { email, role, inventoryAccess: inventory },
      "Invitation created. Share the link securely; it is shown only once.",
    );
    if (response) {
      const result: { token: string } = await response.json();
      setLink(
        `${window.location.origin}/accept-invitation#token=${encodeURIComponent(result.token)}`,
      );
      setEmail("");
    }
  }
  async function change(member: Member, patch: Partial<Member>) {
    const next = { ...member, ...patch };
    await action(
      `${base}/members/${member.userId}`,
      "PATCH",
      {
        role: next.role,
        active: next.active,
        inventoryAccess: !!next.inventoryRole,
      },
      "Membership updated.",
    );
  }
  return (
    <div className="space-y-5">
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <Card>
        <h2 className="text-xl font-semibold">Invite an employee</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Invitations expire after seven days. Inventory access is separate from
          membership.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => void invite(e)}
        >
          <label className="grid gap-1 text-sm">
            Email
            <input
              className={control}
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Business role
            <select
              className={control}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={inventory}
              onChange={(e) => setInventory(e.target.checked)}
            />{" "}
            Grant Inventory access
          </label>
          <button className={button} disabled={busy}>
            Create invitation
          </button>
        </form>
        {link && (
          <div className="mt-4">
            <label className="grid gap-2 text-sm">
              Secure invitation link
              <input
                className={`${control} w-full`}
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Share privately with the intended recipient. Anyone with this link
              can attempt to accept it.
            </p>
          </div>
        )}
      </Card>
      <Card>
        <h2 className="text-xl font-semibold">Members</h2>
        {loading ? (
          <p role="status">Loading members...</p>
        ) : members.length === 0 ? (
          <p className="mt-3">No members.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex flex-wrap items-center gap-3 py-4"
              >
                <div className="min-w-40 flex-1">
                  <p className="font-medium">{m.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {m.active ? "Active" : "Inactive"} · {m.role.toLowerCase()}
                    {m.userId === userId ? " (you)" : ""}
                  </p>
                </div>
                {m.role !== "OWNER" && (
                  <>
                    <label className="text-sm">
                      Role{" "}
                      <select
                        className={control}
                        disabled={busy || !m.active}
                        value={m.role}
                        onChange={(e) =>
                          void change(m, { role: e.target.value })
                        }
                      >
                        <option value="STAFF">Staff</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        disabled={busy || !m.active}
                        checked={!!m.inventoryRole}
                        onChange={(e) =>
                          void change(m, {
                            inventoryRole: e.target.checked ? m.role : null,
                          })
                        }
                      />{" "}
                      Inventory access
                    </label>
                    {m.active && (
                      <button
                        className="min-h-11 text-sm text-primary"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Deactivate ${m.name}?`))
                            void change(m, {
                              active: false,
                              inventoryRole: null,
                            });
                        }}
                      >
                        Deactivate
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="text-xl font-semibold">Pending invitations</h2>
        {!loading && invitations.length === 0 && (
          <p className="mt-3">No pending invitations.</p>
        )}
        <ul className="divide-y divide-border">
          {invitations.map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center justify-between gap-2 py-4"
            >
              <div>
                <p>{i.email}</p>
                <p className="text-sm text-muted-foreground">
                  {i.role.toLowerCase()} ·{" "}
                  {i.inventoryAccess ? "Inventory access" : "Workspace only"} ·
                  Expires {new Date(i.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <button
                className="min-h-11 text-sm text-primary"
                disabled={busy}
                onClick={() =>
                  void action(
                    `${base}/invitations/${i.id}/revoke`,
                    "POST",
                    undefined,
                    "Invitation revoked.",
                  )
                }
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
