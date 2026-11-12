package com.uselotuz.access;

import jakarta.persistence.*;
import java.io.Serializable;
import java.util.UUID;

@Entity(name = "product_access")
class ProductAccess {
    @Embeddable record Key(UUID businessId, UUID userId, String productCode) implements Serializable {}
    @EmbeddedId private Key id;
    private String role;
    private boolean active;
    protected ProductAccess() {}
    String role() { return role; }
    boolean active() { return active; }
}
