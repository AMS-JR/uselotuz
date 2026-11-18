package com.uselotuz.inventory.catalog;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CatalogDtos {
    private CatalogDtos() {}
    public record ItemInput(String name, String description, String sku, String barcode, String itemType,
            MeasurementUnit unit, UUID categoryId, UUID supplierId) {}
    public record CategoryInput(String name) {}
    public record SupplierInput(String name, String contactPerson, String email, String phone, String address, String notes) {}
    public record ItemView(UUID id, String name, String description, String sku, String barcode, String itemType,
            MeasurementUnit unit, UUID categoryId, UUID supplierId, boolean archived, Instant createdAt, Instant updatedAt) {}
    public record CategoryView(UUID id, String name, boolean archived, Instant createdAt, Instant updatedAt) {}
    public record SupplierView(UUID id, String name, String contactPerson, String email, String phone, String address,
            String notes, boolean archived, Instant createdAt, Instant updatedAt) {}
    public record Summary(long activeItems, long categories, long suppliers, long products, long ingredients, List<ItemView> recentItems) {}
    public record ItemPage(List<ItemView> items, long total, int page, int size) {}
    static ItemView view(StockItem i) { return new ItemView(i.id,i.name,i.description,i.sku,i.barcode,i.itemType,i.unit,
            i.categoryId,i.supplierId,i.archived,i.createdAt,i.updatedAt); }
    static CategoryView view(Category c) { return new CategoryView(c.id,c.name,c.archived,c.createdAt,c.updatedAt); }
    static SupplierView view(Supplier s) { return new SupplierView(s.id,s.name,s.contactPerson,s.email,s.phone,s.address,s.notes,
            s.archived,s.createdAt,s.updatedAt); }
}
