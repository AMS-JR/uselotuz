package com.uselotuz.inventory.catalog;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity @Table(name="inventory_stock_threshold", uniqueConstraints=@UniqueConstraint(columnNames={"business_id","item_id","location_id"}))
class StockThreshold {
    @Id UUID id=UUID.randomUUID();
    @Column(nullable=false) UUID businessId;
    @Column(nullable=false) UUID itemId;
    @Column(nullable=false) UUID locationId;
    @Column(nullable=false,precision=20,scale=6) BigDecimal quantity;
    protected StockThreshold() {}
    StockThreshold(UUID business, UUID item, UUID location, BigDecimal quantity) { this.businessId=business; this.itemId=item; this.locationId=location; this.quantity=quantity; }
}
