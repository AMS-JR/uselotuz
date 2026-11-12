package com.uselotuz.business;

import com.uselotuz.identity.IdentityService;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/businesses")
class BusinessController {
    private final IdentityService identities;
    private final BusinessService businesses;

    BusinessController(IdentityService identities, BusinessService businesses) {
        this.identities = identities;
        this.businesses = businesses;
    }

    @GetMapping
    List<BusinessService.BusinessView> list(@AuthenticationPrincipal OidcUser principal) {
        return businesses.list(identities.requireUser(principal));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    BusinessService.BusinessView create(@AuthenticationPrincipal OidcUser principal, @RequestBody Name request) {
        return businesses.create(identities.requireUser(principal), request.name());
    }

    @GetMapping("/{businessId}")
    BusinessService.Details details(@PathVariable UUID businessId, @AuthenticationPrincipal OidcUser principal) {
        return businesses.details(identities.requireUser(principal), businessId);
    }

    @PatchMapping("/{businessId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void rename(@PathVariable UUID businessId, @AuthenticationPrincipal OidcUser principal, @RequestBody Name request) {
        businesses.rename(identities.requireUser(principal), businessId, request.name());
    }

    @GetMapping("/{businessId}/members")
    List<BusinessService.MemberView> members(@PathVariable UUID businessId, @AuthenticationPrincipal OidcUser principal) {
        return businesses.members(identities.requireUser(principal), businessId);
    }

    record Name(String name) {}
}
