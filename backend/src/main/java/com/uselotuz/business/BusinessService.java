package com.uselotuz.business;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class BusinessService {
    private final BusinessRepository businesses;
    private final MembershipRepository memberships;

    public BusinessService(BusinessRepository businesses, MembershipRepository memberships) {
        this.businesses = businesses;
        this.memberships = memberships;
    }

    @Transactional(readOnly = true)
    public List<BusinessView> list(UUID userId) {
        return businesses.findForUser(userId).stream().map(b -> new BusinessView(b.id(), b.name())).toList();
    }

    @Transactional
    public BusinessView create(UUID userId, String name) {
        var business = businesses.saveAndFlush(new Business(UUID.randomUUID(), validName(name)));
        memberships.save(new Membership(business.id(), userId, "OWNER"));
        // Business creation deliberately has no dependency on Inventory or product entitlements.
        return new BusinessView(business.id(), business.name());
    }

    @Transactional(readOnly = true)
    public Details details(UUID userId, UUID businessId) {
        Membership membership = membership(userId, businessId);
        Business business = businesses.findById(businessId).orElseThrow();
        return new Details(business.id(), business.name(), membership.role(), canManage(membership.role()));
    }

    @Transactional
    public void rename(UUID userId, UUID businessId, String name) {
        if (!canManage(membership(userId, businessId).role())) throw new AccessDeniedException("Business management denied");
        businesses.findById(businessId).orElseThrow().rename(validName(name));
    }

    @Transactional(readOnly = true)
    public List<MemberView> members(UUID userId, UUID businessId) {
        Membership membership = membership(userId, businessId);
        if (!canManage(membership.role())) {
            return List.of(new MemberView(userId, membership.role()));
        }
        return memberships.findByIdBusinessIdAndActiveTrueOrderByIdUserId(businessId).stream()
                .map(m -> new MemberView(m.userId(), m.role())).toList();
    }

    @Transactional(readOnly = true)
    public void requireMembership(UUID userId, UUID businessId) {
        membership(userId, businessId);
    }

    private Membership membership(UUID userId, UUID businessId) {
        return memberships.findById(new Membership.Key(businessId, userId)).filter(Membership::active)
                .orElseThrow(() -> new AccessDeniedException("Business access denied"));
    }

    private boolean canManage(String role) {
        return Set.of("OWNER", "ADMIN").contains(role);
    }

    private String validName(String name) {
        if (name == null || name.isBlank() || name.strip().length() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Business name must contain 1–200 characters");
        }
        return name.strip();
    }

    public record BusinessView(UUID id, String name) {}
    public record Details(UUID id, String name, String role, boolean canManage) {}
    public record MemberView(UUID userId, String role) {}
}
