package com.uselotuz.inventory.catalog;
import com.uselotuz.identity.IdentityService;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/businesses/{businessId}/inventory/reorder")
class ReorderController {
    private final ReorderService reorder;
    private final IdentityService identities;
    ReorderController(ReorderService reorder, IdentityService identities) { this.reorder=reorder; this.identities=identities; }
    @GetMapping ReorderService.Result list(@PathVariable UUID businessId, @RequestParam UUID locationId, @RequestParam(defaultValue="") String q, @RequestParam(required=false) String type, @RequestParam(required=false) UUID supplierId, @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="25") int size, @AuthenticationPrincipal OidcUser user) {
        return reorder.list(identities.requireUser(user),businessId,locationId,q,type,supplierId,page,size);
    }
    @GetMapping(value="/export",produces="text/csv") ResponseEntity<byte[]> export(@PathVariable UUID businessId, @RequestParam UUID locationId, @RequestParam(defaultValue="") String q, @RequestParam(required=false) String type, @RequestParam(required=false) UUID supplierId, @AuthenticationPrincipal OidcUser user) {
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=lotuz-reorder.csv").contentType(MediaType.parseMediaType("text/csv;charset=UTF-8")).body(reorder.export(identities.requireUser(user),businessId,locationId,q,type,supplierId));
    }
    @PutMapping("/{itemId}/plan") @ResponseStatus(HttpStatus.NO_CONTENT)
    void plan(@PathVariable UUID businessId, @PathVariable UUID itemId, @RequestBody ReorderService.PlanInput input, @AuthenticationPrincipal OidcUser user) { reorder.setPlan(identities.requireUser(user),businessId,itemId,input); }
}
