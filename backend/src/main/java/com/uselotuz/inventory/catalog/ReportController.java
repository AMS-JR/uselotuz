package com.uselotuz.inventory.catalog;

import com.uselotuz.identity.IdentityService;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

@RestController
@RequestMapping("/api/businesses/{businessId}/inventory/reports")
class ReportController {
    private final ReportService reports; private final IdentityService identities;
    ReportController(ReportService reports, IdentityService identities) { this.reports=reports; this.identities=identities; }
    @GetMapping({"/stock","/movements","/summary"})
    Object get(@PathVariable UUID businessId, @RequestParam UUID locationId, @RequestParam(defaultValue="") String q, @RequestParam(required=false) String type, @RequestParam(required=false) UUID categoryId, @RequestParam(required=false) String status, @RequestParam(required=false) String movementType, @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from, @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to, @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="25") int size, @AuthenticationPrincipal OidcUser principal, jakarta.servlet.http.HttpServletRequest request) {
        UUID user=identities.requireUser(principal); LocalDate today=LocalDate.now(ZoneOffset.UTC);
        var filter=reports.validate(user,businessId,locationId,q,type,categoryId,status,from==null?today.minusDays(29):from,to==null?today:to,movementType);
        String path=request.getRequestURI();
        if(path.endsWith("/summary")) return reports.summary(user,filter);
        boolean movements=path.contains("/movements");
        return movements?reports.movements(filter,page,size):reports.current(filter,page,size);
    }
    @GetMapping({"/stock/export","/movements/export"})
    ResponseEntity<StreamingResponseBody> export(@PathVariable UUID businessId, @RequestParam UUID locationId, @RequestParam(defaultValue="") String q, @RequestParam(required=false) String type, @RequestParam(required=false) UUID categoryId, @RequestParam(required=false) String status, @RequestParam(required=false) String movementType, @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from, @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to, @AuthenticationPrincipal OidcUser principal, jakarta.servlet.http.HttpServletRequest request) {
        UUID user=identities.requireUser(principal); LocalDate today=LocalDate.now(ZoneOffset.UTC);
        var filter=reports.validate(user,businessId,locationId,q,type,categoryId,status,from==null?today.minusDays(29):from,to==null?today:to,movementType);
        boolean movements=request.getRequestURI().contains("/movements");
        StreamingResponseBody body=output -> reports.export(filter,movements,output);
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=lotuz-"+(movements?"movements":"stock")+"-report.csv").contentType(MediaType.parseMediaType("text/csv;charset=UTF-8")).body(body);
    }
}
