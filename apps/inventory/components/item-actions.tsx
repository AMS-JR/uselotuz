"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export function ItemActions({
  name,
  open,
  onOpenChange,
  children,
}: {
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 0 });
  const close = useRef(onOpenChange);
  useEffect(() => {
    close.current = onOpenChange;
  }, [onOpenChange]);

  useLayoutEffect(() => {
    if (!open) return;
    function positionMenu() {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      if (
        anchor.bottom <= 0 ||
        anchor.top >= window.innerHeight ||
        anchor.right <= 0 ||
        anchor.left >= window.innerWidth
      ) {
        close.current(false);
        return;
      }
      const margin = 8;
      const width = Math.min(208, window.innerWidth - margin * 2);
      const naturalHeight = menu.current
        ? menu.current.scrollHeight +
          menu.current.offsetHeight -
          menu.current.clientHeight
        : 0;
      const below = window.innerHeight - anchor.bottom - margin * 2;
      const above = anchor.top - margin * 2;
      const flip = below < Math.min(naturalHeight, 160) && above > below;
      const maxHeight = Math.max(0, flip ? above : below);
      const height = Math.min(naturalHeight, maxHeight);
      setPosition({
        left: Math.max(
          margin,
          Math.min(anchor.left, window.innerWidth - width - margin),
        ),
        top: flip ? anchor.top - margin - height : anchor.bottom + margin,
        maxHeight,
      });
    }
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target))
        close.current(false);
    }
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current(false);
        trigger.current?.focus();
      }
    }
    positionMenu();
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keyboard);
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={`Actions for ${name}`}
        aria-expanded={open}
        className="min-h-11 min-w-36 rounded-control border border-border bg-surface px-4 py-2 text-left text-sm font-medium text-primary"
        onClick={(event) => {
          event.stopPropagation();
          onOpenChange(!open);
        }}
      >
        Actions ▾
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            aria-label={`Actions menu for ${name}`}
            className="fixed z-50 flex w-52 max-w-[calc(100vw-1rem)] flex-col items-stretch gap-2 overflow-y-auto rounded-card border border-border bg-surface p-2 shadow-xl"
            style={{
              top: position.top,
              left: position.left,
              maxHeight: position.maxHeight,
            }}
            onClick={(event) => {
              event.stopPropagation();
              if ((event.target as HTMLElement).closest("button"))
                onOpenChange(false);
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
