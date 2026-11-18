package com.uselotuz.inventory.catalog;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="inventory_supplier")
class Supplier {
    @Id UUID id = UUID.randomUUID();
    @Column(nullable=false) UUID businessId;
    @Column(nullable=false, length=200) String name;
    @Column(length=200) String contactPerson;
    @Column(length=254) String email;
    @Column(length=50) String phone;
    @Column(length=1000) String address;
    @Column(length=2000) String notes;
    @Column(nullable=false) boolean archived;
    @Column(nullable=false) Instant createdAt = Instant.now();
    @Column(nullable=false) Instant updatedAt = createdAt;
    protected Supplier() {}
    Supplier(UUID businessId) { this.businessId = businessId; }
}
