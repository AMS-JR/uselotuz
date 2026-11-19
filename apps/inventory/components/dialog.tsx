"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function Dialog({
  label,
  onDismiss,
  busy = false,
  error,
  children,
  wide = false,
}: {
  label: string;
  onDismiss: () => void;
  busy?: boolean;
  error?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const active = document.activeElement;
    const disclosure =
      active instanceof HTMLElement ? active.closest("details") : null;
    const trigger = disclosure?.querySelector("summary") ?? active;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] ${wide ? "max-w-5xl" : "max-w-2xl"} overflow-y-auto rounded-card border border-border bg-surface p-0 text-foreground shadow-xl backdrop:bg-slate-950/40`}
    >
      <div className="p-5 sm:p-7">
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-control border border-error/30 p-3 text-sm"
          >
            {error}
          </p>
        )}
        {children}
      </div>
    </dialog>
  );
}
