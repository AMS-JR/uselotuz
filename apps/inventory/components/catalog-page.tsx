"use client";
import { useSearchParams } from "next/navigation";
import { Catalog } from "./catalog";
import { useInventory } from "./inventory-shell";
export function CatalogPage({
  section,
}: {
  section: "items" | "categories" | "suppliers";
}) {
  const inventory = useInventory();
  const params = useSearchParams();
  return (
    <Catalog
      key={`${inventory.businessId}:${section}`}
      businessId={inventory.businessId}
      role={inventory.role}
      onAccessLost={inventory.onAccessLost}
      section={section}
      addInitially={section === "items" && params.get("action") === "add"}
    />
  );
}
