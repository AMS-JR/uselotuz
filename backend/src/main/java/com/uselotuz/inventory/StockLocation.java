package com.uselotuz.inventory;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Column;
import java.util.UUID;

@Entity(name = "inventory_location")
class StockLocation {
    @Id private UUID id;
    @Column(nullable = false, unique = true) private UUID businessId;
    private String name;
    protected StockLocation() {}
    UUID id() { return id; }
    String name() { return name; }
    void rename(String name) { this.name = name; }
}
