import type { ComponentProps } from "react";

// Native anchors preserve keyboard behavior and work without client JavaScript.
export function ButtonLink({ className = "", ...props }: ComponentProps<"a">) {
  return (
    <a
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-primary px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-hover ${className}`}
      {...props}
    />
  );
}

export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      className={`rounded-card border border-border bg-surface p-6 ${className}`}
      {...props}
    />
  );
}
