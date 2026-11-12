package com.uselotuz.inventory;

import com.uselotuz.access.AccessService;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
class InventoryService {
    private final AccessService access;
    private final LocationRepository locations;
    InventoryService(AccessService access, LocationRepository locations) { this.access = access; this.locations = locations; }
    @Transactional(readOnly = true)
    public Context context(UUID userId, UUID businessId) {
        String role = access.require(userId, businessId, "inventory", AccessService.Permission.VIEW);
        StockLocation location = requireLocation(businessId);
        return new Context(businessId, role, new Location(location.id(), location.name()));
    }
    @Transactional
    public void renameLocation(UUID userId, UUID businessId, String name) {
        access.require(userId, businessId, "inventory", AccessService.Permission.MANAGE);
        if (name == null || name.isBlank() || name.strip().length() > 200)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name must contain 1–200 characters");
        requireLocation(businessId).rename(name.strip());
    }
    private StockLocation requireLocation(UUID businessId) {
        return locations.findByBusinessId(businessId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Inventory location is not provisioned"));
    }
    record Location(UUID id, String name) {}
    record Context(UUID businessId, String role, Location location) {}
}
