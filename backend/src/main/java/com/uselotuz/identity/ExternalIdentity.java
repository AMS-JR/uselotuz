package com.uselotuz.identity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.util.UUID;

@Entity(name = "external_identity")
class ExternalIdentity {
    @Id private UUID id;
    private UUID userId;
    private String issuer;
    private String subject;
    protected ExternalIdentity() {}
    ExternalIdentity(UUID userId, String issuer, String subject) {
        this.id = UUID.randomUUID(); this.userId = userId; this.issuer = issuer; this.subject = subject;
    }
    UUID userId() { return userId; }
}
