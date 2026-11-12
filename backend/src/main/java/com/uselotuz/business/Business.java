package com.uselotuz.business;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.util.UUID;

@Entity(name = "business")
class Business {
    @Id private UUID id;
    private String name;

    protected Business() {}

    Business(UUID id, String name) {
        this.id = id;
        this.name = name;
    }

    UUID id() { return id; }
    String name() { return name; }
    void rename(String name) { this.name = name; }
}
