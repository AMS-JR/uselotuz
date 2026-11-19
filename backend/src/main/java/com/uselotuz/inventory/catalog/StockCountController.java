package com.uselotuz.inventory.catalog;

import com.uselotuz.identity.IdentityService;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/businesses/{businessId}/inventory/counts")
class StockCountController {
    private final StockCountService counts; private final IdentityService identities;
    StockCountController(StockCountService counts,IdentityService identities) { this.counts=counts; this.identities=identities; }
    @GetMapping StockCountService.CountPage list(@PathVariable UUID businessId,@RequestParam UUID locationId,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="25") int size,@AuthenticationPrincipal OidcUser user) { return counts.list(identities.requireUser(user),businessId,locationId,page,size); }
    @GetMapping("/{id}") StockCountService.Count get(@PathVariable UUID businessId,@PathVariable UUID id,@AuthenticationPrincipal OidcUser user) { return counts.get(identities.requireUser(user),businessId,id); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED) StockCountService.Count create(@PathVariable UUID businessId,@RequestBody StockCountService.Create input,@AuthenticationPrincipal OidcUser user) { return counts.create(identities.requireUser(user),businessId,input); }
    @PutMapping("/{id}") StockCountService.Count save(@PathVariable UUID businessId,@PathVariable UUID id,@RequestBody StockCountService.Save input,@AuthenticationPrincipal OidcUser user) { return counts.save(identities.requireUser(user),businessId,id,input); }
    @PostMapping("/{id}/refresh") StockCountService.Count refresh(@PathVariable UUID businessId,@PathVariable UUID id,@RequestBody StockCountService.Version input,@AuthenticationPrincipal OidcUser user) { return counts.refresh(identities.requireUser(user),businessId,id,input); }
    @PostMapping("/{id}/cancel") StockCountService.Count cancel(@PathVariable UUID businessId,@PathVariable UUID id,@RequestBody StockCountService.Version input,@AuthenticationPrincipal OidcUser user) { return counts.cancel(identities.requireUser(user),businessId,id,input); }
    @PostMapping("/{id}/confirm") StockCountService.Count confirm(@PathVariable UUID businessId,@PathVariable UUID id,@RequestBody StockCountService.Version input,@AuthenticationPrincipal OidcUser user) { return counts.confirm(identities.requireUser(user),businessId,id,input); }
}
