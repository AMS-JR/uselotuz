package com.uselotuz.inventory.catalog;

import java.util.*;
import java.math.BigDecimal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

interface StockMovementRepository extends JpaRepository<StockMovement, UUID> {
    Optional<StockMovement> findByBusinessIdAndItemIdAndLocationIdAndMovementType(UUID business, UUID item, UUID location, String type);
    List<StockMovement> findByBusinessIdAndLocationIdAndItemIdIn(UUID business, UUID location, Collection<UUID> items);
    boolean existsByBusinessIdAndItemId(UUID business, UUID item);
    Optional<StockMovement> findByBusinessIdAndIdempotencyKey(UUID business, UUID key);
    Page<StockMovement> findByBusinessIdAndItemIdAndLocationId(UUID business, UUID item, UUID location, Pageable pageable);
    @Query("select sum(m.quantity) from StockMovement m where m.businessId=:business and m.itemId=:item and m.locationId=:location")
    BigDecimal balance(@Param("business") UUID business, @Param("item") UUID item, @Param("location") UUID location);
}
