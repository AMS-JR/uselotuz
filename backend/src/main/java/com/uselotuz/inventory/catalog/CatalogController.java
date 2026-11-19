package com.uselotuz.inventory.catalog;

import static com.uselotuz.inventory.catalog.CatalogDtos.*;
import com.uselotuz.identity.IdentityService;
import java.util.*;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/businesses/{businessId}/inventory/catalog")
class CatalogController {
    private final CatalogService catalog;
    private final CatalogCsvService csv;
    private final IdentityService identities;
    private final StockService stock;
    CatalogController(CatalogService catalog, CatalogCsvService csv, IdentityService identities, StockService stock) { this.catalog=catalog; this.csv=csv; this.identities=identities; this.stock=stock; }
    @GetMapping("/summary") Summary summary(@PathVariable UUID businessId, @AuthenticationPrincipal OidcUser user) {
        return catalog.summary(identities.requireUser(user),businessId);
    }
    @GetMapping("/items") ItemPage list(@PathVariable UUID businessId, @AuthenticationPrincipal OidcUser user,
            @RequestParam(defaultValue="") String q, @RequestParam(required=false) String type,
            @RequestParam(required=false) UUID categoryId, @RequestParam(defaultValue="active") String status,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="25") int size,
            @RequestParam(required=false) String stockStatus, @RequestParam(required=false) UUID locationId) {
        UUID actor=identities.requireUser(user);
        if(stockStatus!=null) { if(!Set.of("low","out").contains(stockStatus)) throw CatalogService.bad("Invalid stock status"); stock.validateLocation(actor,businessId,locationId); }
        return catalog.list(actor,businessId,q,type,categoryId,status,page,size,stockStatus,locationId);
    }
    @GetMapping("/items/{id}") ItemView item(@PathVariable UUID businessId, @PathVariable UUID id, @AuthenticationPrincipal OidcUser user) {
        return catalog.item(identities.requireUser(user),businessId,id);
    }
    @PostMapping("/items") @ResponseStatus(HttpStatus.CREATED)
    ItemView createItem(@PathVariable UUID businessId, @AuthenticationPrincipal OidcUser user, @RequestBody ItemInput input) {
        return catalog.saveItem(identities.requireUser(user),businessId,null,input);
    }
    @PutMapping("/items/{id}") ItemView updateItem(@PathVariable UUID businessId, @PathVariable UUID id, @AuthenticationPrincipal OidcUser user, @RequestBody ItemInput input) {
        return catalog.saveItem(identities.requireUser(user),businessId,id,input);
    }
    @PostMapping("/items/{id}/archive") @ResponseStatus(HttpStatus.NO_CONTENT)
    void archiveItem(@PathVariable UUID businessId, @PathVariable UUID id, @AuthenticationPrincipal OidcUser user) { catalog.archiveItem(identities.requireUser(user),businessId,id); }
    @GetMapping("/categories") List<CategoryView> categories(@PathVariable UUID businessId, @AuthenticationPrincipal OidcUser user) { return catalog.categories(identities.requireUser(user),businessId); }
    @PostMapping("/categories") @ResponseStatus(HttpStatus.CREATED)
    CategoryView createCategory(@PathVariable UUID businessId, @AuthenticationPrincipal OidcUser user, @RequestBody CategoryInput input) { return catalog.saveCategory(identities.requireUser(user),businessId,null,input); }
    @PutMapping("/categories/{id}") CategoryView updateCategory(@PathVariable UUID businessId, @PathVariable UUID id, @AuthenticationPrincipal OidcUser user, @RequestBody CategoryInput input) { return catalog.saveCategory(identities.requireUser(user),businessId,id,input); }
    @PostMapping("/categories/{id}/archive") @ResponseStatus(HttpStatus.NO_CONTENT)
    void archiveCategory(@PathVariable UUID businessId, @PathVariable UUID id, @AuthenticationPrincipal OidcUser user) { catalog.archiveCategory(identities.requireUser(user),businessId,id); }
    @GetMapping("/suppliers") List<SupplierView> suppliers(@PathVariable UUID businessId, @AuthenticationPrincipal OidcUser user) { return catalog.suppliers(identities.requireUser(user),businessId); }
    @GetMapping("/suppliers/{id}") SupplierView supplier(@PathVariable UUID businessId, @PathVariable UUID id, @AuthenticationPrincipal OidcUser user) {
        return catalog.suppliers(identities.requireUser(user),businessId).stream().filter(s -> s.id().equals(id)).findFirst().orElseThrow(CatalogService::missing);
    }
    @PostMapping("/suppliers") @ResponseStatus(HttpStatus.CREATED)
    SupplierView createSupplier(@PathVariable UUID businessId, @AuthenticationPrincipal OidcUser user, @RequestBody SupplierInput input) { return catalog.saveSupplier(identities.requireUser(user),businessId,null,input); }
    @PutMapping("/suppliers/{id}") SupplierView updateSupplier(@PathVariable UUID businessId, @PathVariable UUID id, @AuthenticationPrincipal OidcUser user, @RequestBody SupplierInput input) { return catalog.saveSupplier(identities.requireUser(user),businessId,id,input); }
    @PostMapping("/suppliers/{id}/archive") @ResponseStatus(HttpStatus.NO_CONTENT)
    void archiveSupplier(@PathVariable UUID businessId, @PathVariable UUID id, @AuthenticationPrincipal OidcUser user) { catalog.archiveSupplier(identities.requireUser(user),businessId,id); }
    @GetMapping("/units") List<UnitView> units(@PathVariable UUID businessId, @AuthenticationPrincipal OidcUser user) {
        catalog.authorize(identities.requireUser(user),businessId,false);
        return Arrays.stream(MeasurementUnit.values()).map(u -> new UnitView(u.name(),u.dimension)).toList();
    }
    record UnitView(String code, String dimension) {}
    @PostMapping(value="/import", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    CatalogCsvService.ImportResult importCsv(@PathVariable UUID businessId, @AuthenticationPrincipal OidcUser user, @RequestParam MultipartFile file) {
        return csv.importCsv(identities.requireUser(user),businessId,file);
    }
    @GetMapping(value="/export", produces="text/csv") ResponseEntity<byte[]> export(@PathVariable UUID businessId, @AuthenticationPrincipal OidcUser user) {
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=lotuz-catalog.csv")
                .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8")).body(csv.exportCsv(identities.requireUser(user),businessId));
    }
    @GetMapping(value="/template", produces="text/csv") String template(@PathVariable UUID businessId, @AuthenticationPrincipal OidcUser user) {
        catalog.authorize(identities.requireUser(user),businessId,false); return CatalogCsvService.HEADER+"\r\n";
    }
}
