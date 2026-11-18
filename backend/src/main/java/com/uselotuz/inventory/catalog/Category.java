package com.uselotuz.inventory.catalog;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="inventory_category", uniqueConstraints=@UniqueConstraint(columnNames={"business_id", "name_key"}))
class Category {
    @Id UUID id = UUID.randomUUID();
    @Column(nullable=false) UUID businessId;
    @Column(nullable=false, length=200) String name;
    @Column(nullable=false, length=200) String nameKey;
    @Column(nullable=false) boolean archived;
    @Column(nullable=false) Instant createdAt = Instant.now();
    @Column(nullable=false) Instant updatedAt = createdAt;
    protected Category() {}
    Category(UUID businessId) { this.businessId = businessId; }
}
