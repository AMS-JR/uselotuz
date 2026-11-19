package com.uselotuz.inventory.catalog;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
@Entity @Table(name="inventory_reorder_plan",uniqueConstraints=@UniqueConstraint(columnNames={"business_id","item_id","location_id"}))
class ReorderPlan {
    @Id UUID id=UUID.randomUUID();
    @Column(nullable=false) UUID businessId;
    @Column(nullable=false) UUID itemId;
    @Column(nullable=false) UUID locationId;
    @Column(nullable=false,precision=20,scale=6) BigDecimal quantity;
    @Column(nullable=false) UUID updatedBy;
    @Column(nullable=false) Instant updatedAt;
    protected ReorderPlan() {}
    ReorderPlan(UUID business, UUID item, UUID location) { businessId=business; itemId=item; locationId=location; }
}
