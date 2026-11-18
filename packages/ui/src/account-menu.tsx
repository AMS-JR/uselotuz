"use client";

import { useEffect, useRef, useState } from "react";
export type AccountProfile = {
  name: string;
  email?: string | null;
  picture?: string | null;
};
function pictureUrl(value?: string | null) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
/** Display-only provider profile. Authentication and logout stay application-owned. */
export function AccountMenu({
  user,
  onSignOut,
  busy = false,
  links = [],
}: {
  user: AccountProfile;
  onSignOut: () => void;
  busy?: boolean;
  links?: { href: string; label: string }[];
}) {
  const root = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const [broken, setBroken] = useState<string | null>(null);
  const source = pictureUrl(user.picture);
  const initials =
    user.name
      .trim()
      .split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => Array.from(part)[0])
      .join("")
      .toLocaleUpperCase() || "U";
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target) &&
        root.current
      )
        root.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return (
    <details
      ref={root}
      className="relative shrink-0"
      onKeyDown={(event) => {
        if (event.key === "Escape" && root.current?.open) {
          root.current.open = false;
          trigger.current?.focus();
          event.stopPropagation();
        }
      }}
    >
      <summary
        ref={trigger}
        aria-label={`Account menu for ${user.name}`}
        className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-border bg-background text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden"
      >
        {source && source !== broken ? (
          <>
            {/* Provider-hosted display image: no optimizer, proxy, or credentials required. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={source}
              alt=""
              width={40}
              height={40}
              referrerPolicy="no-referrer"
              className="h-10 w-10 rounded-full object-cover"
              onError={() => setBroken(source)}
            />
          </>
        ) : (
          <span aria-hidden="true">{initials}</span>
        )}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-surface p-3 shadow-sm">
        <div className="border-b border-border px-2 pb-3">
          <p className="break-words text-sm font-semibold">{user.name}</p>
          {user.email && (
            <p className="mt-1 break-all text-xs text-muted-foreground">
              {user.email}
            </p>
          )}
        </div>
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="block min-h-11 rounded-control px-2 py-3 text-sm text-primary"
          >
            {link.label}
          </a>
        ))}
        <button
          className="min-h-11 w-full rounded-control px-2 py-3 text-left text-sm text-primary disabled:opacity-50"
          disabled={busy}
          onClick={onSignOut}
        >
          {busy ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </details>
  );
}
