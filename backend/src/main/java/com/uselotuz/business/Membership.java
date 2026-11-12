package com.uselotuz.business;

import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import java.io.Serializable;
import java.util.UUID;

@Entity(name = "business_membership")
class Membership {
    @Embeddable record Key(UUID businessId, UUID userId) implements Serializable {}
    @EmbeddedId private Key id;
    private String role;
    private boolean active;

    protected Membership() {}

    Membership(UUID businessId, UUID userId, String role) {
        this.id = new Key(businessId, userId);
        this.role = role;
        this.active = true;
    }

    UUID userId() { return id.userId(); }
    String role() { return role; }
    boolean active() { return active; }
}
