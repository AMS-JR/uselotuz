package com.uselotuz.identity;

import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class IdentityController {
    private final IdentityService identities;
    private final boolean enabled;
    IdentityController(IdentityService identities, @Value("${lotuz.oidc.enabled:false}") boolean enabled) {
        this.identities = identities; this.enabled = enabled;
    }
    @GetMapping("/api/auth/config") Map<String, Boolean> configuration() { return Map.of("enabled", enabled); }
    @GetMapping("/api/auth/csrf") Map<String, String> csrf(CsrfToken token) {
        return Map.of("headerName", token.getHeaderName(), "token", token.getToken());
    }
    @GetMapping("/api/me") UserView me(@AuthenticationPrincipal OidcUser user) {
        return new UserView(identities.requireUser(user), user.getFullName() == null ? "Lotuz user" : user.getFullName());
    }
    record UserView(UUID id, String name) {}
}
