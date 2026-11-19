package com.uselotuz.business;

import com.uselotuz.identity.IdentityService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.web.bind.annotation.*;

@RestController
class MembershipManagementController {
    private final MembershipManagementService service;
    private final IdentityService identities;
    MembershipManagementController(MembershipManagementService service, IdentityService identities) { this.service=service; this.identities=identities; }
    @GetMapping("/api/businesses/{business}/membership/members")
    List<MembershipManagementService.Member> members(@PathVariable UUID business,@AuthenticationPrincipal OidcUser user) { return service.members(identities.requireUser(user),business); }
    @GetMapping("/api/businesses/{business}/membership/invitations")
    List<MembershipManagementService.Invitation> invitations(@PathVariable UUID business,@AuthenticationPrincipal OidcUser user) { return service.invitations(identities.requireUser(user),business); }
    @PostMapping("/api/businesses/{business}/membership/invitations")
    @ResponseStatus(HttpStatus.CREATED)
    MembershipManagementService.Created invite(@PathVariable UUID business,@AuthenticationPrincipal OidcUser user,@RequestBody Invite request) { return service.invite(identities.requireUser(user),business,request.email(),request.role(),request.inventoryAccess()); }
    @PostMapping("/api/businesses/{business}/membership/invitations/{id}/revoke")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revoke(@PathVariable UUID business,@PathVariable UUID id,@AuthenticationPrincipal OidcUser user) { service.revoke(identities.requireUser(user),business,id); }
    @PatchMapping("/api/businesses/{business}/membership/members/{member}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void update(@PathVariable UUID business,@PathVariable UUID member,@AuthenticationPrincipal OidcUser user,@RequestBody Change request) { service.update(identities.requireUser(user),business,member,request.role(),request.active(),request.inventoryAccess()); }
    @PostMapping("/api/invitations/accept")
    Map<String,UUID> accept(@AuthenticationPrincipal OidcUser user,@RequestBody Accept request) { return Map.of("businessId",service.accept(identities.requireUser(user),user.getEmail(),Boolean.TRUE.equals(user.getEmailVerified()),request.token())); }
    record Invite(String email,String role,boolean inventoryAccess) {}
    record Change(String role,boolean active,boolean inventoryAccess) {}
    record Accept(String token) {}
}
