package com.uselotuz.access;

import jakarta.persistence.*;
import java.io.Serializable;
import java.util.UUID;

@Entity(name = "product_entitlement")
class Entitlement {
    @Embeddable record Key(UUID businessId, String productCode) implements Serializable {}
    @EmbeddedId private Key id;
    private boolean active;
    protected Entitlement() {}
    boolean active() { return active; }
}
