package com.uselotuz.identity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.util.UUID;

@Entity(name = "platform_user")
class PlatformUser {
    @Id private UUID id;
    private String displayName;
    protected PlatformUser() {}
    PlatformUser(UUID id, String displayName) { this.id = id; this.displayName = displayName; }
    UUID id() { return id; }
}
