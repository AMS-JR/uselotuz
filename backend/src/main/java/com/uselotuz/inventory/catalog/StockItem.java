package com.uselotuz.inventory.catalog;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="inventory_item", uniqueConstraints={
    @UniqueConstraint(columnNames={"business_id","sku_key"}), @UniqueConstraint(columnNames={"business_id","barcode"})})
class StockItem {
    @Id UUID id = UUID.randomUUID();
    @Column(nullable=false) UUID businessId;
    @Column(nullable=false, length=200) String name;
    @Column(length=2000) String description;
    @Column(length=100) String sku;
    @Column(length=100) String skuKey;
    @Column(length=100) String barcode;
    @Column(nullable=false, length=16) String itemType;
    @Enumerated(EnumType.STRING) @Column(nullable=false, length=16) MeasurementUnit unit;
    UUID categoryId;
    UUID supplierId;
    @Column(nullable=false) boolean archived;
    @Column(nullable=false) Instant createdAt = Instant.now();
    @Column(nullable=false) Instant updatedAt = createdAt;
    protected StockItem() {}
    StockItem(UUID businessId) { this.businessId = businessId; }
}
