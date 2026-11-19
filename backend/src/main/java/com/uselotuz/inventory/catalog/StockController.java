package com.uselotuz.inventory.catalog;

import com.uselotuz.identity.IdentityService;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/businesses/{businessId}/inventory/stock")
class StockController {
    private final StockService stock;
    private final IdentityService identities;
    StockController(StockService stock, IdentityService identities) { this.stock=stock; this.identities=identities; }
    @GetMapping("/alerts") StockService.Alerts alerts(@PathVariable UUID businessId, @RequestParam UUID locationId, @AuthenticationPrincipal OidcUser user) {
        return stock.alerts(identities.requireUser(user),businessId,locationId);
    }
    @PutMapping("/{itemId}/threshold") StockService.State threshold(@PathVariable UUID businessId, @PathVariable UUID itemId, @RequestBody StockService.ThresholdInput input, @AuthenticationPrincipal OidcUser user) {
        return stock.setThreshold(identities.requireUser(user),businessId,itemId,input);
    }
    @GetMapping StockService.State get(@PathVariable UUID businessId, @RequestParam UUID itemId, @RequestParam UUID locationId, @AuthenticationPrincipal OidcUser user) {
        return stock.get(identities.requireUser(user),businessId,itemId,locationId);
    }
    @GetMapping("/batch") List<StockService.State> list(@PathVariable UUID businessId, @RequestParam UUID locationId, @RequestParam List<UUID> itemIds, @AuthenticationPrincipal OidcUser user) {
        return stock.list(identities.requireUser(user),businessId,locationId,itemIds);
    }
    @PostMapping("/{itemId}/opening") @ResponseStatus(HttpStatus.CREATED)
    StockService.State open(@PathVariable UUID businessId, @PathVariable UUID itemId, @RequestBody StockService.Opening input, @AuthenticationPrincipal OidcUser user) {
        return stock.open(identities.requireUser(user),businessId,itemId,input);
    }
    @PostMapping("/{itemId}/receipts") @ResponseStatus(HttpStatus.CREATED)
    StockService.ReceiptView receive(@PathVariable UUID businessId, @PathVariable UUID itemId, @RequestBody StockService.Receipt input, @AuthenticationPrincipal OidcUser user) {
        return stock.receive(identities.requireUser(user),businessId,itemId,input);
    }
    @PostMapping("/{itemId}/adjustments") @ResponseStatus(HttpStatus.CREATED)
    StockService.AdjustmentView adjust(@PathVariable UUID businessId, @PathVariable UUID itemId, @RequestBody StockService.Adjustment input, @AuthenticationPrincipal OidcUser user) {
        return stock.adjust(identities.requireUser(user),businessId,itemId,input);
    }
    @PostMapping("/{itemId}/consumption") @ResponseStatus(HttpStatus.CREATED)
    StockService.ConsumptionView consume(@PathVariable UUID businessId, @PathVariable UUID itemId, @RequestBody StockService.Consumption input, @AuthenticationPrincipal OidcUser user) {
        return stock.consume(identities.requireUser(user),businessId,itemId,input);
    }
    @GetMapping("/{itemId}/movements")
    StockService.History history(@PathVariable UUID businessId, @PathVariable UUID itemId, @RequestParam UUID locationId, @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="25") int size, @AuthenticationPrincipal OidcUser user) {
        return stock.history(identities.requireUser(user),businessId,itemId,locationId,page,size);
    }
}
