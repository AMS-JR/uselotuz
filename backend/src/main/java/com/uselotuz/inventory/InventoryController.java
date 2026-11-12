package com.uselotuz.inventory;

import com.uselotuz.identity.IdentityService;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/businesses/{businessId}/inventory")
class InventoryController {
    private final InventoryService inventory;
    private final IdentityService identities;
    InventoryController(InventoryService inventory, IdentityService identities) { this.inventory = inventory; this.identities = identities; }
    @GetMapping InventoryService.Context context(@PathVariable UUID businessId, @AuthenticationPrincipal OidcUser user) {
        return inventory.context(identities.requireUser(user), businessId);
    }
    @PatchMapping("/location") @ResponseStatus(HttpStatus.NO_CONTENT)
    void rename(@PathVariable UUID businessId, @AuthenticationPrincipal OidcUser user, @RequestBody Rename request) {
        inventory.renameLocation(identities.requireUser(user), businessId, request.name());
    }
    record Rename(String name) {}
}
