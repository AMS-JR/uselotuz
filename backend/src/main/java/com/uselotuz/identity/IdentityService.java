package com.uselotuz.identity;

import java.util.UUID;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IdentityService {
    private final UserRepository users;
    private final ExternalIdentityRepository identities;
    public IdentityService(UserRepository users, ExternalIdentityRepository identities) {
        this.users = users; this.identities = identities;
    }
    @Transactional
    public UUID register(OidcUser principal) {
        var existing = identities.findByIssuerAndSubject(principal.getIssuer().toString(), principal.getSubject());
        if (existing.isPresent()) return existing.get().userId();
        UUID id = UUID.randomUUID();
        String name = principal.getFullName();
        users.saveAndFlush(new PlatformUser(id, name == null ? "Lotuz user" : name.substring(0, Math.min(200, name.length()))));
        identities.save(new ExternalIdentity(id, principal.getIssuer().toString(), principal.getSubject()));
        return id;
    }
    @Transactional(readOnly = true)
    public UUID requireUser(OidcUser principal) {
        return identities.findByIssuerAndSubject(principal.getIssuer().toString(), principal.getSubject())
                .map(ExternalIdentity::userId).orElseThrow(() -> new AccessDeniedException("Account is not provisioned"));
    }
}
