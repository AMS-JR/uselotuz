package com.uselotuz.access;

import com.uselotuz.business.BusinessService;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccessService {
    public enum Permission { VIEW, MANAGE }
    private static final Set<String> VIEW_ROLES = Set.of("OWNER", "ADMIN", "STAFF");
    private final BusinessService businesses;
    private final EntitlementRepository entitlements;
    private final ProductAccessRepository access;
    private final String inventoryOrigin;

    public AccessService(BusinessService businesses, EntitlementRepository entitlements,
            ProductAccessRepository access, @Value("${lotuz.frontend-url}") String inventoryOrigin) {
        this.businesses = businesses;
        this.entitlements = entitlements;
        this.access = access;
        this.inventoryOrigin = inventoryOrigin;
    }

    @Transactional(readOnly = true)
    public String require(UUID userId, UUID businessId, String product, Permission permission) {
        businesses.requireMembership(userId, businessId);
        if (!activated(businessId, product)) throw new AccessDeniedException("Product access denied");
        var grant = access.findById(new ProductAccess.Key(businessId, userId, product))
                .filter(ProductAccess::active).orElseThrow(() -> new AccessDeniedException("Product access denied"));
        Set<String> permitted = permission == Permission.MANAGE ? Set.of("OWNER", "ADMIN") : VIEW_ROLES;
        if (!permitted.contains(grant.role())) throw new AccessDeniedException("Permission denied");
        return grant.role();
    }

    @Transactional(readOnly = true)
    public List<ProductView> products(UUID userId, UUID businessId) {
        businesses.requireMembership(userId, businessId);
        boolean active = activated(businessId, "inventory");
        boolean allowed = active && access.findById(new ProductAccess.Key(businessId, userId, "inventory"))
                .filter(ProductAccess::active).filter(g -> VIEW_ROLES.contains(g.role())).isPresent();
        return List.of(new ProductView("inventory", "Lotuz Inventory", active, allowed,
                allowed ? inventoryOrigin + "/?businessId=" + businessId : null));
    }

    private boolean activated(UUID businessId, String product) {
        return entitlements.findById(new Entitlement.Key(businessId, product)).filter(Entitlement::active).isPresent();
    }

    public record ProductView(String code, String name, boolean activated, boolean accessible, String url) {}
}
