package com.uselotuz.identity;

import static org.junit.jupiter.api.Assertions.assertThrows;
import org.junit.jupiter.api.Test;

class OidcConfigurationTest {
    @Test void missingProviderSettingsAreRejectedBeforeDiscovery() {
        var configuration = new OidcConfiguration();
        assertThrows(IllegalStateException.class, () -> configuration.registrations("", "client", "secret", "http://localhost:8080"));
        assertThrows(IllegalStateException.class, () -> configuration.registrations("https://issuer.example", "", "secret", "http://localhost:8080"));
        assertThrows(IllegalStateException.class, () -> configuration.registrations("https://issuer.example", "client", "", "http://localhost:8080"));
    }
}
