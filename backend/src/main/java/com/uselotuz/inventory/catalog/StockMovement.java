package com.uselotuz.inventory.catalog;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="inventory_stock_movement")
class StockMovement {
    @Id UUID id = UUID.randomUUID();
    @Column(nullable=false) UUID businessId;
    @Column(nullable=false) UUID itemId;
    @Column(nullable=false) UUID locationId;
    @Column(nullable=false, length=32) String movementType = "OPENING";
    @Column(nullable=false, precision=20, scale=6) BigDecimal quantity;
    @Enumerated(EnumType.STRING) @Column(nullable=false, length=16) MeasurementUnit unit;
    @Column(nullable=false) UUID createdBy;
    @Column(nullable=false) Instant createdAt = Instant.now();
    UUID supplierId;
    @Column(length=200) String receiptReference;
    @Column(length=2000) String notes;
    @Column(length=500) String adjustmentReason;
    @Column(length=500) String consumptionReason;
    UUID idempotencyKey;
    protected StockMovement() {}
    StockMovement(UUID business, UUID item, UUID location, BigDecimal quantity, MeasurementUnit unit, UUID user) {
        this.businessId=business; this.itemId=item; this.locationId=location; this.quantity=quantity; this.unit=unit; this.createdBy=user;
    }
}
