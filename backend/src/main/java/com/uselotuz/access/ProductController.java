package com.uselotuz.access;

import com.uselotuz.identity.IdentityService;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
class ProductController {
    private final IdentityService identities;
    private final AccessService access;

    ProductController(IdentityService identities, AccessService access) {
        this.identities = identities;
        this.access = access;
    }

    @GetMapping("/api/businesses/{businessId}/products")
    List<AccessService.ProductView> products(@PathVariable UUID businessId, @AuthenticationPrincipal OidcUser principal) {
        return access.products(identities.requireUser(principal), businessId);
    }
}
